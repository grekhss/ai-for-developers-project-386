import type Database from 'better-sqlite3';
import type { Meeting, MeetingDraft } from './types.js';

/** Бросается при вставке дубля (date, time). Роут конвертирует его в 409. */
export class DuplicateMeetingError extends Error {
  constructor() {
    super('slot already booked');
    this.name = 'DuplicateMeetingError';
  }
}

export interface MeetingsRepository {
  /** Записи за диапазон дат включительно, в порядке возрастания (date, time). */
  list(from: string, to: string): Meeting[];
  /**
   * Вставляет запись и возвращает её с присвоенным id. `booker` — имя из
   * сессии (Q4), поэтому вторым аргументом, а не полем draft'а: тело запроса
   * его не содержит и игнорируется. `draft.meeting_type_id` без типа хранится
   * как NULL (легаси-семантика C5). При дубле (date, time) бросает
   * DuplicateMeetingError, прочие ошибки БД пробрасывает как есть.
   */
  create(draft: MeetingDraft, booker: string): Meeting;
}

/** Ложный 409 опасен: только сбой именно уникальности — это дубль слота. */
function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export function createRepository(db: Database.Database): MeetingsRepository {
  const listStmt = db.prepare(
    'SELECT id, date, time FROM meetings WHERE date >= ? AND date <= ? ORDER BY date, time',
  );
  const insertStmt = db.prepare(
    'INSERT INTO meetings (date, time, meeting_type_id, booker) VALUES (?, ?, ?, ?)',
  );

  return {
    // Даты сравниваются как строки: 'YYYY-MM-DD' упорядочен лексикографически
    // так же, как хронологически — поэтому BETWEEN и ORDER BY работают напрямую.
    list(from, to) {
      const rows = listStmt.all(from, to) as unknown as Array<{ id: number; date: string; time: string }>;
      return rows.map((row) => ({ id: String(row.id), date: row.date, time: row.time }));
    },

    create(draft, booker) {
      try {
        // Тип хранится в INTEGER-колонке (строковый id ляжет числом сам),
        // а без типа в SQLite нельзя передать undefined — только NULL.
        const result = insertStmt.run(
          draft.date,
          draft.time,
          draft.meeting_type_id ?? null,
          booker,
        );
        // id INTEGER PRIMARY KEY AUTOINCREMENT: lastInsertRowid — число, но наружу
        // отдаём строку — как в контракте src/lib/meetings/types.ts. Собирается
        // по полям, а не спредом draft'а: наружу уходит ровно Meeting (без
        // meeting_type_id) — то, что гарантирует контракт.
        return {
          id: String(Number(result.lastInsertRowid)),
          date: draft.date,
          time: draft.time,
        };
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw new DuplicateMeetingError();
        }
        // Прочие ошибки БД (BUSY и т.п.) не маскируем под 409.
        throw error;
      }
    },
  };
}