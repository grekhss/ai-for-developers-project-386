/**
 * Роль по URL страницы: `/admin` — админ, всё остальное — гость.
 * Роль передаётся серверу через cookie `role` (ADR-0010).
 */
export function roleForPath(pathname: string): 'admin' | 'guest' {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'guest';
}
