import type { BookingsApi } from './api.ts';
import type { Booking } from './types.ts';

/**
 * Записи в памяти — заглушка вместо бэкенда. Фабрика, а не синглтон, чтобы
 * каждый вызов получал своё хранилище: так тесты не делят состояние.
 */
export function createInMemoryBookingsApi(seed: Booking[] = []): BookingsApi {
  const bookings: Booking[] = [...seed];
  let lastId = bookings.length;

  return {
    async list({ from, to }) {
      // Даты сравниваются как строки: формат 'YYYY-MM-DD' упорядочен
      // лексикографически так же, как хронологически. С Date так не выйдет.
      return bookings
        .filter((booking) => booking.date >= from && booking.date <= to)
        .sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time));
    },

    async create(draft) {
      lastId += 1;

      const booking: Booking = { id: String(lastId), ...draft };
      bookings.push(booking);

      return booking;
    },
  };
}