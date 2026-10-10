import { createHttpBookingsApi } from './http.ts';
import type { Booking, BookingDraft, DateRange } from './types.ts';

/**
 * Контракт доступа к записям. UI работает только с ним, поэтому замена
 * in-memory реализации на HTTP не затрагивает компоненты и хуки.
 */
export interface BookingsApi {
  /** Записи за полуинтервал дат, обе границы включительно, в порядке возрастания. */
  list(range: DateRange): Promise<Booking[]>;
  /** Создаёт запись и возвращает её уже с присвоенным id. */
  create(draft: BookingDraft): Promise<Booking>;
}

/**
 * Реализация, которой пользуется приложение: HTTP-клиент на /api/bookings
 * (в dev его проксирует Vite, в проде отдаёт express-сервер). Тесты подставляют
 * свою реализацию через проп api, поэтому менять её здесь больше не нужно.
 */
export const bookingsApi: BookingsApi = createHttpBookingsApi();