import type Database from 'better-sqlite3';
import type { Booking, BookingDraft } from './types.js';

/** Бросается при вставке дубля (date, time). Роут конвертирует его в 409. */
export class DuplicateBookingError extends Error {
  constructor() {
    super('slot already booked');
    this.name = 'DuplicateBookingError';
  }
}

export interface BookingsRepository {
  /** Записи за диапазон дат включительно, в порядке возрастания (date, time). */
  list(from: string, to: string): Booking[];
  /**
   * Вставляет запись и возвращает её с присвоенным id. При дубле (date, time)
   * бросает DuplicateBookingError, прочие ошибки БД пробрасывает как есть.
   */
  create(draft: BookingDraft): Booking;
}

/** Ложный 409 опасен: только сбой именно уникальности — это дубль слота. */
function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export function createRepository(db: Database.Database): BookingsRepository {
  const listStmt = db.prepare(
    'SELECT id, date, time FROM bookings WHERE date >= ? AND date <= ? ORDER BY date, time',
  );
  const insertStmt = db.prepare('INSERT INTO bookings (date, time) VALUES (?, ?)');

  return {
    // Даты сравниваются как строки: 'YYYY-MM-DD' упорядочен лексикографически
    // так же, как хронологически — поэтому BETWEEN и ORDER BY работают напрямую.
    list(from, to) {
      const rows = listStmt.all(from, to) as unknown as Array<{ id: number; date: string; time: string }>;
      return rows.map((row) => ({ id: String(row.id), date: row.date, time: row.time }));
    },

    create(draft) {
      try {
        const result = insertStmt.run(draft.date, draft.time);
        // id INTEGER PRIMARY KEY AUTOINCREMENT: lastInsertRowid — число, но наружу
        // отдаём строку — как в контракте src/lib/bookings/types.ts.
        return { id: String(Number(result.lastInsertRowid)), ...draft };
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw new DuplicateBookingError();
        }
        // Прочие ошибки БД (BUSY и т.п.) не маскируем под 409.
        throw error;
      }
    },
  };
}