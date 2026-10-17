import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { meetingsApi, type MeetingsApi } from '../lib/meetings/api.ts';
import type { Meeting, MeetingDraft } from '../lib/meetings/types.ts';
import { today } from '../lib/date.ts';

/**
 * Насколько далеко вперёд смотрим. Прошедшие встречи показывать не нужно, а
 * по календарю не прыгают на год вперёд — 90 дней хватает.
 */
const HORIZON_DAYS = 90;

const LOAD_ERROR = 'Не удалось получить список записей.';
const CREATE_ERROR = 'Не удалось создать запись. Выберите другое время.';

interface MeetingsState {
  meetings: Meeting[];
  /** Пока первый ответ не пришёл. */
  loading: boolean;
  /** Текст ошибки для показа пользователю; `null`, если всё в порядке. */
  error: string | null;
}

export interface UseMeetingsResult extends MeetingsState {
  /** Перечитывает записи. */
  refresh: () => Promise<void>;
  /**
   * Создаёт запись и возвращает её. Ошибки не бросает: кладёт текст в `error`
   * и возвращает `null` — так вызывающий отличает успех от неудачи.
   */
  createMeeting: (draft: MeetingDraft) => Promise<Meeting | null>;
}

/**
 * Загрузка и создание записей. Реализация передаётся параметром, чтобы тесты
 * подставляли заглушку без модулей-моков.
 */
export function useMeetings(api: MeetingsApi = meetingsApi): UseMeetingsResult {
  const [state, setState] = useState<MeetingsState>({
    meetings: [],
    loading: true,
    error: null,
  });

  // Запрос сам по себе состояние не трогает — только возвращает данные.
  const request = useCallback(
    (): Promise<Meeting[]> =>
      api.list({
        from: today(),
        to: dayjs().add(HORIZON_DAYS, 'day').format('YYYY-MM-DD'),
      }),
    [api],
  );

  const refresh = useCallback(async () => {
    try {
      setState({ meetings: await request(), loading: false, error: null });
    } catch {
      setState((previous) => ({ ...previous, loading: false, error: LOAD_ERROR }));
    }
  }, [request]);

  const createMeeting = useCallback(async (draft: MeetingDraft) => {
    try {
      const meeting = await api.create(draft);
      await refresh();
      return meeting;
    } catch {
      // При конфликте (409) сервер не создал запись, а локальный список устарел:
      // чужой занятый слот остался бы визуально свободным. Сначала перечитываем,
      // потом ставим текст ошибки — refresh при успехе сбрасывает error в null
      // (useMeetings.ts:57), и наоборот порядок стёр бы CREATE_ERROR.
      await refresh();
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
        const meetings = await request();
        if (!cancelled) setState({ meetings, loading: false, error: null });
      } catch {
        if (!cancelled) setState({ meetings: [], loading: false, error: LOAD_ERROR });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [request]);

  return { ...state, refresh, createMeeting };
}