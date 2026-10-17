import express from 'express';
import { DuplicateMeetingError, type MeetingsRepository } from './repository.js';
import type { AppOptions } from './app.js';
import { requireSession, SESSION_COOKIE, sessionCookieOptions, type Session } from './session.js';
import { isValidDraft, isValidLogin, isValidRange } from './validate.js';

type AuthOptions = Pick<AppOptions, 'adminPassword' | 'guestPassword' | 'secureCookie'>;

/** Роуты API броней. Фабрика: принимает репозиторий, чтобы тесты подавали ':memory:'. */
export function createRoutes(repo: MeetingsRepository, auth: AuthOptions): express.Router {
  const router = express.Router();
  const cookie = { ...sessionCookieOptions(), secure: auth.secureCookie };

  router.post('/api/login', (req, res) => {
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

  router.get('/api/meetings', (req, res) => {
    const query = req.query as Record<string, unknown>;
    if (!isValidRange(query)) {
      // Без этой проверки better-sqlite3 упал бы с 500 «too few parameter values».
      res.status(400).json({ error: 'from и to обязательны, формат YYYY-MM-DD' });
      return;
    }
    res.json(repo.list(query.from, query.to));
  });

  router.post('/api/meetings', (req, res) => {
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