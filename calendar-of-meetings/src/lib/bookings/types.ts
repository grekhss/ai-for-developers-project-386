/**
 * Запись на встречу. Дата и время — строки в том формате, в котором их отдаёт
 * Mantine: 'YYYY-MM-DD' и 'HH:mm'. Строки, а не Date, ещё и потому, что
 * new Date('YYYY-MM-DD') разбирается как полночь UTC и в отрицательных
 * часовых поясах показывает предыдущий день.
 */
export interface Booking {
  /** Идентификат, присваиваемый сервером. */
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

/** Полуинтервал дат для запроса списка записей, обе границы включительно. */
export interface DateRange {
  from: string;
  to: string;
}
