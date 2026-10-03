import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { APP_LOCALE, today, isWeekend, isPast, isBookable, formatDateRu } from './date.ts';

describe('today', () => {
  it('возвращает дату в формате YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today()).toBe(dayjs().format('YYYY-MM-DD'));
  });
});

describe('isWeekend', () => {
  it('считает субботу и воскресенье выходными', () => {
    expect(isWeekend('2026-10-03')).toBe(true);
    expect(isWeekend('2026-10-04')).toBe(true);
  });

  it('не считает будни выходными', () => {
    expect(isWeekend('2026-10-05')).toBe(false);
    expect(isWeekend('2026-10-09')).toBe(false);
  });
});

describe('isPast', () => {
  it('считает прошедшие даты прошедшими', () => {
    expect(isPast('2020-01-01')).toBe(true);
  });

  it('не считает сегодняшний и будущие дни прошедшими', () => {
    expect(isPast(today())).toBe(false);
    expect(isPast(dayjs().add(1, 'day').format('YYYY-MM-DD'))).toBe(false);
  });
});

describe('isBookable', () => {
  // Даты вычисляются от текущего дня: фиксированные даты рано или поздно
  // уедут в прошлое и тест начнёт врать.
  function findNext(predicate: (date: string) => boolean): string {
    for (let shift = 0; shift <= 7; shift += 1) {
      const date = dayjs().add(shift, 'day').format('YYYY-MM-DD');
      if (predicate(date)) return date;
    }

    throw new Error('Подходящей даты не нашлось');
  }

  it('разрешает ближайший будний день', () => {
    expect(isBookable(findNext((date) => !isWeekend(date)))).toBe(true);
  });

  it('запрещает выходные', () => {
    expect(isBookable(findNext(isWeekend))).toBe(false);
  });

  it('запрещает прошедшие дни', () => {
    expect(isBookable('2020-01-01')).toBe(false);
  });
});

describe('formatDateRu', () => {
  it('печатает дату по-русски', () => {
    expect(formatDateRu('2026-10-03')).toBe('3 октября 2026');
  });

  it('использует локаль приложения', () => {
    expect(APP_LOCALE).toBe('ru');
  });
});
