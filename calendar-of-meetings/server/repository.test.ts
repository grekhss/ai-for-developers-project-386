// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDatabase } from './db.js';
import { createRepository, DuplicateMeetingError } from './repository.js';

describe('createRepository', () => {
  it('list отдаёт пустой список без записей', () => {
    const repo = createRepository(createDatabase(':memory:'));
    expect(repo.list('2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('list фильтрует по диапазону и сортирует по (date, time)', () => {
    const repo = createRepository(createDatabase(':memory:'));
    const late2027 = repo.create({ date: '2027-01-01', time: '09:00' });
    repo.create({ date: '2026-01-02', time: '10:00' });
    repo.create({ date: '2026-01-01', time: '11:00' });
    repo.create({ date: '2026-01-02', time: '09:00' });

    // Сортировка лексикографическая по дате, затем по времени; границы включены.
    expect(repo.list('2026-01-01', '2026-12-31')).toEqual([
      { id: '3', date: '2026-01-01', time: '11:00' },
      { id: '4', date: '2026-01-02', time: '09:00' },
      { id: '2', date: '2026-01-02', time: '10:00' },
    ]);
    // За пределами диапазона запись не попадает.
    expect(late2027).toEqual({ id: '1', date: '2027-01-01', time: '09:00' });
  });

  it('create возвращает запись с присвоенным id строкой', () => {
    const repo = createRepository(createDatabase(':memory:'));
    const meeting = repo.create({ date: '2026-01-05', time: '14:00' });
    expect(meeting).toEqual({ id: '1', date: '2026-01-05', time: '14:00' });
    // id в ответе — строка, как в контракте src/lib/meetings/types.ts.
    expect(typeof meeting.id).toBe('string');
  });

  it('повторный create того же (date, time) бросает DuplicateMeetingError', () => {
    const repo = createRepository(createDatabase(':memory:'));
    repo.create({ date: '2026-01-05', time: '14:00' });

    expect(() => repo.create({ date: '2026-01-05', time: '14:00' })).toThrow(DuplicateMeetingError);
  });

  it('не-UNIQUE ошибки БД не маскируются под дубль', () => {
    const db = createDatabase(':memory:');
    // Подменяем схему: CHECK-ограничение, нарушение которого даёт код
    // SQLITE_CONSTRAINT_CHECK, а не SQLITE_CONSTRAINT_UNIQUE.
    db.exec('DROP TABLE meetings');
    db.exec(`CREATE TABLE meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      UNIQUE(date, time),
      CHECK (date <> '')
    )`);
    const repo = createRepository(db);

    let thrown: unknown;
    try {
      repo.create({ date: '', time: '09:00' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DuplicateMeetingError);
  });
});