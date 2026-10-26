/**
 * Доменные правила букинга (замечание ревью №2, ADR-0009): окно записи,
 * прошедшие даты, выходные и сетка времени. Дублируют правила фронта
 * (`src/lib/window.ts`, `src/lib/slots.ts`) осознанно: сервер не импортирует
 * `src/` (rootDir: server), а `shared/`-модуль решили не заводить (ADR-0009).
 *
 * Правила чистые: «сейчас» приходит параметром `moment` ('YYYY-MM-DD HH:mm'),
 * и эти функции часов не читают (T3) — вызов делает роут, передавая `now()`
 * из server/date.ts. Форматы 'YYYY-MM-DD' и 'HH:mm' лексикографически
 * упорядочены, поэтому сравнение — сравнение строк.
 */

/** Ширина окна записи в календарных днях, обе границы включительно (как Q5). */
export const BOOKING_WINDOW_DAYS = 14;

/** Начало рабочего дня, минуты от полуночи. */
const WORK_DAY_START_MINUTES = 9 * 60;

/** Конец рабочего дня — момент, к которому встреча должна закончиться. */
const WORK_DAY_END_MINUTES = 18 * 60;

/** Шаг сетки слотов, минуты. */
export const SLOT_STEP_MINUTES = 30;

/** Дата, отстоящая на days: арифметика по UTC — для дат без времени она точна. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${shiftedMonth}-${shiftedDay}`;
}

/** Прошедший день: раньше дня переданного момента (сегодня — ещё не прошлое). */
export function isPastDay(date: string, moment: string): boolean {
  return date < moment.slice(0, 10);
}

/** Выходной: суббота или воскресенье. */
export function isWeekendDay(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Последний день окна включительно: сегодня + 13. */
export function windowEnd(moment: string): string {
  return addDays(moment.slice(0, 10), BOOKING_WINDOW_DAYS - 1);
}

/**
 * Время в сетке рабочего дня: начало не раньше 09:00, встреча кончается к
 * 18:00 (последний слот — 17:30), шаг кратен 30 минутам.
 */
export function isAllowedTime(time: string): boolean {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  const start = hours * 60 + minutes;
  return (
    start >= WORK_DAY_START_MINUTES &&
    start + SLOT_STEP_MINUTES <= WORK_DAY_END_MINUTES &&
    start % SLOT_STEP_MINUTES === 0
  );
}

/**
 * Сегодняшний слот уже начался: день — сегодня, а время не позже текущего.
 * Слот, начинающийся ровно сейчас, записать нельзя — он уже идёт (как Q5).
 */
export function isSlotAlreadyStarted(date: string, time: string, moment: string): boolean {
  return date === moment.slice(0, 10) && time <= moment.slice(11);
}
