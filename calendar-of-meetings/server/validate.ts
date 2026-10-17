import type { MeetingDraft } from './types.js';

/** Формат даты: '2026-10-10'. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Строгое время суток: '09:00', '23:59'; '9:00' и '24:00' уже не проходят. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Сервер валидирует только формат, не домен: прошедшие даты, выходные и время
 * вне сетки слотов принимаются. Домен не дублируется с src/lib (ARCHITECTURE
 * §3/§9), а импорт из src/ закрыт rootDir: server.
 *
 * false на undefined/не-объекте: в Express 5 req.body не инициализируется в {},
 * если парсер не сработал (например, POST без Content-Type: application/json).
 */
export function isValidDraft(body: unknown): body is MeetingDraft {
  if (typeof body !== 'object' || body === null) return false;
  const draft = body as Record<string, unknown>;
  return (
    typeof draft.date === 'string' &&
    DATE_RE.test(draft.date) &&
    typeof draft.time === 'string' &&
    TIME_RE.test(draft.time)
  );
}

/** Валидация query GET /api/meetings: from и to обязательны и в формате даты. */
export function isValidRange(query: Record<string, unknown>): query is { from: string; to: string } {
  const { from, to } = query;
  return typeof from === 'string' && typeof to === 'string' && DATE_RE.test(from) && DATE_RE.test(to);
}