// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BOOKING_WINDOW_DAYS,
  isAllowedTime,
  isPastDay,
  isSlotAlreadyStarted,
  isWeekendDay,
  windowEnd,
} from './booking-rules.js';

// Правила чистые (T3): момент — фиксированной строкой, часы не читаются,
// поэтому границы проверяются точно, а не «как получится» при запуске.
const MOMENT = '2026-10-25 12:00'; // воскресенье

describe('booking-rules', () => {
  it('isPastDay: раньше сегодня — прошлое, сегодня и завтра — нет', () => {
    expect(isPastDay('2026-10-24', MOMENT)).toBe(true);
    expect(isPastDay('2026-10-25', MOMENT)).toBe(false);
    expect(isPastDay('2026-10-26', MOMENT)).toBe(false);
  });

  it('isWeekendDay ловит субботу и воскресенье, будни пропускает', () => {
    expect(isWeekendDay('2026-10-24')).toBe(true); // суббота
    expect(isWeekendDay('2026-10-25')).toBe(true); // воскресенье
    expect(isWeekendDay('2026-10-26')).toBe(false); // понедельник
    expect(isWeekendDay('2026-10-30')).toBe(false); // пятница
  });

  it('windowEnd — последний день окна: сегодня + 13, границы окна включительно', () => {
    expect(windowEnd(MOMENT)).toBe('2026-11-07');
    // Сам «сегодня» — первый день окна, windowEnd — последний: оба в окне.
    expect(windowEnd(MOMENT) > MOMENT.slice(0, 10)).toBe(true);
    // Внутри окна последний день не считается прошедшим/вне окна.
    expect(isPastDay(windowEnd(MOMENT), MOMENT)).toBe(false);
  });

  it('isAllowedTime: 09:00 и 17:30 — да; до 09:00, после 17:30 и не кратно 30 — нет', () => {
    expect(isAllowedTime('08:30')).toBe(false);
    expect(isAllowedTime('09:00')).toBe(true);
    expect(isAllowedTime('10:15')).toBe(false); // внутри дня, но не на сетке
    expect(isAllowedTime('17:30')).toBe(true); // последний слот
    expect(isAllowedTime('18:00')).toBe(false); // встреча не кончится к 18:00
  });

  it('isSlotAlreadyStarted: сегодня и не позже «сейчас» — да; будущие дни — нет', () => {
    expect(isSlotAlreadyStarted('2026-10-25', '12:00', MOMENT)).toBe(true); // ровно сейчас
    expect(isSlotAlreadyStarted('2026-10-25', '11:30', MOMENT)).toBe(true);
    expect(isSlotAlreadyStarted('2026-10-25', '12:30', MOMENT)).toBe(false);
    expect(isSlotAlreadyStarted('2026-10-26', '09:00', MOMENT)).toBe(false);
  });

  it('окно — 14 дней: выходные внутри окна найдёт любой реальный запуск', () => {
    // Инвариант константы: окно всегда содержит хотя бы одни выходные,
    // поэтому правило «будни» действительно отбрасывает часть дней.
    expect(BOOKING_WINDOW_DAYS).toBe(14);
  });
});
