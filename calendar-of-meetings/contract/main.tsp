import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;

/**
 * Единый декларативный контракт API «Календаря встреч» — единственный источник
 * истины (K1, ADR-0004). Из него генерируются contract/openapi.yaml, TS-типы
 * для фронта (src/lib/contract.gen.ts) и сервера (server/contract.gen.ts);
 * руками .gen.ts не правятся — только `npm run contract`.
 *
 * Записи на встречи. Все /api, кроме входа, требуют сессионную cookie;
 * админские ручки дополнительно требуют роль admin (иначе 403).
 *
 * Контракт описывает формат и схему, не домен: прошедшие даты, выходные и
 * сетка слотов остаются фронтовой политикой, сервер валидирует только формат
 * (server/validate.ts).
 *
 * Часть ручек описана ЗАРАНЕЕ и сервером ещё не реализована (S3/S4): контракт
 * намеренно идёт впереди, чтобы клиентский SDK (K3) собрал их до реализации.
 * Тест сверяет с контрактом только фактически смонтированные роуты.
 */
@service(#{ title: "Календарь встреч" })
namespace CalendarOfMeetings;

/** Роль: определяется только сервером по совпадению пароля, с клиента не берётся. */
alias Role = "admin" | "guest";

/** Сессия — то, что подписано в httpOnly-cookie `session` и определяет доступ. */
model Session {
  role: Role;
  /** Имя записывающегося; у админа его нет. */
  bookerName: string | null;
}

/** Данные входа: пароль обязателен, имя гостя — опционально. */
model LoginInput {
  /** Пароль — непустая строка. */
  @minLength(1) password: string;
  /** Имя гостя: для гостя обязательно (непустая строка), для админа игнорируется. */
  bookerName?: string;
}

/**
 * Запись на встречу. Дата и время — строки в том формате, в котором их отдаёт
 * Mantine: 'YYYY-MM-DD' и 'HH:mm'. Строки, а не Date, ещё и потому, что
 * new Date('YYYY-MM-DD') разбирается как полночь UTC и в отрицательных
 * часовых поясах показывает предыдущий день.
 */
model Meeting {
  /** Идентификатор, присваиваемый базой данных. */
  id: string;
  /** День встречи, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string;
  /** Начало встречи, 'HH:mm'. */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") time: string;
}

/** Данные новой записи — всё, кроме идентификатора. */
model MeetingDraft {
  /** День встречи, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") date: string;
  /** Начало встречи, 'HH:mm'. */
  @pattern("^([01]\\d|2[0-3]):[0-5]\\d$") time: string;
}

/** Полуинтервал дат для запроса списка записей, обе границы включительно. */
model DateRange {
  /** День начала, включительно, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") from: string;
  /** День конца, включительно, 'YYYY-MM-DD'. */
  @pattern("^\\d{4}-\\d{2}-\\d{2}$") to: string;
}

/**
 * Тип встречи, предлагаемый администратором (Q2). Длительность не моделируется —
 * на сетку слотов она не влияет. Удаления нет: деактивация — единственный конец
 * жизненного цикла (Q7).
 */
model MeetingType {
  /** Идентификатор, присваиваемый базой данных. */
  id: string;
  /** Название типа — непустая строка. */
  @minLength(1) name: string;
  /** Описание типа. */
  description: string;
  /** Активен ли тип: деактивированный нельзя выбрать при новой записи (Q7). */
  active: boolean;
}

/** Данные нового типа встречи — всё, кроме идентификатора и признака активности. */
model MeetingTypeDraft {
  /** Название типа — непустая строка. */
  @minLength(1) name: string;
  /** Описание типа. */
  description: string;
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

/** Cookie-сессия: signed httpOnly-cookie `session`, SameSite=Lax, Max-Age 14 дней. */
alias SessionCookie = ApiKeyAuth<ApiKeyLocation.cookie, "session">;

// ===== Ответы

model OkSession {
  @statusCode _: 200;
  @body session: Session;
}

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

model Unauthorized {
  @statusCode _: 401;
  @body error: ErrorResponse;
}

/** Нет прав: сессия есть, но роль не admin (T2). */
model Forbidden {
  @statusCode _: 403;
  @body error: ErrorResponse;
}

model Conflict {
  @statusCode _: 409;
  @body error: ErrorResponse;
}

// ===== Операции

/**
 * Вход. Роль определяется только по паролю; для гостя обязателен непустой
 * bookerName (400), неверный пароль — 401. В ответ выставляется cookie `session`.
 */
@route("/api/login")
@post
op login(@body input: LoginInput):
  | OkSession
  | BadRequest
  | Unauthorized;

/** Выход: сессионная cookie очищается, тела нет. Без сессии — 401. */
@route("/api/logout")
@post
@useAuth(SessionCookie)
op logout(): NoContent | Unauthorized;

/** Восстановление роли после перезагрузки: cookie httpOnly, клиент прочитать её не может. */
@route("/api/me")
@get
@useAuth(SessionCookie)
op getCurrentSession(): OkSession | Unauthorized;

/** Записи за полуинтервал дат, обе границы включительно, в порядке возрастания (date, time). */
@route("/api/meetings")
@get
@useAuth(SessionCookie)
op listMeetings(
  @doc("День начала, включительно, 'YYYY-MM-DD'.") @query from: string,
  @doc("День конца, включительно, 'YYYY-MM-DD'.") @query to: string,
): OkMeetingList | BadRequest | Unauthorized;

/**
 * Создание записи. Формат — 400; занятый слот — 409 (UNIQUE(date, time) в базе).
 * Выбор несуществующего/деактивированного типа — тоже 400 (S5, C1).
 * Возвращает запись с присвоенным id.
 */
@route("/api/meetings")
@post
@useAuth(SessionCookie)
op createMeeting(@body draft: MeetingDraft):
  | CreatedMeeting
  | BadRequest
  | Unauthorized
  | Conflict;

// ===== Планируемые ручки (S3/S4) — описаны заранее, сервером пока не реализованы

/**
 * Список типов встреч. Гость видит только активные, админ — все (Q2/Q7). (S3)
 */
@route("/api/meeting-types")
@get
@useAuth(SessionCookie)
op listMeetingTypes(): OkMeetingTypeList | Unauthorized;

/** Создание типа встречи. Только админ. (S3) */
@route("/api/meeting-types")
@post
@useAuth(SessionCookie)
op createMeetingType(@body draft: MeetingTypeDraft):
  | CreatedMeetingType
  | BadRequest
  | Unauthorized
  | Forbidden;

/** Деактивация типа; удаления нет (Q7). Только админ. (S3) */
@route("/api/meeting-types/{id}/deactivate")
@post
@useAuth(SessionCookie)
op deactivateMeetingType(@path id: string):
  | OkMeetingType
  | BadRequest
  | Unauthorized
  | Forbidden;

/**
 * Все запланированные встречи одним списком: сегодня и будущее, по возрастанию
 * (date, time), без 14-дневного горизонта. Только админ (C5). (S4)
 */
@route("/api/admin/meetings")
@get
@useAuth(SessionCookie)
op listPlannedMeetings(): OkPlannedMeetingList | Unauthorized | Forbidden;
