/**
 * Длительность типа встречи: границы, шаг и формат живут здесь, в домене, —
 * их не переизобретают ни AdminView, ни GuestView. Значения те же, что в
 * контракте (`contract/main.tsp`, minValue/maxValue) и на сервере (кратность
 * шагу проверяет роут): расхождение поймают тесты на границы ниже.
 */

/** Минимальная длительность типа встречи, минуты. */
export const DURATION_MIN = 30;

/** Максимальная длительность типа встречи, минуты. */
export const DURATION_MAX = 180;

/** Шаг длительности: слот — 30 минут, поэтому и типы кратны 30. */
export const DURATION_STEP = 30;

/**
 * «30 минут»: все допустимые значения кратны 30 (30…180), поэтому родительный
 * падеж множественного числа — всегда верная форма, склонение не нужно.
 */
export function formatDurationRu(minutes: number): string {
  return `${minutes} минут`;
}

/**
 * Длительность можно отправить: число в границах, кратно шагу. NumberInput
 * отдаёт и пустую строку — её и не-число отклоняем здесь, до запроса.
 */
export function isValidDuration(value: number | string): value is number {
  return (
    typeof value === 'number' &&
    value >= DURATION_MIN &&
    value <= DURATION_MAX &&
    value % DURATION_STEP === 0
  );
}
