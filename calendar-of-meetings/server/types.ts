import type { components } from './contract.gen.js';

/**
 * Типы контракта сервера — alias'ы из сгенерированного файла (K1, ADR-0004).
 * openapi-typescript отдаёт модели как components['schemas'][...], поэтому
 * здесь alias'ы, а не re-export имён. Источник истины — contract/main.tsp;
 * руками не правится, правка идёт там с последующим `npm run contract`.
 * Session и LoginInput берут типы оттуда же — в server/session.ts и
 * server/validate.ts.
 */

/** Запись на встречу. Дата и время — строки 'YYYY-MM-DD' и 'HH:mm'. */
export type Meeting = components['schemas']['Meeting'];
/** Данные новой записи — всё, кроме идентификатора. */
export type MeetingDraft = components['schemas']['MeetingDraft'];
