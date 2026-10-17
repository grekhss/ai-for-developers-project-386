import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

/** Путь к файлу БД по умолчанию: data/meetings.sqlite в корне пакета. */
export function defaultDbPath(): string {
  // import.meta.dirname — каталог исполняемого файла: server/ в dev,
  // dist-server/ в проде. В обоих случаях «на каталог выше» — корень пакета,
  // поэтому путь не зависит от cwd и не попадает в артефакты сборки.
  return join(import.meta.dirname, '..', 'data', 'meetings.sqlite');
}

/**
 * Открывает (или создаёт) БД и гарантирует схему. Уникальность слота — на
 * уровне базы: UNIQUE(date, time), так дубль отклоняется самим хранилищем.
 * ':memory:' используется в тестах — для него mkdir не нужен.
 */
export function createDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    // better-sqlite3 каталог не создаёт: без mkdir первый запуск на чистом
    // клоне упал бы с ENOENT.
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      UNIQUE(date, time)
    )
  `);

  return db;
}