import { join } from 'node:path';
import express from 'express';
import type { MeetingsRepository } from './repository.js';
import { createRoutes } from './routes.js';

export interface AppOptions {
  /** Каталог собранного фронта. По умолчанию dist/ рядом с пакетом. */
  staticDir?: string;
}

/**
 * Фабрика express-приложения, а не модульный синглтон: тесты собирают своё
 * приложение на ':memory:'-репозитории. Здесь нет и никакого listen на импорте —
 * его делает только index.ts.
 */
export function createApp(repo: MeetingsRepository, options: AppOptions = {}): express.Express {
  const app = express();
  app.use(express.json());
  app.use(createRoutes(repo));

  // Статику отдаём из dist/ (в dev её раздаёт Vite; если dist/ ещё нет — запросы
  // просто уходят дальше). Путь — от файла app.js, а не от cwd: и в dev
  // (server/), и в проде (dist-server/) верхний каталог — корень пакета.
  // SPA-fallback не нужен: клиентского роутера нет.
  const staticDir = options.staticDir ?? join(import.meta.dirname, '..', 'dist');
  app.use(express.static(staticDir));

  return app;
}