import type { BookingsApi } from './api.ts';
import type { Booking, BookingDraft, DateRange } from './types.ts';

/**
 * HTTP-реализация контракта: ходит на /api/bookings того же origin. В dev
 * запрос уезжает через Vite-прокси на express-сервер, в проде — прямо на него.
 * Пустой baseUrl означает «текущий origin»: так работают оба сценария.
 */
export function createHttpBookingsApi(baseUrl = ''): BookingsApi {
  return {
    async list({ from, to }: DateRange) {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`${baseUrl}/api/bookings?${params}`);
      if (!response.ok) {
        throw new Error(`GET /api/bookings вернул ${response.status}`);
      }
      return response.json() as Promise<Booking[]>;
    },

    async create(draft: BookingDraft) {
      const response = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        // Без заголовка fetch уходит как text/plain, express.json() не распарсит
        // тело, req.body в Express 5 останется undefined — и каждый POST вернул
        // бы 400 (см. server/validate.ts).
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        // useBookings.createBooking переводит throw в error/null; текст
        // CREATE_ERROR уже подходит и для 409 (дубль слота).
        throw new Error(`POST /api/bookings вернул ${response.status}`);
      }
      return response.json() as Promise<Booking>;
    },
  };
}