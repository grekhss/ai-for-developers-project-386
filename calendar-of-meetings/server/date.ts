/**
 * Часы сервера: `today()` — 'YYYY-MM-DD', `now()` — 'YYYY-MM-DD HH:mm'.
 * Единственное место в `server/`, читающее системные часы (T3): правила
 * букинга (booking-rules.ts) принимают момент параметром, и только роуты
 * передают им эти значения.
 *
 * Локальная зона, а не UTC: `toISOString()` в UTC+3 поздним вечером отдал бы
 * вчерашний день, и прошедшая встреча осталась бы в списке. На фронте ту же
 * роль играют `today()`/`now()` из `src/lib/date.ts` (через dayjs); сервер
 * собирает строку сам, чтобы не тянуть date-библиотеку ради двух функций.
 */
export function today(): string {
  const current = new Date();
  const month = String(current.getMonth() + 1).padStart(2, '0');
  const day = String(current.getDate()).padStart(2, '0');
  return `${current.getFullYear()}-${month}-${day}`;
}

/** Текущие дата и время — «момент» для правил букинга (T3). */
export function now(): string {
  const current = new Date();
  const month = String(current.getMonth() + 1).padStart(2, '0');
  const day = String(current.getDate()).padStart(2, '0');
  const hours = String(current.getHours()).padStart(2, '0');
  const minutes = String(current.getMinutes()).padStart(2, '0');
  return `${current.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}
