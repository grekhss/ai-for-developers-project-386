import { createApp } from './app.js';
import { createDatabase, defaultDbPath } from './db.js';
import { createMeetingTypesRepository } from './meeting-types-repository.js';
import { createRepository } from './repository.js';

// Точка входа: только wiring. Тесты импортируют app.ts, а не index.ts.
const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH = process.env.MEETINGS_DB_PATH ?? defaultDbPath();

const db = createDatabase(DB_PATH);
const app = createApp({
  meetings: createRepository(db),
  meetingTypes: createMeetingTypesRepository(db),
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
