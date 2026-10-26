import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;

@service(#{ title: "Календарь встреч" })
namespace CalendarOfMeetings;

/**
 * Записи на встречи.
 *
 * Роль определяется по cookie `role`: `/admin` → `admin`, остальное → `guest`
 * (клиент ставит её по URL; сервер не проверяет пароли и не выдает сессий).
 * Админские ручки требуют роль `admin` (иначе 403).
 *
 * Доменные правила букинга — окно 14 дней, прошедшие даты, выходные, сетка
 * времени — сервер проверяет (ADR-0009, server/booking-rules.ts). Формат
 * проверяется по сгенерированным схемам через `ajv` (K4); целостность —
 * несуществующий или деактивированный тип, корректное имя записавшегося из тела
 * (S5/C1). Русские тексты ошибок — в `server/routes.ts`.
 */

/**
 * Запись на встречу. Дата и время — строки в том формате, в котором их отдаёт
 * Mantine: 'YYYY-MM-DD' и 'HH:mm'.
 */
model Meeting {
  /** Идентификатор, присваиваемый базой данных. */
  id: string;
  /** День встречи, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string;
  /** Начало встречи, 'HH:mm'. */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") time: string;
}

/**
 * Данные новой записи — всё, кроме идентификатора.
 * Имя записавшегося `booker_name` передаётся из формы (не из сессии).
 */
model MeetingDraft {
  /** День встречи, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string;
  /** Начало встречи, 'HH:mm'. */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") time: string;
  /**
   * Имя записавшегося: непустая строка без пробельных только из пробелов,
   * не длиннее 100 символов.
   */
  @minLength(1) @maxLength(100) @pattern("\\S") booker_name: string;
  /**
   * Тип встречи. Если поле передано — тип обязан существовать и быть активным,
   * иначе 400; без поля запись создаётся «нетипизированной».
   */
  meeting_type_id?: string;
}

/** Полуинтервал дат для запроса списка записей, обе границы включительно. */
model DateRange {
  /** День начала, включительно, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") from: string;
  /** День конца, включительно, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") to: string;
}

/**
 * Тип встречи, предлагаемый администратором (Q2). Удаления нет: деактивация —
 * единственный конец жизненного цикла (Q7).
 */
model MeetingType {
  /** Идентификатор, присваиваемый базой данных. */
  id: string;
  /** Название типа — непустая строка. */
  @minLength(1) name: string;
  /** Описание типа. */
  description: string;
  /**
   * Длительность встречи этого типа в минутах: 30–180, кратно 30. Кратность
   * тридцати проверяет роут; информационное поле: сетку слотов и занятость
   * оно не меняет (ADR-0008).
   */
  @minValue(30) @maxValue(180) duration_minutes: int32;
  /** Активен ли тип: деактивированный нельзя выбрать при новой записи (Q7). */
  active: boolean;
}

/** Данные нового типа встречи — всё, кроме идентификатора и признака активности. */
model MeetingTypeDraft {
  /**
   * Название типа — непустая строка, минимум один непробельный символ.
   */
  @minLength(1) @pattern("\\S") name: string;
  /** Описание типа. */
  description: string;
  /** Длительность встреч этого типа в минутах: 30–180, кратно 30. */
  @minValue(30) @maxValue(180) duration_minutes: int32;
}

/**
 * Строка админского списка запланированных встреч: LEFT JOIN, поэтому у старых
 * «нетипизированных» записей `type` и `booker` равны null (C5).
 */
model PlannedMeeting {
  /** День встречи, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string;
  /** Начало встречи, 'HH:mm'. */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") time: string;
  /** Название типа встречи; null у старой записи без типа. */
  type: string | null;
  /** Имя записавшегося; null у старой записи без booker. */
  booker: string | null;
}

/** Форма всех ошибок API: русское описание уходит клиенту как есть. */
model ErrorResponse {
  error: string;
}

// ===== Ответы

model OkMeetingList {
  @statusCode _: 200;
  @body meetings: Meeting[];
}

model OkMeetingTypeList {
  @statusCode _: 200;
  @body meetingTypes: MeetingType[];
}

model OkMeetingType {
  @statusCode _: 200;
  @body meetingType: MeetingType;
}

/** Все запланированные встречи для админа (S4): сегодня и будущее, без горизонта. */
model OkPlannedMeetingList {
  @statusCode _: 200;
  @body meetings: PlannedMeeting[];
}

model CreatedMeeting {
  @statusCode _: 201;
  @body meeting: Meeting;
}

model CreatedMeetingType {
  @statusCode _: 201;
  @body meetingType: MeetingType;
}

model NoContent {
  @statusCode _: 204;
}

model BadRequest {
  @statusCode _: 400;
  @body error: ErrorResponse;
}

/** Нет прав: роль не admin (ADR-0010). */
model Forbidden {
  @statusCode _: 403;
  @body error: ErrorResponse;
}

model Conflict {
  @statusCode _: 409;
  @body error: ErrorResponse;
}

// ===== Операции

/** Записи за полуинтервал дат, обе границы включительно, в порядке возрастания (date, time). */
@route("/api/meetings")
@get
op listMeetings(
  @doc("День начала, включительно, 'YYYY-MM-DD'.") @query from: string,
  @doc("День конца, включительно, 'YYYY-MM-DD'.") @query to: string,
): OkMeetingList | BadRequest;

/**
 * Создание записи. Формат — 400; занятый слот — 409 (UNIQUE(date, time) в базе).
 * Выбор несуществующего/деактивированного типа — тоже 400. Домен — 400
 * (прошедшее/выходное/вне окна/сетка/уже начавшийся слот) по ADR-0009.
 * `booker_name` берётся из тела и обязателен; роль определяется по cookie `role`.
 * Возвращает запись с присвоенным id.
 */
@route("/api/meetings")
@post
op createMeeting(@body draft: MeetingDraft):
  | CreatedMeeting
  | BadRequest
  | Conflict;

/**
 * Список типов встреч. Гость видит только активные, админ — все (Q2/Q7).
 */
@route("/api/meeting-types")
@get
op listMeetingTypes(): OkMeetingTypeList;

/** Создание типа встречи. Только админ. */
@route("/api/meeting-types")
@post
op createMeetingType(@body draft: MeetingTypeDraft):
  | CreatedMeetingType
  | BadRequest
  | Forbidden;

/** Деактивация типа; удаления нет (Q7). Только админ. */
@route("/api/meeting-types/{id}/deactivate")
@post
op deactivateMeetingType(@path id: string):
  | OkMeetingType
  | BadRequest
  | Forbidden;

/**
 * Все запланированные встречи одним списком: сегодня и будущее, по возрастанию
 * (date, time), без 14-дневного горизонта. Только админ.
 */
@route("/api/admin/meetings")
@get
op listPlannedMeetings(): OkPlannedMeetingList | Forbidden;
