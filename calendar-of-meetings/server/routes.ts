import express from 'express';
import { DuplicateMeetingError, type MeetingsRepository } from './repository.js';
import type { AppOptions } from './app.js';
import { requireSession, SESSION_COOKIE, sessionCookieOptions, type Session } from './session.js';
import type { CreateMeetingBody, ListMeetingsQuery, LoginInput } from './types.js';
import { isValidDraft, isValidLogin, isValidRange } from './validate.js';

type AuthOptions = Pick<AppOptions, 'adminPassword' | 'guestPassword' | 'secureCookie'>;

/**
 * Тело и query обработчиков берутся из operations контракта, а не из выражения:
 * смена shape'а в contract/main.tsp роняет `tsc` здесь, а не вылезает в 400.
 * Типы — обещание для компилятора, фактическую проверку делают isValid*-предикаты
 * ниже: в Express 5 req.body может и не быть (парсер не сработал), поэтому без
 * них строка с типом врала бы о рантайме.
 *
 * Пути все статичные, path-параметров нет. ResBody остаётся unknown: ответы
 * различаются по статус-коду (200/201/204 против 400/401/409), и свести их в
 * одну типизированную сумму дороже, чем она стоит.
 */
type NoParams = Record<string, string>;

/** Роуты API броней. Фабрика: принимает репозиторий, чтобы тесты подавали ':memory:'. */
export function createRoutes(repo: MeetingsRepository, auth: AuthOptions): express.Router {
  const router = express.Router();
  const cookie = { ...sessionCookieOptions(), secure: auth.secureCookie };

  router.post<NoParams, unknown, LoginInput>('/api/login', (req, res) => {
    if (!isValidLogin(req.body)) {
      res.status(400).json({ error: 'password обязателен, bookerName — непустая строка' });
      return;
    }

    // Роль определяется только здесь, по совпадению пароля, — с клиента её не берём.
    // Пароли разные (проверено в createApp), так что порядок сравнения не влияет.
    let session: Session;
    if (req.body.password === auth.adminPassword) {
      session = { role: 'admin', bookerName: null };
    } else if (req.body.password === auth.guestPassword) {
      const bookerName = req.body.bookerName?.trim();
      if (!bookerName) {
        res.status(400).json({ error: 'для гостя обязателен bookerName' });
        return;
      }
      session = { role: 'guest', bookerName };
    } else {
      res.status(401).json({ error: 'неверный пароль' });
      return;
    }

    res.cookie(SESSION_COOKIE, JSON.stringify(session), cookie);
    res.json(session);
  });

  // Дальше все /api — только с сессией: requireSession ставится до роутов meetings.
  router.use('/api', requireSession);

  // Восстановление роли после перезагрузки: cookie httpOnly, клиент прочитать
  // её не может (C9). Сессия уже распарсена requireSession'ом.
  router.get('/api/me', (req, res) => {
    res.json(req.session);
  });

  // clearCookie с теми же опциями, что и выдача, — иначе path/secure не совпадут
  // и cookie не удалится (Q13). Подпись для очистки не нужна: удаляется cookie
  // по имени, а не по значению, поэтому signed убираем — иначе уйдёт подписанный
  // мусор вместо пустой cookie.
  router.post('/api/logout', (_req, res) => {
    const { signed: _signed, ...clearOptions } = cookie;
    res.clearCookie(SESSION_COOKIE, clearOptions);
    res.status(204).end();
  });

  router.get<NoParams, unknown, never, ListMeetingsQuery>('/api/meetings', (req, res) => {
    // req.query типизирован как ListMeetingsQuery по контракту, но рантайм это
    // всё ещё строки из URL: повторённый параметр приходит массивом, поэтому
    // предикат обязателен — он и роняет формат, и сужает для repo.list.
    if (!isValidRange(req.query)) {
      // Без этой проверки better-sqlite3 упал бы с 500 «too few parameter values».
      res.status(400).json({ error: 'from и to обязательны, формат YYYY-MM-DD' });
      return;
    }
    res.json(repo.list(req.query.from, req.query.to));
  });

  router.post<NoParams, unknown, CreateMeetingBody>('/api/meetings', (req, res) => {
    if (!isValidDraft(req.body)) {
      res.status(400).json({ error: 'date и time обязательны, формат time HH:mm' });
      return;
    }

    try {
      res.status(201).json(repo.create(req.body));
    } catch (error) {
      if (error instanceof DuplicateMeetingError) {
        res.status(409).json({ error: 'слот уже занят' });
        return;
      }
      // Прочие ошибки отдаёт стандартный обработчик Express — 500.
      throw error;
    }
  });

  return router;
}