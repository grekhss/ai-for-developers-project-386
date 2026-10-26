import { createMeeting, listMeetings } from '../api-gen';
import { createClient } from '../api-gen/client';
import type { MeetingsApi } from './api.ts';
import type { MeetingDraft } from './types.ts';

/**
 * HTTP-реализация контракта поверх сгенерированного SDK (K3, D5/ADR-0005).
 * Роль передаётся через cookie `role` (ставит main.tsx по URL); сессий нет.
 */
export function createHttpMeetingsApi(baseUrl = ''): MeetingsApi {
  const client = createClient({ baseUrl, credentials: 'include' });

  return {
    async list(range?: any) {
      const result = await listMeetings({ client, query: range ?? { from: '2000-01-01', to: '2100-12-31' } });
      if (result.error !== undefined) throw failure(result, 'GET /api/meetings');
      const data = result.data as any;
      return Array.isArray(data) ? data : (data.meetings ?? data);
    },
    async create(draft: MeetingDraft) {
      const result = await createMeeting({ client, body: draft });
      if (result.error !== undefined) throw failure(result, 'POST /api/meetings');
      const data = result.data as any;
      return data.meeting ?? data;
    },
  };
}

/**
 * Ошибка SDK → исключение. Успешный ответ сюда не попадает: вызывающий сужает
 * union по `error !== undefined`.
 */
function failure(result: { error: unknown; response?: Response }, request: string): Error {
  // fetch сам упал (сеть, abort): клиент положил исходное исключение в `error`,
  // и его текст должен дойти до вызывающего без подмены нашим сообщением.
  if (result.error instanceof Error) return result.error;
  // Ответ не-2xx: SDK разобрал JSON-тело ошибки, а текст для пользователя — наш.
  // useMeetings.createMeeting переводит throw в error/null; текст CREATE_ERROR
  // уже подходит и для 409 (дубль слота).
  return new Error(`${request} вернул ${result.response?.status}`);
}
