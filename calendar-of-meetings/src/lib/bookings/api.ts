import { createInMemoryBookingsApi } from './inMemory.ts';
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
 * Реализация, которой пользуется приложение. Когда появится бэкенд, здесь
 * меняется одна строка на HTTP-клиент с тем же интерфейсом.
 */
export const bookingsApi: BookingsApi = createInMemoryBookingsApi();