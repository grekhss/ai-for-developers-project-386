// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './db.js';
import { createRepository, DuplicateMeetingError } from './repository.js';

describe('createDatabase: миграция схемы', () => {
  it('свежая БД создаёт meeting_types и новые колонки meetings', () => {
    const db = createDatabase(':memory:');

    const meetingColumns = (db.pragma('table_info(meetings)') as Array<{ name: string }>).map(
      (column) => column.name,
    );
    expect(meetingColumns).toEqual(['id', 'date', 'time', 'meeting_type_id', 'booker']);

    const typeColumns = (db.pragma('table_info(meeting_types)') as Array<{ name: string }>).map(
      (column) => column.name,
    );
    expect(typeColumns).toEqual(['id', 'name', 'description', 'active']);
  });

  it('легаси-таблица bookings переименовывается в meetings, строки сохраняются', () => {
    const dbPath = join(tmpdir(), `wayfinder-s1-${randomUUID()}.sqlite`);
    try {
      // Старая БД времён bookings: без meeting_type_id и booker.
      const legacy = new Database(dbPath);
      legacy.exec(`CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        UNIQUE(date, time)
      )`);
      legacy.prepare('INSERT INTO bookings (date, time) VALUES (?, ?)').run('2026-01-05', '10:00');
      legacy.close();

      const db = createDatabase(dbPath);
      const rows = db.prepare('SELECT date, time, meeting_type_id, booker FROM meetings').all();
      expect(rows).toEqual([
        { date: '2026-01-05', time: '10:00', meeting_type_id: null, booker: null },
      ]);
      // Старой таблицы больше нет.
      const legacyTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bookings'")
        .get();
      expect(legacyTable).toBeUndefined();
    } finally {
      rmSync(dbPath, { force: true });
    }
  });

  it('старая meetings без новых колонок дозаполняется, старые строки остаются нетронутыми', () => {
    const dbPath = join(tmpdir(), `wayfinder-s1-${randomUUID()}.sqlite`);
    try {
      const legacy = new Database(dbPath);
      legacy.exec(`CREATE TABLE meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        UNIQUE(date, time)
      )`);
      legacy.prepare('INSERT INTO meetings (date, time) VALUES (?, ?)').run('2026-02-01', '09:00');
      legacy.close();

      const db = createDatabase(dbPath);
      // Старая строка на месте, новые колонки появились и пусты у неё.
      expect(db.prepare('SELECT date, time, meeting_type_id, booker FROM meetings').all()).toEqual([
        { date: '2026-02-01', time: '09:00', meeting_type_id: null, booker: null },
      ]);
      // UNIQUE(date, time) пережил миграцию.
      expect(() =>
        db
          .prepare('INSERT INTO meetings (date, time, meeting_type_id, booker) VALUES (?, ?, ?, ?)')
          .run('2026-02-01', '09:00', 1, 'Иван'),
      ).toThrow(/UNIQUE/i);
    } finally {
      rmSync(dbPath, { force: true });
    }
  });

  it('повторный запуск — no-op: user_version на ожидаемом значении, схема не меняется', () => {
    const dbPath = join(tmpdir(), `wayfinder-s1-${randomUUID()}.sqlite`);
    try {
      const first = createDatabase(dbPath);
      expect(first.pragma('user_version', { simple: true })).toBe(1);
      first.close();

      // Второй открытие той же БД: миграция видит целевую версию и не трогает схему.
      const second = createDatabase(dbPath);
      const columns = (second.pragma('table_info(meetings)') as Array<{ name: string }>).map(
        (column) => column.name,
      );
      expect(columns).toEqual(['id', 'date', 'time', 'meeting_type_id', 'booker']);
      expect(second.pragma('user_version', { simple: true })).toBe(1);
      second.close();
    } finally {
      rmSync(dbPath, { force: true });
    }
  });
});

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

  it('после миграции дубль (date, time) по-прежнему бросает DuplicateMeetingError', () => {
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