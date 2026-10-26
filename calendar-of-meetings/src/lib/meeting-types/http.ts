import { createMeetingType, deactivateMeetingType, listMeetingTypes } from '../api-gen';
import { createClient } from '../api-gen/client';
import type { MeetingTypesApi } from './api.ts';
import type { MeetingTypeDraft } from './types.ts';

export function createHttpMeetingTypesApi(baseUrl = ''): MeetingTypesApi {
  const client = createClient({ baseUrl, credentials: 'include' });

  return {
    async list() {
      const result = await listMeetingTypes({ client });
      if (result.error !== undefined) throw failure(result, 'GET /api/meeting-types');
      const data = result.data as any;
      return data.meetingTypes ?? data;
    },
    async create(draft: MeetingTypeDraft) {
      const result = await createMeetingType({ client, body: draft });
      if (result.error !== undefined) throw failure(result, 'POST /api/meeting-types');
      const data = result.data as any;
      return data.meetingType ?? data;
    },
    async deactivate(id: string) {
      const result = await deactivateMeetingType({ client, path: { id } });
      if (result.error !== undefined) throw failure(result, `POST /api/meeting-types/${id}/deactivate`);
      const data = result.data as any;
      return data.meetingType ?? data;
    },
  };
}

/**
 * Ошибка SDK → исключение. Успешный ответ сюда не попадает: вызывающий сужает
 * union по `error !== undefined`. Дубль meetings/http.ts — намеренно: модули
 * `lib/meetings/` и `lib/meeting-types/` не должны зависеть друг от друга,
 * чтобы зеркальная структура (F3) оставалась самодостаточной.
 */
function failure(result: { error: unknown; response?: Response }, request: string): Error {
  // fetch сам упал (сеть, abort): клиент положил исходное исключение в `error`,
  // и его текст должен дойти до вызывающего без подмены нашим сообщением.
  if (result.error instanceof Error) return result.error;
  // Ответ не-2xx: SDK разобрал JSON-тело ошибки, а текст для пользователя —
  // уже русский, в `error` самого хука.
  return new Error(`${request} вернул ${result.response?.status}`);
}
