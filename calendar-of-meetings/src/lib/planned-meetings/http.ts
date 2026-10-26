import { listPlannedMeetings } from '../api-gen';
import { createClient } from '../api-gen/client';
import type { PlannedMeetingsApi } from './api.ts';

export function createHttpPlannedMeetingsApi(baseUrl = ''): PlannedMeetingsApi {
  const client = createClient({ baseUrl, credentials: 'include' });

  return {
    async list() {
      const result = await listPlannedMeetings({ client });
      if (result.error !== undefined) throw failure(result, 'GET /api/admin/meetings');
      const data = result.data as any;
      return data.meetings ?? data;
    },
  };
}

/**
 * Ошибка SDK → исключение. Успешный ответ сюда не попадает: вызывающий сужает
 * union по `error !== undefined`. Дубль meeting-types/http.ts — намеренно:
 * модули `lib/*` не должны зависеть друг от друга, чтобы зеркальная структура
 * оставалась самодостаточной.
 */
function failure(result: { error: unknown; response?: Response }, request: string): Error {
  // fetch сам упал (сеть, abort): клиент положил исходное исключение в `error`,
  // и его текст должен дойти до вызывающего без подмены нашим сообщением.
  if (result.error instanceof Error) return result.error;
  // Ответ не-2xx: SDK разобрал JSON-тело ошибки, а текст для пользователя —
  // уже русский, в `error` самого хука.
  return new Error(`${request} вернул ${result.response?.status}`);
}
