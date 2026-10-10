import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { useBookings } from './useBookings.ts';
import { createInMemoryBookingsApi } from '../lib/bookings/inMemory.ts';
import type { BookingsApi } from '../lib/bookings/api.ts';
import type { Booking, DateRange } from '../lib/bookings/types.ts';
import { today } from '../lib/date.ts';

/** Дата внутри горизонта, который запрашивает хук. */
const futureDate = dayjs().add(7, 'day').format('YYYY-MM-DD');

function fakeApi(bookings: Booking[] = []): BookingsApi {
  return createInMemoryBookingsApi(bookings);
}

function failingApi(): BookingsApi {
  return {
    list: () => Promise.reject(new Error('нет связи')),
    create: () => Promise.reject(new Error('нет связи')),
  };
}

describe('useBookings', () => {
  it('загружает записи и снимает флаг загрузки', async () => {
    const api = fakeApi([{ id: '1', date: futureDate, time: '10:00' }]);

    const { result } = renderHook(() => useBookings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.bookings).toEqual([{ id: '1', date: futureDate, time: '10:00' }]);
    expect(result.current.error).toBeNull();
  });

  it('сообщает об ошибке загрузки и не бросает её наружу', async () => {
    const { result } = renderHook(() => useBookings(failingApi()));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.loading).toBe(false);
    expect(result.current.bookings).toEqual([]);
  });

  it('добавляет запись и перечитывает список', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useBookings(api));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const created = await result.current.createBooking({ date: futureDate, time: '11:00' });

    await waitFor(() => expect(result.current.bookings).toHaveLength(1));

    expect(created).toMatchObject({ date: futureDate, time: '11:00' });
    expect(result.current.bookings[0]).toMatchObject({ date: futureDate, time: '11:00' });
    expect(result.current.error).toBeNull();
  });

  it('кладёт ошибку создания в error, а не бросает из обработчика', async () => {
    const { result } = renderHook(() => useBookings(failingApi()));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      result.current.createBooking({ date: futureDate, time: '11:00' })
    ).resolves.toBeNull();

    expect(result.current.error).not.toBeNull();
  });

  it('запрашивает записи начиная с сегодняшнего дня', async () => {
    const list = vi.fn<(range: DateRange) => Promise<Booking[]>>(() => Promise.resolve([]));
    const api: BookingsApi = { list, create: () => Promise.reject(new Error('не вызывается')) };

    renderHook(() => useBookings(api));

    await waitFor(() => expect(list).toHaveBeenCalled());

    const range = list.mock.calls[0]?.[0];

    expect(range?.from).toBe(today());
    expect(range?.to > range.from).toBe(true);
  });
});