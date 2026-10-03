import dayjs from 'dayjs';
import 'dayjs/locale/ru';

/**
 * Локаль приложения. Этим же значением настраивается DatesProvider в main.tsx,
 * чтобы календарь и тексты всегда были на одном языке.
 */
export const APP_LOCALE = 'ru';

/** Сегодняшняя дата в формате DateStringValue ('YYYY-MM-DD'). */
export function today(): string {
  return dayjs().format('YYYY-MM-DD');
}

/** Выходной: суббота или воскресенье. */
export function isWeekend(date: string): boolean {
  const day = dayjs(date).day();
  return day === 0 || day === 6;
}

/**
 * Дата раньше сегодняшней. Сравнение по дням, а не по точному времени, иначе
 * сегодняшний день считался бы прошедшим в течение суток.
 */
export function isPast(date: string): boolean {
  return dayjs(date).isBefore(dayjs(), 'day');
}

/**
 * День, в который можно записаться: не прошедший и не выходной. Правило
 * держится здесь, а не в компоненте: дальше к выходным добавятся праздники и
 * дни без свободных слотов.
 */
export function isBookable(date: string): boolean {
  return !isPast(date) && !isWeekend(date);
}

/** Дата по-русски: «3 октября 2026». */
export function formatDateRu(date: string): string {
  return dayjs(date).locale(APP_LOCALE).format('D MMMM YYYY');
}
