import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { MeetingTypesRepository } from './meeting-types-repository.js';
import type { MeetingsRepository } from './repository.js';
import { createRoutes } from './routes.js';

export interface AppOptions {
  /** Пароль администратора (D1: только env, инжекция в фабрику). */
  adminPassword: string;
  /** Общий (гостевой) пароль. */
  guestPassword: string;
  /** Секрет подписи сессионных cookie. */
  sessionSecret: string;
  /** Secure-флаг cookie: в проде true, в dev false (D3). */
  secureCookie?: boolean;
  /** Каталог собранного фронта. По умолчанию dist/ рядом с пакетом. */
  staticDir?: string;
}

/**
 * Репозитории, которые получает фабрика: объект, а не позиционный список —
 * на S3 их стало два, а S4 добавит админ-лист как метод meetings-репо, так что
 * набор финальный. Тесты подают in-memory БД, prod собирает из одного db.
 */
export interface AppRepositories {
  meetings: MeetingsRepository;
  meetingTypes: MeetingTypesRepository;
}

/**
 * Конфиг обязательный и проверяется до любого роутинга: пустой пароль совпал бы
 * с пустой отправкой, а пустой секрет сделал бы подпись cookie бессмысленной.
 * Одинаковые пароли делают роль неопределимой — оба случая фатальны (C8).
 */
function assertValidAuth(options: AppOptions): void {
  const { adminPassword, guestPassword, sessionSecret } = options;
  if (
    typeof adminPassword !== 'string' ||
    adminPassword.trim() === '' ||
    typeof guestPassword !== 'string' ||
    guestPassword.trim() === '' ||
    typeof sessionSecret !== 'string' ||
    sessionSecret.trim() === ''
  ) {
    throw new Error(
      'ADMIN_PASSWORD, GUEST_PASSWORD и SESSION_SECRET обязательны и не могут быть пустыми — скопируйте .env.example в .env',
    );
  }
  if (adminPassword === guestPassword) {
    throw new Error('ADMIN_PASSWORD и GUEST_PASSWORD не должны совпадать — по паролю определяется роль');
  }
}

/**
 * Фабрика express-приложения, а не модульный синглтон: тесты собирают своё
 * приложение на ':memory:'-репозитории. Здесь нет и никакого listen на импорте —
 * его делает только index.ts.
 */
export function createApp(repos: AppRepositories, options: AppOptions): express.Express {
  assertValidAuth(options);

  const app = express();
  app.use(express.json());
  // Секрет подписи cookie — из инжектированного конфига; req.signedCookies
  // появляется только с этим middleware (D3).
  app.use(cookieParser(options.sessionSecret));
  app.use(createRoutes(repos, { ...options, secureCookie: options.secureCookie ?? false }));

  // Статику отдаём из dist/ (в dev её раздаёт Vite; если dist/ ещё нет — запросы
  // просто уходят дальше). Путь — от файла app.js, а не от cwd: и в dev
  // (server/), и в проде (dist-server/) верхний каталог — корень пакета.
  // SPA-fallback не нужен: клиентского роутера нет.
  const staticDir = options.staticDir ?? join(import.meta.dirname, '..', 'dist');
  app.use(express.static(staticDir));

  return app;
}