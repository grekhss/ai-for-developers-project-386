import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { MeetingTypesRepository } from './meeting-types-repository.js';
import type { MeetingsRepository } from './repository.js';
import { createRoutes } from './routes.js';

export interface AppOptions {
  /** Каталог собранного фронта. По умолчанию dist/ рядом с пакетом. */
  staticDir?: string;
}

/**
 * Репозитории, которые получает фабрика: объект, а не позиционный список.
 * Тесты собирают приложение на ':memory:'-репозитории.
 */
export interface AppRepositories {
  meetings: MeetingsRepository;
  meetingTypes: MeetingTypesRepository;
}

/**
 * Фабрика express-приложения, а не модульный синглтон.
 * Роль берётся из cookie `role` по URL страницы (ADR-0010); сессий нет.
 */
export function createApp(repos: AppRepositories, options: AppOptions = {}): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', createRoutes(repos));

  const staticDir = options.staticDir ?? join(import.meta.dirname, '..', 'dist');
  app.use(express.static(staticDir));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(join(staticDir, 'index.html'), (error?: Error) => {
      if (error) next();
    });
  });

  return app;
}