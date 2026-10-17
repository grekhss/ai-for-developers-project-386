import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;

/**
 * Единый декларативный контракт API «Календаря встреч» — единственный источник
 * истины (K1, ADR-0004). Из него генерируются contract/openapi.yaml, TS-типы
 * для фронта (src/lib/contract.gen.ts) и сервера (server/contract.gen.ts);
 * руками .gen.ts не правятся — только npm run contract.
 *
 * Брони слотов на встречи. Все /api, кроме входа, требуют сессионную cookie.
 *
 * Контракт описывает формат и схему, не домен: прошедшие даты, выходные и
 * сетка слотов остаются фронтовой политикой, сервер валидирует только формат
 * (server/validate.ts).
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

model CreatedMeeting {
  @statusCode _: 201;
  @body meeting: Meeting;
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

/** Выход: сессионная cookie очищается, тела нет. */
@route("/api/logout")
@post
@useAuth(SessionCookie)
op logout(): NoContent;

/** Восстановление роли после перезагрузки: cookie httpOnly, клиент прочитать её не может. */
@route("/api/me")
@get
@useAuth(SessionCookie)
op getCurrentSession(): OkSession;

/** Записи за полуинтервал дат, обе границы включительно, в порядке возрастания (date, time). */
@route("/api/meetings")
@get
@useAuth(SessionCookie)
op listMeetings(
  @doc("День начала, включительно, 'YYYY-MM-DD'.") @query from: string,
  @doc("День конца, включительно, 'YYYY-MM-DD'.") @query to: string,
): { @statusCode _: 200; @body meetings: Meeting[] };

/**
 * Создание записи. Уже занятый слот — 409 (UNIQUE(date, time) в базе).
 * Возвращает запись с присвоенным id.
 */
@route("/api/meetings")
@post
@useAuth(SessionCookie)
op createMeeting(@body draft: MeetingDraft): CreatedMeeting | Conflict;
