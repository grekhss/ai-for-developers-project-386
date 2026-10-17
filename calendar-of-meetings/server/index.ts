import { createApp } from './app.js';
import { createDatabase, defaultDbPath } from './db.js';
import { createRepository } from './repository.js';

// Точка входа dev- и prod-процесса: только wiring. Тесты импортируют app.ts,
// а не index.ts — этот файл биндит порт и открывает файловую БД.
const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH = process.env.MEETINGS_DB_PATH ?? defaultDbPath();

const app = createApp(createRepository(createDatabase(DB_PATH)));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});