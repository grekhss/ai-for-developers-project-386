import { createApp } from './app.js';
import { createDatabase, defaultDbPath } from './db.js';
import { createRepository } from './repository.js';

// Точка входа dev- и prod-процесса: только wiring. Тесты импортируют app.ts,
// а не index.ts — этот файл биндит порт и открывает файловую БД.
// Это единственное место, читающее process.env (D1): значения уходят в
// createApp, который их валидирует и падает с подсказкой про .env.example.
const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH = process.env.MEETINGS_DB_PATH ?? defaultDbPath();

const app = createApp(createRepository(createDatabase(DB_PATH)), {
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  guestPassword: process.env.GUEST_PASSWORD ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  // Secure в проде, без него в dev — http://localhost не даёт Secure-cookie (D3).
  secureCookie: process.env.NODE_ENV === 'production',
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
