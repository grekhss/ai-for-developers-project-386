import { describe, expect, it } from 'vitest';
import {
  DURATION_MAX,
  DURATION_MIN,
  DURATION_STEP,
  formatDurationRu,
  isValidDuration,
} from './duration.ts';

describe('duration', () => {
  it('formatDurationRu выводит минуты — все допустимые значения кратны 30', () => {
    for (const minutes of [30, 60, 90, 120, 150, 180]) {
      expect(formatDurationRu(minutes), `значение ${minutes}`).toBe(`${minutes} минут`);
    }
  });

  it('isValidDuration пропускает границы включительно и отклоняет чужие', () => {
    // Позитив: обе границы и значение между ними.
    expect(isValidDuration(DURATION_MIN)).toBe(true);
    expect(isValidDuration(60)).toBe(true);
    expect(isValidDuration(DURATION_MAX)).toBe(true);
    // Негатив: за границами и не кратно шагу.
    expect(isValidDuration(DURATION_MIN - 1)).toBe(false);
    expect(isValidDuration(DURATION_MAX + 1)).toBe(false);
    expect(isValidDuration(45)).toBe(false);
    expect(isValidDuration(0)).toBe(false);
  });

  it('isValidDuration отклоняет пустое поле NumberInput и не-числа', () => {
    expect(isValidDuration('')).toBe(false);
    expect(isValidDuration('30')).toBe(false);
  });

  it('константы согласованы: границы кратны шагу', () => {
    expect(DURATION_MIN % DURATION_STEP).toBe(0);
    expect(DURATION_MAX % DURATION_STEP).toBe(0);
  });
});
