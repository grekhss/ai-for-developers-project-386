import type { RequestHandler } from 'express';

/** Роль доступа: определяется по cookie `role` (ставит фронт по URL). */
export type Role = 'admin' | 'guest';

/** Cookie роли. */
export const ROLE_COOKIE = 'role';

/** Роль из cookie: admin только при точном совпадении. */
export function readRole(cookies: Record<string, unknown> = {}): Role {
  return cookies[ROLE_COOKIE] === 'admin' ? 'admin' : 'guest';
}

/** Гейт админских ручек: при несоответствии — 403. */
export function requireRole(role: Role): RequestHandler {
  return (req, res, next) => {
    if (readRole((req as { cookies?: Record<string, unknown> }).cookies ?? {}) !== role) {
      res.status(403).json({ error: 'недостаточно прав' });
      return;
    }
    next();
  };
}
