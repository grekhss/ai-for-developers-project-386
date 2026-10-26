import type { components, operations } from './contract.gen.js';

/**
 * Типы контракта сервера — alias'ы из сгенерированного файла (K1, ADR-0004).
 * Источник истины — contract/main.tsp; руками не правится.
 */

/** Запись на встречу. Дата и время — строки 'YYYY-MM-DD' и 'HH:mm'. */
export type Meeting = components['schemas']['Meeting'];
/** Данные новой записи — всё, кроме идентификатора. */
export type MeetingDraft = components['schemas']['MeetingDraft'];

/** Тип встречи (S3): id строкой, active — boolean из INTEGER-колонки. */
export type MeetingType = components['schemas']['MeetingType'];
/** Данные нового типа встречи (S3). */
export type MeetingTypeDraft = components['schemas']['MeetingTypeDraft'];

/**
 * Строка админского списка (S4): LEFT JOIN встреч с типами; у легаси-записи
 * без типа `type` null, у старой без автора `booker` null (C5).
 */
export type PlannedMeeting = components['schemas']['PlannedMeeting'];

/** Тело POST /api/meetings. */
export type CreateMeetingBody = operations['createMeeting']['requestBody']['content']['application/json'];
/** Query GET /api/meetings: from и to обязательны, обе границы включительно. */
export type ListMeetingsQuery = operations['listMeetings']['parameters']['query'];
/** Тело POST /api/meeting-types. */
export type CreateMeetingTypeBody =
  operations['createMeetingType']['requestBody']['content']['application/json'];
