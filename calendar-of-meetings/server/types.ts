/**
 * Формы записи, которыми сервер обменивается с клиентом. Это структурная копия
 * контракта из src/lib/bookings/types.ts: импорт из src/ закрыт rootDir: server,
 * а доменные правила сюда не входят (см. ARCHITECTURE §9).
 */
export interface Booking {
  /** Идентификатор, присваиваемый базой данных. */
  id: string;
  /** День встречи, 'YYYY-MM-DD'. */
  date: string;
  /** Начало встречи, 'HH:mm'. */
  time: string;
}

/** Данные новой записи — всё, кроме идентификатора. */
export interface BookingDraft {
  date: string;
  time: string;
}