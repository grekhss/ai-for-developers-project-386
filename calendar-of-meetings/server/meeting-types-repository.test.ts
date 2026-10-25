// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './db.js';
import { createMeetingTypesRepository } from './meeting-types-repository.js';

describe('createMeetingTypesRepository', () => {
  function repo() {
    return createMeetingTypesRepository(createDatabase(':memory:'));
  }

  it('пустая БД отдаёт два пустых списка', () => {
    expect(repo().listAll()).toEqual([]);
    expect(repo().listActive()).toEqual([]);
  });

  it('create возвращает тип с id строкой, active: true и длительностью', () => {
    const created = repo().create({ name: 'Консультация', description: '30 минут', duration_minutes: 30 });

    expect(created).toEqual({
      id: '1',
      name: 'Консультация',
      description: '30 минут',
      duration_minutes: 30,
      active: true,
    });
    expect(typeof created.id).toBe('string');
  });

  it('списки отдают типы в порядке создания (по id)', () => {
    const types = repo();
    types.create({ name: 'Первый', description: '', duration_minutes: 30 });
    types.create({ name: 'Второй', description: '', duration_minutes: 60 });

    expect(types.listAll().map((type) => type.name)).toEqual(['Первый', 'Второй']);
  });

  it('deactivate помечает тип неактивным: listActive его скрывает, listAll — нет', () => {
    const types = repo();
    types.create({ name: 'Консультация', description: '', duration_minutes: 30 });
    types.create({ name: 'Собеседование', description: '', duration_minutes: 60 });

    const deactivated = types.deactivate('1');
    expect(deactivated).toEqual({
      id: '1',
      name: 'Консультация',
      description: '',
      duration_minutes: 30,
      active: false,
    });

    expect(types.listActive().map((type) => type.name)).toEqual(['Собеседование']);
    expect(types.listAll().map((type) => type.name)).toEqual(['Консультация', 'Собеседование']);
  });

  it('deactivate неизвестного id возвращает undefined', () => {
    const types = repo();
    expect(types.deactivate('99')).toBeUndefined();
    // Нечисловой id тоже undefined, а не исключение: строка в чужих руках
    // вида 'abc' просто не находит строку (сравнение INTEGER-колонки с текстом).
    expect(types.deactivate('abc')).toBeUndefined();
    // Пустая таблица: UPDATE трогает ноль строк.
    expect(types.deactivate('1')).toBeUndefined();
  });

  it('повторная деактивация идемпотентна — тип возвращается неактивным', () => {
    const types = repo();
    types.create({ name: 'Консультация', description: '', duration_minutes: 30 });

    expect(types.deactivate('1')?.active).toBe(false);
    expect(types.deactivate('1')).toEqual({
      id: '1',
      name: 'Консультация',
      description: '',
      duration_minutes: 30,
      active: false,
    });
  });

  it('миграция v1→v2 добавляет duration_minutes легаси-типам (дефолт 30)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'com-types-'));
    const dbPath = join(dir, 'meetings.sqlite');
    try {
      // Ручная БД схемы v1: без duration_minutes, user_version = 1.
      const legacy = new Database(dbPath);
      legacy.exec(`
        CREATE TABLE meeting_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE meetings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          UNIQUE(date, time)
        );
      `);
      legacy.prepare('INSERT INTO meeting_types (name, description) VALUES (?, ?)').run('Легаси', '');
      legacy.pragma('user_version = 1');
      legacy.close();

      // createDatabase доводит старую БД до v2: колонка появляется, легаси-строки
      // получают NOT NULL DEFAULT 30, новые идут с явной длительностью.
      const migrated = createMeetingTypesRepository(createDatabase(dbPath));
      expect(migrated.listAll()).toEqual([
        { id: '1', name: 'Легаси', description: '', duration_minutes: 30, active: true },
      ]);
      migrated.create({ name: 'Новый', description: '', duration_minutes: 90 });
      expect(migrated.listAll().map((type) => type.duration_minutes)).toEqual([30, 90]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
