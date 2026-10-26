import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Импорт — именованный, и это не стилистика: у ajv 8.20 нет `exports`-карты и
// `type: module`, файлы CommonJS, а `.d.ts` написан как ES-модуль. В `nodenext`
// дефолтный импорт отдаёт тип модульного namespace — `new Ajv2020(...)` тогда
// не компилируется (TS2351), хотя в рантайме Node и подставляет класс. Имя
// `Ajv2020` есть и в `.d.ts`, и в `module.exports`, так что только оно совпадает
// в типах и в рантайме. Путь обязан быть полным, с `.js`, — иначе TS2307.
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { CreateMeetingBody, CreateMeetingTypeBody, ListMeetingsQuery } from './types.js';

/**
 * Форматная валидация по схемам контракта (K4, ADR-0005).
 *
 * Схемы приходят из contract/schema/ — той же компиляции contract/main.tsp.
 * Рукописное в routes.ts — то, что JSON Schema не выразит: обёртка
 * `req.body === undefined`, доменные правила (ADR-0009), целостность
 * meeting_type_id и booker_name из тела.
 */

const SCHEMA_PATH = join(
  import.meta.dirname,
  '..',
  'contract',
  'schema',
  'calendar-of-meetings.json',
);

const { $defs: defs } = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
  $defs: Record<string, object>;
};

const ajv = new Ajv2020({ strict: true });

function schemaOf(model: string): object {
  const schema = defs[model];
  if (schema === undefined) {
    throw new Error(`в contract/schema нет схемы модели ${model}`);
  }
  return schema;
}

const validDraft = ajv.compile<CreateMeetingBody>(schemaOf('MeetingDraft'));
const validRange = ajv.compile<ListMeetingsQuery>(schemaOf('DateRange'));
const validMeetingTypeDraft = ajv.compile<CreateMeetingTypeBody>(schemaOf('MeetingTypeDraft'));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function isValidDraft(body: unknown): body is CreateMeetingBody {
  return isObject(body) && validDraft(body);
}

export function isValidRange(query: unknown): query is ListMeetingsQuery {
  return isObject(query) && validRange(query);
}

export function isValidMeetingTypeDraft(body: unknown): body is CreateMeetingTypeBody {
  return isObject(body) && validMeetingTypeDraft(body);
}
