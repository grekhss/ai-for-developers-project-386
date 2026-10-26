// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Database from 'better-sqlite3';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { createMeetingTypesRepository } from './meeting-types-repository.js';
import { createRepository } from './repository.js';

function repos() {
  const db = createDatabase(':memory:');
  return {
    db,
    meetings: createRepository(db),
    meetingTypes: createMeetingTypesRepository(db),
  };
}

// Интеграция собирается как в проде: createApp(createRepository(':memory:')).
// Через index.ts не ходим — он биндит порт и открывает файловую БД.
// Все /api за requireSession, поэтому сразу логинимся админом и отдаём cookie.
async function createTestApp(): Promise<{
  baseUrl: string;
  /** Той же БД владеет приложение: S5 читает колонки meetings напрямую. */
  db: Database.Database;
}> {
  const repositorySet = repos();
  const app = createApp(repositorySet);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return { baseUrl, db: repositorySet.db as any };
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
  cookie: string,
  body: unknown,
  headers?: Record<string, string>,
) {
  return fetch(`${baseUrl}/api/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    body: JSON.stringify(body),
  });
}

/** GET-запрос meetings уже с админ-сессией. */
function getMeetings(baseUrl: string, cookie: string = 'role=admin', query = '?from=2026-01-01&to=2026-12-31') {
  return fetch(`${baseUrl}/api/meetings${query}`, { headers: { Cookie: cookie } });
}

/**
 * Гостевая cookie. Записи создаёт только гость — в его сессии есть имя,
 * у админа bookerName null и POST /api/meetings отвечает 400 (Q12c, S5).
 */
async function loginAsGuest(baseUrl: string, bookerName = 'Иван'): Promise<string> {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'guest-secret', bookerName }),
  });
  if (response.status !== 200) throw new Error('setup: гостевой логин не прошёл');
  const [setCookie] = response.headers.getSetCookie();
  return setCookie.split(';')[0];
}

/**
 * 'YYYY-MM-DD' в локальной зоне, сдвинутый на offsetDays. Рекомпозиция «сегодня»
 * независимо от server/date.ts (T3): тест сдвигает границу сам, а не читает
 * готовое значение проверяемого кода.
 */
function localDate(offsetDays: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Будний ли день — той же арифметикой, что booking-rules (тест выбирает даты). */
function isWeekendDay(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Будний день окна записи: от offsetDays (не раньше завтра — сегодня «время уже
 * прошло» зависит от часа запуска) до первого буднего. В 14 днях всегда есть
 * будни, поэтому бросок здесь — ошибка самого теста.
 */
function bookableDay(offsetDays: number): string {
  for (let offset = Math.max(1, offsetDays); offset < 14; offset += 1) {
    if (!isWeekendDay(localDate(offset))) return localDate(offset);
  }
  throw new Error('в окне записи нет будних дней');
}

/** Выходной в окне записи — для негативной проверки правила будней. */
function weekendInWindow(offsetDays: number): string {
  for (let offset = Math.max(1, offsetDays); offset < 14; offset += 1) {
    if (isWeekendDay(localDate(offset))) return localDate(offset);
  }
  throw new Error('в окне записи нет выходных');
}

/** Будний день за окном записи — правило окна проверяется на нём, а не на выходном. */
function weekdayBeyondWindow(): string {
  for (let offset = 14; offset < 21; offset += 1) {
    if (!isWeekendDay(localDate(offset))) return localDate(offset);
  }
  throw new Error('за окном записи нет будних дней');
}

/** POST /api/meeting-types: cookie опциональна — так проверяется 401 без сессии. */
function postType(
  baseUrl: string,
  cookie: string | undefined,
  body: unknown,
  path = '/api/meeting-types',
) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify(body),
  });
}

describe('routes /api/meeting-types', () => {
  function getTypes(baseUrl: string, cookie?: string) {
    return fetch(`${baseUrl}/api/meeting-types`, {
      headers: cookie === undefined ? undefined : { Cookie: cookie },
    });
  }

  it('все три ручки без сессии отвечают 401', async () => {
    const { baseUrl } = await createTestApp();

    expect((await getTypes(baseUrl, 'role=guest')).status).toBe(200);
    expect((await postType(baseUrl, undefined, { name: 'X', description: '' })).status).toBe(401);
    // requireSession стоит до requireRole: без сессии — 401, а не 403.
    expect((await postType(baseUrl, undefined, {}, '/api/meeting-types/1/deactivate')).status).toBe(401);
  });

  it('список без типов — пустой массив, а не объект-обёртка', async () => {
    const { baseUrl } = await createTestApp();
    const response = await getTypes(baseUrl, 'role=admin');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('админ видит все типы, гость — только активные', async () => {
    const { baseUrl } = await createTestApp();
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '', duration_minutes: 30 });
    await postType(baseUrl, 'role=admin', { name: 'Собеседование', description: '', duration_minutes: 60 });
    await postType(baseUrl, 'role=admin', {}, '/api/meeting-types/1/deactivate');

    const adminResponse = await getTypes(baseUrl, 'role=admin');
    expect(await adminResponse.json()).toEqual([
      { id: '1', name: 'Консультация', description: '', duration_minutes: 30, active: false },
      { id: '2', name: 'Собеседование', description: '', duration_minutes: 60, active: true },
    ]);

    // Гость: деактивированный тип не попадает в список (Q7).
    const guest = await getTypes(baseUrl, 'role=guest');
    expect(await guest.json()).toEqual([
      { id: '2', name: 'Собеседование', description: '', duration_minutes: 60, active: true },
    ]);
  });

  it('POST админом создаёт активный тип и обрезает имя', async () => {
    const { baseUrl } = await createTestApp();
    const response = await postType(baseUrl, 'role=admin', {
      name: '  Консультация  ',
      description: '30 минут',
      duration_minutes: 30,
    });

    expect(response.status).toBe(201);
    // Имя обрезано — как bookerName при логине; новый тип всегда активен.
    expect(await response.json()).toEqual({
      id: '1',
      name: 'Консультация',
      description: '30 минут',
      duration_minutes: 30,
      active: true,
    });
  });

  it('POST гостем отвечает 403', async () => {
    const { baseUrl } = await createTestApp();
    const response = await postType(baseUrl, 'role=guest', {
      name: 'Консультация',
      description: '',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'недостаточно прав' });
  });

  it('POST невалидного тела отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const invalidBodies = [
      {},
      { name: 'Консультация' }, // нет description и duration_minutes
      { description: '' }, // нет name
      { name: 'X', description: '' }, // нет duration_minutes — обязателен в контракте
      { name: '', description: '', duration_minutes: 30 }, // пустое имя (@minLength)
      { name: '   ', description: '', duration_minutes: 30 }, // пробельное имя — @pattern("\\S") в main.tsp
      { name: 42, description: '', duration_minutes: 30 },
      { name: 'Консультация', description: null, duration_minutes: 30 },
      { name: 'X', description: '', duration_minutes: 29 }, // ниже @minValue(30)
      { name: 'X', description: '', duration_minutes: 181 }, // выше @maxValue(180)
      { name: 'X', description: '', duration_minutes: '30' }, // строка вместо int32
      // Случай не-объекта (голая JSON-строка и т.п.) не включён: strict-режим
      // express.json отклоняет его ещё на парсинге (400 от body-parser, HTML) —
      // этот путь уже покрыт в meetings-тесте.
    ];

    for (const body of invalidBodies) {
      const response = await postType(baseUrl, 'role=admin', body);
      expect(response.status, `тело ${JSON.stringify(body)}`).toBe(400);
      expect(await response.json(), `тело ${JSON.stringify(body)}`).toEqual({
        error: 'name обязателен (непустая строка), description — строка, duration_minutes — целое от 30 до 180',
      });
    }
  });

  it('POST длительности не кратной 30 отвечает 400 — границы 30/180 проходят', async () => {
    const { baseUrl } = await createTestApp();
    // 45 внутри границ, поэтому схема его пропускает — кратность ловит роут:
    // JSON Schema кратность не выражает, как и длину booker у сессии.
    const notMultiple = await postType(baseUrl, 'role=admin', {
      name: 'Консультация',
      description: '',
      duration_minutes: 45,
    });
    expect(notMultiple.status).toBe(400);
    expect(await notMultiple.json()).toEqual({ error: 'длительность должна быть кратна 30 минутам' });

    // Границы диапазона включительно: и 30, и 180 создают тип.
    for (const durationMinutes of [30, 180]) {
      const response = await postType(baseUrl, 'role=admin', {
        name: 'Консультация',
        description: '',
        duration_minutes: durationMinutes,
      });
      expect(response.status, `duration_minutes ${durationMinutes}`).toBe(201);
      expect(
        ((await response.json()) as { duration_minutes: number }).duration_minutes,
        `duration_minutes ${durationMinutes}`,
      ).toBe(durationMinutes);
    }
  });

  it('деактивация админом: 200 с active: false, повтор идемпотентен', async () => {
    const { baseUrl } = await createTestApp();
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '', duration_minutes: 30 });

    const first = await postType(baseUrl, 'role=admin', {}, '/api/meeting-types/1/deactivate');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      id: '1',
      name: 'Консультация',
      description: '',
      duration_minutes: 30,
      active: false,
    });

    // В контракте нет ни 404, ни 409: повторная деактивация — 200, состояние прежнее (Q7).
    const second = await postType(baseUrl, 'role=admin', {}, '/api/meeting-types/1/deactivate');
    expect(second.status).toBe(200);
    const repeated = (await second.json()) as { active: boolean };
    expect(repeated.active).toBe(false);
  });

  it('деактивация гостем отвечает 403', async () => {
    const { baseUrl } = await createTestApp();
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '', duration_minutes: 30 });

    const response = await postType(
      baseUrl,
      'guest',
      {},
      '/api/meeting-types/1/deactivate',
    );
    expect(response.status).toBe(403);
  });

  it('деактивация неизвестного или нечислового id отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '', duration_minutes: 30 });

    for (const id of ['999', 'abc']) {
      const response = await postType(baseUrl, 'role=admin', {}, `/api/meeting-types/${id}/deactivate`);
      expect(response.status, `id ${id}`).toBe(400);
      expect(await response.json(), `id ${id}`).toEqual({ error: 'тип встречи не найден' });
    }
    // Существующий тип при этом не тронут.
    const types = await getTypes(baseUrl, 'role=admin');
    expect(((await types.json()) as Array<{ active: boolean }>)[0]?.active).toBe(true);
  });
});

describe('routes /api/meetings', () => {
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

  it('невалидная cookie без подписи, пустая и мусорная отвечают 401 (T2)', async () => {
    const { baseUrl } = await createTestApp();
    // Отдельно от подделки подписи (выше). Ключевой случай — cookie БЕЗ подписи:
    // обычный JSON с role: admin. Сервер обязан читать только signedCookies, а
    // не req.cookies, иначе незаверенная роль прошла бы (T2). Пустое значение —
    // то, что остаётся в браузере после logout; мусор — не-JSON.
    const unsigned = encodeURIComponent(JSON.stringify({ role: 'admin', bookerName: null }));
    for (const cookie of [`session=${unsigned}`, 'session=', 'session=garbage']) {
      const response = await fetch(`${baseUrl}/api/meetings?from=2026-01-01&to=2026-12-31`, {
        headers: { Cookie: cookie },
      });
      expect(response.status, `cookie: ${cookie}`).toBe(401);
    }
  });

  it('GET возвращает пустой список', async () => {
    const { baseUrl } = await createTestApp();
    const response = await getMeetings(baseUrl, 'role=admin');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('POST принимает JSON и отвечает 201 с id строкой', async () => {
    const { baseUrl } = await createTestApp();
    const guest = 'guest';
    const day = bookableDay(1);
    // Без meeting_type_id запись остаётся «нетипизированной» — как легаси-строки
    // (C5): поле в контракте опционально, обязательным его делает гостевой флоу.
    const response = await postMeeting(baseUrl, guest, { date: day, time: '09:00', booker_name: 'Иван' });
    expect(response.status).toBe(201);
    const meeting = (await response.json()) as Record<string, unknown>;
    // Ровно поля контрактной Meeting: booker и meeting_type_id не эхом возвращаются.
    expect(meeting).toEqual({ id: '1', date: day, time: '09:00' });
    expect(typeof meeting.id).toBe('string');
  });

  it('POST дубля слота отвечает 409', async () => {
    const { baseUrl } = await createTestApp();
    const guest = 'guest';
    const body = { date: bookableDay(1), time: '09:00', booker_name: 'Иван' };

    expect((await postMeeting(baseUrl, guest, body)).status).toBe(201);
    // Второй POST того же слота отклоняется сервером, а не UI; UNIQUE(date, time)
    // в базе остаётся последним рубежом, когда предварительные проверки пройдены.
    expect((await postMeeting(baseUrl, guest, body)).status).toBe(409);
  });

  it('POST без Content-Type: application/json отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const guest = 'guest';
    // express.json() не парсит text/plain: req.body в Express 5 остаётся
    // undefined. Без заголовка каждый POST вернул бы 400.
    const response = await postMeeting(
      baseUrl,
      guest,
      { date: bookableDay(1), time: '09:00', booker_name: 'Иван' },
      { 'Content-Type': 'text/plain' },
    );
    expect(response.status).toBe(400);
  });

  it('POST невалидного тела отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const guest = 'guest';
    const invalidBodies = [
      {},
      { date: '2026-03-02' },
      { date: '2026-03-02', time: '9:00' },
      { date: '02.03.2026', time: '09:00' },
      { date: '2026-03-02', time: '24:00' },
      { date: null, time: '09:00' },
      { date: 20260302, time: '09:00' },
      // meeting_type_id, если передан, — строка-идентификатор; null и число
      // отклоняет схема (отсутствие поля, наоборот, допустимо — см. выше).
      { date: '2026-03-02', time: '09:00', meeting_type_id: null },
      { date: '2026-03-02', time: '09:00', meeting_type_id: 42 },
      'not an object',
    ];

    for (const body of invalidBodies) {
      // `message` в expect — это контекст провала: без него Vitest не скажет,
      // какое из тел не получил 400, и в цикле из семи это квест на угадывание.
      expect((await postMeeting(baseUrl, guest, body)).status, `тело ${JSON.stringify(body)}`).toBe(400);
    }
  });

  it('POST берёт booker из сессии: поле booker в теле игнорируется (Q4/C10)', async () => {
    const { baseUrl, db } = await createTestApp();
    const guest = 'guest';
    const day = bookableDay(1);

    const response = await postMeeting(baseUrl, guest, {
      date: day,
      time: '10:00',
      booker: 'Злоумышленник',
    });
    expect(response.status).toBe(201);
    // Ответ — только поля контрактной Meeting: тело booker не возвращается эхом.
    expect(await response.json()).toEqual({ id: '1', date: day, time: '10:00' });

    // Наблюдаемое — колонка: имя взято из подписанной cookie, а не из тела.
    const row = db.prepare('SELECT booker FROM meetings').get() as { booker: string };
    expect(row.booker).toBe('Иван');
  });

  it('POST админом без имени в сессии отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    // У админа bookerName null, а booker обязателен для записи (Q12c: админ
    // наблюдает, но не записывается) — в контракте нет 403, поэтому это 400.
    const response = await postMeeting(baseUrl, 'role=admin', {
      date: bookableDay(1),
      time: '09:00',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'имя записавшегося обязательно' });
  });

  it('POST с именем из сессии длиннее 100 символов отвечает 400, ровно 100 — проходит', async () => {
    const { baseUrl } = await createTestApp();
    // Граница MAX_BOOKER_LENGTH в routes.ts: 100 включительно, 101 уже нет —
    // пара на границе ловит и сдвиг границы (100→101), и замену > на >=.
    const tooLong = await loginAsGuest(baseUrl, 'И'.repeat(101));
    const rejected = await postMeeting(baseUrl, tooLong, {
      date: bookableDay(1),
      time: '09:00',
    });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error: 'имя записавшегося длиннее 100 символов',
    });

    const exactly100 = await loginAsGuest(baseUrl, 'И'.repeat(100));
    expect(
      (await postMeeting(baseUrl, exactly100, { date: bookableDay(2), time: '09:00', booker_name: 'Иван' })).status,
    ).toBe(201);
  });

  it('POST с неизвестным или деактивированным meeting_type_id отвечает 400 (C1)', async () => {
    const { baseUrl } = await createTestApp();
    const guest = 'guest';
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '', duration_minutes: 30 });
    await postType(baseUrl, 'role=admin', { name: 'Собеседование', description: '', duration_minutes: 30 });
    await postType(baseUrl, 'role=admin', {}, '/api/meeting-types/2/deactivate');

    for (const meetingTypeId of ['999', '2']) {
      const response = await postMeeting(baseUrl, guest, {
        date: bookableDay(1),
        time: '09:00',
        meeting_type_id: meetingTypeId,
      });
      expect(response.status, `meeting_type_id ${meetingTypeId}`).toBe(400);
      expect(await response.json(), `meeting_type_id ${meetingTypeId}`).toEqual({
        error: 'тип встречи не найден или неактивен',
      });
    }
  });

  it('POST с активным meeting_type_id создаёт запись и сохраняет тип', async () => {
    const { baseUrl, db } = await createTestApp();
    const guest = 'guest';
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '', duration_minutes: 30 });
    const day = bookableDay(1);

    const response = await postMeeting(baseUrl, guest, {
      date: day,
      time: '09:00',
      meeting_type_id: '1',
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: '1', date: day, time: '09:00' });

    // Колонка INTEGER: строковый id контракта хранится числом.
    const row = db.prepare('SELECT meeting_type_id FROM meetings').get() as {
      meeting_type_id: number;
    };
    expect(row.meeting_type_id).toBe(1);
  });

  it('POST отклоняет прошедшую дату, выходной, дату вне окна и время вне сетки (ADR-0009)', async () => {
    // Бывший тест-документация T11 утверждал обратное (сервер НЕ проверяет) —
    // решение пересмотрено: правила букинга теперь на сервере (замечание ревью
    // №2, ADR-0009 взамен ADR-0007).
    const { baseUrl } = await createTestApp();
    const guest = 'guest';
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '', duration_minutes: 30 });

    // Прошедшая дата — вчера.
    const past = await postMeeting(baseUrl, guest, {
      date: localDate(-1),
      time: '09:00',
      meeting_type_id: '1',
    });
    expect(past.status).toBe(400);
    expect(await past.json()).toEqual({ error: 'дата прошла' });

    // Выходной в пределах окна: суббота или воскресенье.
    const weekend = await postMeeting(baseUrl, guest, {
      date: weekendInWindow(1),
      time: '10:00',
      meeting_type_id: '1',
    });
    expect(weekend.status).toBe(400);
    expect(await weekend.json()).toEqual({ error: 'выходной день — запись только на будни' });

    // Дата за пределами окна (14 дней): будний день, чтобы правило окна
    // проверилось именно им, а не закрылось раньше правилом выходных.
    const outOfWindow = await postMeeting(baseUrl, guest, {
      date: weekdayBeyondWindow(),
      time: '10:00',
      meeting_type_id: '1',
    });
    expect(outOfWindow.status).toBe(400);
    expect(await outOfWindow.json()).toEqual({ error: 'дата вне окна записи (14 дней)' });

    // Время вне сетки: до начала дня, после последнего слота и не кратно 30.
    const day = bookableDay(1);
    for (const time of ['08:30', '18:00', '10:15']) {
      const response = await postMeeting(baseUrl, guest, { date: day, time, meeting_type_id: '1' });
      expect(response.status, `time ${time}`).toBe(400);
      expect(await response.json(), `time ${time}`).toEqual({
        error: 'время вне сетки рабочего дня (09:00–18:00, шаг 30 минут)',
      });
    }

    // Границы сетки включительно: первый слот 09:00 и последний 17:30 проходят.
    for (const time of ['09:00', '17:30']) {
      const response = await postMeeting(baseUrl, guest, { date: day, time, meeting_type_id: '1' });
      expect(response.status, `time ${time}`).toBe(201);
    }
  });

  it('GET без from/to отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const response = await getMeetings(baseUrl, 'role=admin', '');
    expect(response.status).toBe(400);
  });

  it('GET с повторённым параметром отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    // Express 5 склеивает повтор в массив, а схема ждёт строку. Это отдельный
    // сценарий от «пустого» query: без него регрессия на массивах не поймана.
    const response = await getMeetings(baseUrl, 'role=admin', '?from=2026-01-01&from=2026-01-02&to=2026-12-31');
    expect(response.status).toBe(400);
  });

  it('GET с невалидным from/to отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const response = await getMeetings(baseUrl, 'role=admin', '?from=01-01-2026&to=2026-12-31');
    expect(response.status).toBe(400);
  });

  it('GET фильтрует по диапазону и сортирует по (date, time)', async () => {
    const { baseUrl } = await createTestApp();
    const guest = 'guest';
    // Три будних дня окна: нижняя граница диапазона, внутри него и за верхней.
    const early = bookableDay(1);
    const middle = bookableDay(2);
    const late = bookableDay(3);
    await postMeeting(baseUrl, guest, { date: middle, time: '10:00', booker_name: 'Иван' });
    await postMeeting(baseUrl, guest, { date: early, time: '11:00', booker_name: 'Иван' });
    await postMeeting(baseUrl, guest, { date: late, time: '09:00', booker_name: 'Иван' });

    // Диапазон early…middle: поздняя запись не попадает, обе границы включительно.
    const response = await getMeetings(baseUrl, 'role=admin', `?from=${early}&to=${middle}`);
    expect(await response.json()).toEqual([
      { id: '2', date: early, time: '11:00' },
      { id: '1', date: middle, time: '10:00' },
    ]);
  });
});

describe('routes /api/admin/meetings', () => {
  /** GET админского списка: cookie опциональна — так проверяется 401 без сессии. */
  function getPlanned(baseUrl: string, cookie?: string) {
    return fetch(`${baseUrl}/api/admin/meetings`, {
      headers: cookie === undefined ? undefined : { Cookie: cookie },
    });
  }

  it('без сессии 401, гостем 403, админом 200 с пустым списком (T2)', async () => {
    const { baseUrl } = await createTestApp();

    expect((await getPlanned(baseUrl, 'role=admin')).status).toBe(401);
    // requireSession стоит до requireRole: гость доходит до ролевого гейта (403),
    // аноним обрывается раньше (401).
    expect((await getPlanned(baseUrl, 'role=guest')).status).toBe(403);

    const response = await getPlanned(baseUrl, 'role=admin');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('подделанная cookie с role: admin не открывает админ-ручку — 401 (T2)', async () => {
    const { baseUrl } = await createTestApp();
    // Эскалация прав: злоумышленник заявляет role: admin. Две формы подделки —
    // (1) своя подпись поверх admin-payload'а не совпадает, cookie-parser отдаёт
    // false; (2) cookie вовсе без подписи. Обе обрываются на requireSession (401)
    // и не доходят до requireRole: без чтения только signedCookies незаверенная
    // роль прошла бы как admin. Ту же подделку на ГОСТЕВОЙ ручке ловит тест в
    // /api/meetings; здесь важно, что она не открывает именно админскую.
    const payload = JSON.stringify({ role: 'admin', bookerName: null });
    const unsigned = encodeURIComponent(payload);
    const mismatchedSignature = `session=s%3A${Buffer.from(payload).toString('base64url')}.deadbeef`;
    for (const forged of [mismatchedSignature, `session=${unsigned}`]) {
      expect((await getPlanned(baseUrl, forged)).status, `cookie: ${forged}`).toBe(401);
    }
  });

  it('отдаёт join-DTO: тип и автор у новой записи, «null» у легаси; прошлое отсечено (C5/Q6)', async () => {
    const { baseUrl, db } = await createTestApp();
    const guest = await loginAsGuest(baseUrl, 'Иван');
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '30 минут', duration_minutes: 30 });
    const bookedDay = bookableDay(1);

    // Будущая типизированная запись — через реальный POST: booker придёт из
    // сессии, тип сохранится. Это и есть сквозной позитив T9 (login → POST с
    // активным типом → 201 → строка в админском join-DTO): статус и тело ответа
    // проверяются здесь, чтобы весь путь S2→S5→S4 был одним тестом.
    const created = await postMeeting(baseUrl, guest, {
      date: bookedDay,
      time: '09:00',
      meeting_type_id: '1',
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: '1', date: bookedDay, time: '09:00' });
    // Легаси-строки — только прямой вставкой: без типа и автора (C5) и в прошлом.
    db.prepare('INSERT INTO meetings (date, time) VALUES (?, ?)').run(localDate(0), '10:00');
    db.prepare('INSERT INTO meetings (date, time) VALUES (?, ?)').run(localDate(-1), '11:00');

    // Сегодняшняя (type/booker null) и записанная (join) — в порядке (date, time);
    // вчерашняя не попадает, хотя она в базе.
    expect(await (await getPlanned(baseUrl, 'role=admin')).json()).toEqual([
      { date: localDate(0), time: '10:00', type: null, booker: null },
      { date: bookedDay, time: '09:00', type: 'Консультация', booker: 'Иван' },
    ]);
  });
});

describe('routes: жизненный цикл типа (T5/Q7)', () => {
  function listTypes(baseUrl: string, cookie: string) {
    return fetch(`${baseUrl}/api/meeting-types`, { headers: { Cookie: cookie } });
  }
  function listPlanned(baseUrl: string, cookie: string) {
    return fetch(`${baseUrl}/api/admin/meetings`, { headers: { Cookie: cookie } });
  }

  it('деактивация типа с уже записанной встречей разрешена: история помнит тип, новая запись — 400', async () => {
    const { baseUrl } = await createTestApp();
    await postType(baseUrl, 'role=admin', { name: 'Консультация', description: '', duration_minutes: 30 });
    const guest = await loginAsGuest(baseUrl, 'Иван');
    const bookedDay = bookableDay(1);

    const booked = await postMeeting(baseUrl, guest, {
      date: bookedDay,
      time: '09:00',
      meeting_type_id: '1',
    });
    expect(booked.status).toBe(201);

    // Наличие встреч деактивацию НЕ блокирует: удаления в v1 нет, деактивация —
    // единственный конец жизненного цикла (Q7). Тип остаётся в админском списке
    // (listAll), просто с active: false.
    const deactivated = await postType(baseUrl, 'role=admin', {}, '/api/meeting-types/1/deactivate');
    expect(deactivated.status).toBe(200);
    expect(((await deactivated.json()) as { active: boolean }).active).toBe(false);
    expect(await (await listTypes(baseUrl, 'role=admin')).json()).toEqual([
      { id: '1', name: 'Консультация', description: '', duration_minutes: 30, active: false },
    ]);

    // История не обезличивается: у записанной встречи тип остаётся названием…
    expect(await (await listPlanned(baseUrl, 'role=admin')).json()).toEqual([
      { date: bookedDay, time: '09:00', type: 'Консультация', booker: 'Иван' },
    ]);

    // …а новая запись на деактивированный тип не проходит (Q7), и гость тип
    // больше не видит (listActive). День — тот же будний в окне: проверка
    // закрывается именно типом, а не правилами букинга.
    const rebook = await postMeeting(baseUrl, guest, {
      date: bookedDay,
      time: '10:00',
      meeting_type_id: '1',
    });
    expect(rebook.status).toBe(400);
    expect(await rebook.json()).toEqual({ error: 'тип встречи не найден или неактивен' });
    expect(await (await listTypes(baseUrl, 'role=guest')).json()).toEqual([]);
  });
});
