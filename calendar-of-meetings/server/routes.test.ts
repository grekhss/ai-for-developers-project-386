// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { createMeetingTypesRepository } from './meeting-types-repository.js';
import { createRepository } from './repository.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import { requireRole, requireSession, SESSION_COOKIE, sessionCookieOptions } from './session.js';

// Known credentials для интеграционных тестов: createApp принимает их явно,
// окружение не трогаем (D1: тесты инжектируют через AppOptions).
const AUTH = {
  adminPassword: 'admin-secret',
  guestPassword: 'guest-secret',
  sessionSecret: 'sign-me',
} as const;

function repos() {
  const db = createDatabase(':memory:');
  return {
    meetings: createRepository(db),
    meetingTypes: createMeetingTypesRepository(db),
  };
}

// Интеграция собирается как в проде: createApp(createRepository(':memory:')).
// Через index.ts не ходим — он биндит порт и открывает файловую БД.
// Все /api за requireSession, поэтому сразу логинимся админом и отдаём cookie.
async function createTestApp(): Promise<{ baseUrl: string; adminCookie: string }> {
  const app = createApp(repos(), { ...AUTH });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const login = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: AUTH.adminPassword }),
  });
  if (login.status !== 200) throw new Error('setup: админ-логин не прошёл');
  const [setCookie] = login.headers.getSetCookie();
  const adminCookie = setCookie.split(';')[0];

  return { baseUrl, adminCookie };
}

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

function postMeeting(
  baseUrl: string,
  adminCookie: string,
  body: unknown,
  headers?: Record<string, string>,
) {
  return fetch(`${baseUrl}/api/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie, ...headers },
    body: JSON.stringify(body),
  });
}

/** GET-запрос meetings уже с админ-сессией. */
function getMeetings(baseUrl: string, adminCookie: string, query = '?from=2026-01-01&to=2026-12-31') {
  return fetch(`${baseUrl}/api/meetings${query}`, { headers: { Cookie: adminCookie } });
}

describe('createApp: валидация auth-конфига', () => {
  const valid = { adminPassword: 'admin-secret', guestPassword: 'guest-secret', sessionSecret: 'sign-me' };

  it('падает, когда пароли совпадают — роль не определить', () => {
    expect(() => createApp(repos(), { ...valid, guestPassword: valid.adminPassword })).toThrow(/не должны совпадать/);
  });

  it('падает на пустом или «пробельном» пароле/секрете', () => {
    for (const key of ['adminPassword', 'guestPassword', 'sessionSecret'] as const) {
      for (const value of ['', '   ']) {
        expect(() => createApp(repos(), { ...valid, [key]: value })).toThrow(/обязательны/);
      }
      expect(() => createApp(repos(), { ...valid, [key]: undefined })).toThrow(/обязательны/);
    }
  });
});

describe('routes /api/auth', () => {
  function login(baseUrl: string, body: unknown) {
    return fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('POST /api/login верным админ-паролем выдаёт сессию admin', async () => {
    const { baseUrl } = await createTestApp();
    const response = await login(baseUrl, { password: AUTH.adminPassword });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'admin', bookerName: null });

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    // Подпись: cookie-parser несёт значение вида s:<payload>.<signature>.
    expect(setCookie).toMatch(/session=s%3A/);
  });

  it('POST /api/login гостевым паролем требует bookerName и обрезает пробелы', async () => {
    const { baseUrl } = await createTestApp();
    const response = await login(baseUrl, { password: AUTH.guestPassword, bookerName: '  Иван  ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'guest', bookerName: 'Иван' });
  });

  it('POST /api/login гостем без или с пустым bookerName отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    for (const body of [
      { password: AUTH.guestPassword },
      { password: AUTH.guestPassword, bookerName: '' },
      { password: AUTH.guestPassword, bookerName: '   ' },
    ]) {
      expect((await login(baseUrl, body)).status, `тело ${JSON.stringify(body)}`).toBe(400);
    }
  });

  it('POST /api/login отклоняет тело, не проходящее формат пароля', async () => {
    const { baseUrl } = await createTestApp();
    // Отдельно от «неверного пароля» (401): это отказ ФОРМАТА, а не аутентикации.
    // '   ' ловит регресс на @pattern("\\S") — раньше сервер резал trim() вручную,
    // и правило могло уехать из схемы, оставшись только в routes.ts.
    for (const body of [
      { password: '   ' },
      { password: 123 },
      { password: AUTH.adminPassword, bookerName: 42 },
    ]) {
      const response = await login(baseUrl, body as never);
      expect(response.status, `тело ${JSON.stringify(body)}`).toBe(400);
      expect(await response.json()).toEqual({
        error: 'password обязателен, bookerName — непустая строка',
      });
    }
  });

  it('POST /api/login неверным паролем отвечает 401 без cookie', async () => {
    const { baseUrl } = await createTestApp();
    const response = await login(baseUrl, { password: 'nope', bookerName: 'Иван' });
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('GET /api/me отдаёт роль по сессии и 401 без неё', async () => {
    const { baseUrl, adminCookie } = await createTestApp();

    const me = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: adminCookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ role: 'admin', bookerName: null });

    expect((await fetch(`${baseUrl}/api/me`)).status).toBe(401);
  });

  it('POST /api/logout сбрасывает cookie, следующий запрос — 401', async () => {
    const { baseUrl, adminCookie } = await createTestApp();

    const logout = await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    expect(logout.status).toBe(204);
    const cleared = logout.headers.get('set-cookie') ?? '';
    // cookie уходит пустой значением с истёкшим Expires — то же path/secure.
    expect(cleared).toContain('session=;');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);

    // Сервер не может отозвать подписанную cookie — «после выхода» = браузер
    // выбросил очищенную cookie, и следующий запрос идёт без неё.
    expect((await fetch(`${baseUrl}/api/me`)).status).toBe(401);
  });
});

describe('requireRole: ролевой гейт (изолированный probe; на роутах — S3/S4)', () => {
  // Probe-приложение: один роут за requireSession + requireRole('admin') — так
  // middleware проверяется отдельно от логики конкретных роутов; интеграционные
  // проверки гейта на реальных ручках живут в describe о /api/meeting-types (S3).
  async function createProbe(): Promise<{ baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use(cookieParser(AUTH.sessionSecret));
    const router = express.Router();
    router.post('/api/login', (req, res) => {
      const password = (req.body as { password?: string }).password;
      const session =
        password === AUTH.adminPassword
          ? { role: 'admin', bookerName: null }
          : { role: 'guest', bookerName: 'Иван' };
      res.cookie(SESSION_COOKIE, JSON.stringify(session), sessionCookieOptions());
      res.json(session);
    });
    router.get('/api/admin-only', requireSession, requireRole('admin'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(router);

    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${port}` };
  }

  async function probeLogin(baseUrl: string, password: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const [setCookie] = response.headers.getSetCookie();
    return setCookie.split(';')[0];
  }

  it('пропускает админа, отклоняет гостя (403) и без сессии (401)', async () => {
    const { baseUrl } = await createProbe();

    const admin = await probeLogin(baseUrl, AUTH.adminPassword);
    expect((await fetch(`${baseUrl}/api/admin-only`, { headers: { Cookie: admin } })).status).toBe(200);

    const guest = await probeLogin(baseUrl, AUTH.guestPassword);
    expect((await fetch(`${baseUrl}/api/admin-only`, { headers: { Cookie: guest } })).status).toBe(403);

    expect((await fetch(`${baseUrl}/api/admin-only`)).status).toBe(401);
  });
});

describe('routes /api/meeting-types (за requireSession, S3)', () => {
  /** Гостевая cookie: login отдаёт её тем же порядком, что и админская. */
  async function guestCookie(baseUrl: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: AUTH.guestPassword, bookerName: 'Иван' }),
    });
    if (response.status !== 200) throw new Error('setup: гостевой логин не прошёл');
    const [setCookie] = response.headers.getSetCookie();
    return setCookie.split(';')[0];
  }

  function getTypes(baseUrl: string, cookie?: string) {
    return fetch(`${baseUrl}/api/meeting-types`, {
      headers: cookie === undefined ? undefined : { Cookie: cookie },
    });
  }

  function postType(baseUrl: string, cookie: string | undefined, body: unknown, path = '/api/meeting-types') {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie === undefined ? {} : { Cookie: cookie }),
      },
      body: JSON.stringify(body),
    });
  }

  it('все три ручки без сессии отвечают 401', async () => {
    const { baseUrl } = await createTestApp();

    expect((await getTypes(baseUrl)).status).toBe(401);
    expect((await postType(baseUrl, undefined, { name: 'X', description: '' })).status).toBe(401);
    // requireSession стоит до requireRole: без сессии — 401, а не 403.
    expect((await postType(baseUrl, undefined, {}, '/api/meeting-types/1/deactivate')).status).toBe(401);
  });

  it('список без типов — пустой массив, а не объект-обёртка', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await getTypes(baseUrl, adminCookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('админ видит все типы, гость — только активные', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });
    await postType(baseUrl, adminCookie, { name: 'Собеседование', description: '' });
    await postType(baseUrl, adminCookie, {}, '/api/meeting-types/1/deactivate');

    const adminResponse = await getTypes(baseUrl, adminCookie);
    expect(await adminResponse.json()).toEqual([
      { id: '1', name: 'Консультация', description: '', active: false },
      { id: '2', name: 'Собеседование', description: '', active: true },
    ]);

    // Гость: деактивированный тип не попадает в список (Q7).
    const guest = await getTypes(baseUrl, await guestCookie(baseUrl));
    expect(await guest.json()).toEqual([
      { id: '2', name: 'Собеседование', description: '', active: true },
    ]);
  });

  it('POST админом создаёт активный тип и обрезает имя', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await postType(baseUrl, adminCookie, {
      name: '  Консультация  ',
      description: '30 минут',
    });

    expect(response.status).toBe(201);
    // Имя обрезано — как bookerName при логине; новый тип всегда активен.
    expect(await response.json()).toEqual({
      id: '1',
      name: 'Консультация',
      description: '30 минут',
      active: true,
    });
  });

  it('POST гостем отвечает 403', async () => {
    const { baseUrl } = await createTestApp();
    const response = await postType(baseUrl, await guestCookie(baseUrl), {
      name: 'Консультация',
      description: '',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'недостаточно прав' });
  });

  it('POST невалидного тела отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const invalidBodies = [
      {},
      { name: 'Консультация' }, // нет description — он обязателен в контракте
      { description: '' }, // нет name
      { name: '', description: '' }, // пустое имя (@minLength)
      { name: '   ', description: '' }, // одно пробельное имя — @pattern("\\S") в main.tsp
      { name: 42, description: '' },
      { name: 'Консультация', description: null },
      // Случай не-объекта (голая JSON-строка и т.п.) не включён: strict-режим
      // express.json отклоняет его ещё на парсинге (400 от body-parser, HTML) —
      // этот путь уже покрыт в meetings-тесте.
    ];

    for (const body of invalidBodies) {
      const response = await postType(baseUrl, adminCookie, body);
      expect(response.status, `тело ${JSON.stringify(body)}`).toBe(400);
      expect(await response.json(), `тело ${JSON.stringify(body)}`).toEqual({
        error: 'name обязателен (непустая строка), description — строка',
      });
    }
  });

  it('деактивация админом: 200 с active: false, повтор идемпотентен', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });

    const first = await postType(baseUrl, adminCookie, {}, '/api/meeting-types/1/deactivate');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      id: '1',
      name: 'Консультация',
      description: '',
      active: false,
    });

    // В контракте нет ни 404, ни 409: повторная деактивация — 200, состояние прежнее (Q7).
    const second = await postType(baseUrl, adminCookie, {}, '/api/meeting-types/1/deactivate');
    expect(second.status).toBe(200);
    const repeated = (await second.json()) as { active: boolean };
    expect(repeated.active).toBe(false);
  });

  it('деактивация гостем отвечает 403', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });

    const response = await postType(
      baseUrl,
      await guestCookie(baseUrl),
      {},
      '/api/meeting-types/1/deactivate',
    );
    expect(response.status).toBe(403);
  });

  it('деактивация неизвестного или нечислового id отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postType(baseUrl, adminCookie, { name: 'Консультация', description: '' });

    for (const id of ['999', 'abc']) {
      const response = await postType(baseUrl, adminCookie, {}, `/api/meeting-types/${id}/deactivate`);
      expect(response.status, `id ${id}`).toBe(400);
      expect(await response.json(), `id ${id}`).toEqual({ error: 'тип встречи не найден' });
    }
    // Существующий тип при этом не тронут.
    const types = await getTypes(baseUrl, adminCookie);
    expect(((await types.json()) as Array<{ active: boolean }>)[0]?.active).toBe(true);
  });
});

describe('routes /api/meetings (за requireSession)', () => {
  it('без сессии отвечает 401', async () => {
    const { baseUrl } = await createTestApp();
    const response = await fetch(`${baseUrl}/api/meetings?from=2026-01-01&to=2026-12-31`);
    expect(response.status).toBe(401);
  });

  it('с подделанной cookie отвечает 401', async () => {
    const { baseUrl } = await createTestApp();
    // Меняем подпись, оставляя правдоподобный payload: cookie-parser при
    // несовпадении сигнатуры отдаёт signedCookies=false, а не строку.
    const forged = `session=s%3A${Buffer.from(JSON.stringify({ role: 'admin', bookerName: null })).toString('base64url')}.deadbeef`;
    const response = await fetch(`${baseUrl}/api/meetings?from=2026-01-01&to=2026-12-31`, {
      headers: { Cookie: forged },
    });
    expect(response.status).toBe(401);
  });

  it('GET возвращает пустой список', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await getMeetings(baseUrl, adminCookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('POST принимает JSON и отвечает 201 с id строкой', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await postMeeting(baseUrl, adminCookie, { date: '2026-03-02', time: '09:00' });
    expect(response.status).toBe(201);
    const meeting = (await response.json()) as Record<string, unknown>;
    expect(meeting).toEqual({ id: '1', date: '2026-03-02', time: '09:00' });
    expect(typeof meeting.id).toBe('string');
  });

  it('POST дубля слота отвечает 409', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const body = { date: '2026-03-02', time: '09:00' };

    expect((await postMeeting(baseUrl, adminCookie, body)).status).toBe(201);
    // Второй POST того же слота отклоняется сервером, а не UI.
    expect((await postMeeting(baseUrl, adminCookie, body)).status).toBe(409);
  });

  it('POST без Content-Type: application/json отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    // express.json() не парсит text/plain: req.body в Express 5 остаётся
    // undefined. Без заголовка каждый POST вернул бы 400.
    const response = await postMeeting(
      baseUrl,
      adminCookie,
      { date: '2026-03-02', time: '09:00' },
      { 'Content-Type': 'text/plain' },
    );
    expect(response.status).toBe(400);
  });

  it('POST невалидного тела отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const invalidBodies = [
      {},
      { date: '2026-03-02' },
      { date: '2026-03-02', time: '9:00' },
      { date: '02.03.2026', time: '09:00' },
      { date: '2026-03-02', time: '24:00' },
      { date: null, time: '09:00' },
      { date: 20260302, time: '09:00' },
      'not an object',
    ];

    for (const body of invalidBodies) {
      // `message` в expect — это контекст провала: без него Vitest не скажет,
      // какое из тел не получил 400, и в цикле из семи это квест на угадывание.
      expect((await postMeeting(baseUrl, adminCookie, body)).status, `тело ${JSON.stringify(body)}`).toBe(400);
    }
  });

  it('GET без from/to отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await getMeetings(baseUrl, adminCookie, '');
    expect(response.status).toBe(400);
  });

  it('GET с повторённым параметром отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    // Express 5 склеивает повтор в массив, а схема ждёт строку. Это отдельный
    // сценарий от «пустого» query: без него регрессия на массивах не поймана.
    const response = await getMeetings(baseUrl, adminCookie, '?from=2026-01-01&from=2026-01-02&to=2026-12-31');
    expect(response.status).toBe(400);
  });

  it('GET с невалидным from/to отвечает 400', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    const response = await getMeetings(baseUrl, adminCookie, '?from=01-01-2026&to=2026-12-31');
    expect(response.status).toBe(400);
  });

  it('GET фильтрует по диапазону и сортирует по (date, time)', async () => {
    const { baseUrl, adminCookie } = await createTestApp();
    await postMeeting(baseUrl, adminCookie, { date: '2026-01-02', time: '10:00' });
    await postMeeting(baseUrl, adminCookie, { date: '2026-01-01', time: '11:00' });
    await postMeeting(baseUrl, adminCookie, { date: '2027-01-01', time: '09:00' });

    const response = await getMeetings(baseUrl, adminCookie);
    expect(await response.json()).toEqual([
      { id: '2', date: '2026-01-01', time: '11:00' },
      { id: '1', date: '2026-01-02', time: '10:00' },
    ]);
  });
});