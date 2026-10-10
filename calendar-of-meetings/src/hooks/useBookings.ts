import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { bookingsApi, type BookingsApi } from '../lib/bookings/api.ts';
import type { Booking, BookingDraft } from '../lib/bookings/types.ts';
import { today } from '../lib/date.ts';

/**
 * Насколько далеко вперёд смотрим. Прошедшие встречи показывать не нужно, а
 * по календарю не прыгают на год вперёд — 90 дней хватает.
 */
const HORIZON_DAYS = 90;

const LOAD_ERROR = 'Не удалось получить список записей.';
const CREATE_ERROR = 'Не удалось создать запись. Выберите другое время.';

interface BookingsState {
  bookings: Booking[];
  /** Пока первый ответ не пришёл. */
  loading: boolean;
  /** Текст ошибки для показа пользователю; `null`, если всё в порядке. */
  error: string | null;
}

export interface UseBookingsResult extends BookingsState {
  /** Перечитывает записи. */
  refresh: () => Promise<void>;
  /**
   * Создаёт запись и возвращает её. Ошибки не бросает: кладёт текст в `error`
   * и возвращает `null` — так вызывающий отличает успех от неудачи.
   */
  createBooking: (draft: BookingDraft) => Promise<Booking | null>;
}

/**
 * Загрузка и создание записей. Реализация передаётся параметром, чтобы тесты
 * подставляли заглушку без модулей-моков.
 */
export function useBookings(api: BookingsApi = bookingsApi): UseBookingsResult {
  const [state, setState] = useState<BookingsState>({
    bookings: [],
    loading: true,
    error: null,
  });

  // Запрос сам по себе состояние не трогает — только возвращает данные.
  const request = useCallback(
    (): Promise<Booking[]> =>
      api.list({
        from: today(),
        to: dayjs().add(HORIZON_DAYS, 'day').format('YYYY-MM-DD'),
      }),
    [api],
  );

  const refresh = useCallback(async () => {
    try {
      setState({ bookings: await request(), loading: false, error: null });
    } catch {
      setState((previous) => ({ ...previous, loading: false, error: LOAD_ERROR }));
    }
  }, [request]);

  const createBooking = useCallback(async (draft: BookingDraft) => {
    try {
      const booking = await api.create(draft);
      await refresh();
      return booking;
    } catch {
      setState((previous) => ({ ...previous, error: CREATE_ERROR }));
      return null;
    }
  }, [api, refresh]);

  // Первичная загрузка объявлена прямо здесь, а не вызовом refresh: правило
  // react/set-state-in-effect не пропускает вызов функции, трогающей состояние,
  // из тела эффекта — даже если setState происходит после await. Флаг cancelled
  // защищает от записи в состояние размонтированного компонента, в StrictMode
  // эффект вызывается дважды.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const bookings = await request();
        if (!cancelled) setState({ bookings, loading: false, error: null });
      } catch {
        if (!cancelled) setState({ bookings: [], loading: false, error: LOAD_ERROR });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [request]);

  return { ...state, refresh, createBooking };
}