import type { RequestHandler } from 'express';
import type { components } from './contract.gen.js';

/**
 * Сессия — то, что подписано в httpOnly-cookie и определяет доступ (Q9).
 * Тип приходит из контракта (contract/main.tsp, K1); здесь только alias.
 */
export type Session = components['schemas']['Session'];

// Модульная аугментация: только типы, в рантайме ничего не появляется
// (erasableSyntaxOnly допускает declare module).
declare module 'express-serve-static-core' {
  interface Request {
    session?: Session;
  }
}

export const SESSION_COOKIE = 'session';
/** Время жизни сессии — 14 дней, как горизонт бронирования (pre-answer S2). */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Опции cookie: подпись, httpOnly, SameSite=Lax — по D3; secure задаёт createApp. */
export function sessionCookieOptions(): {
  signed: true;
  httpOnly: true;
  sameSite: 'lax';
  maxAge: number;
  path: string;
} {
  return { signed: true, httpOnly: true, sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS, path: '/' };
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Record<string, unknown>;
  return (
    (session.role === 'admin' || session.role === 'guest') &&
    (session.bookerName === null || typeof session.bookerName === 'string')
  );
}

/**
 * Читает сессию из подписанной cookie. Подделанная cookie отклоняется самой
 * подписью: cookie-parser при несовпадении сигнатуры отдаёт `false`, а не
 * строку, — поэтому фальшивый `role: admin` не проходит.
 */
function readSession(req: Parameters<RequestHandler>[0]): Session | undefined {
  const raw = req.signedCookies?.[SESSION_COOKIE];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Гейт всех /api: без валидной сессии — 401 (requireSession из S2). */
export const requireSession: RequestHandler = (req, res, next) => {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: 'требуется вход' });
    return;
  }
  req.session = session;
  next();
};

/** Ролевой гейт: ставится после requireSession; роли нет или чужая — 403. */
export function requireRole(role: Session['role']): RequestHandler {
  return (req, res, next) => {
    if (req.session?.role !== role) {
      res.status(403).json({ error: 'недостаточно прав' });
      return;
    }
    next();
  };
}
