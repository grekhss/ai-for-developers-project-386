import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpMeetingsApi } from './http.ts';

/** Ответ, похожий на fetch-Response настолько, насколько клиент его использует. */
function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function stubFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>,
) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createHttpMeetingsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('list ходит GET /api/meetings с query из DateRange и парсит ответ', async () => {
    let capturedUrl = '';
    stubFetch(async (input) => {
      capturedUrl = String(input);
      return fakeResponse(200, [{ id: '1', date: '2026-01-01', time: '09:00' }]);
    });

    const meetings = await createHttpMeetingsApi().list({
      from: '2026-01-01',
      to: '2026-12-31',
    });

    expect(capturedUrl).toBe('/api/meetings?from=2026-01-01&to=2026-12-31');
    expect(meetings).toEqual([{ id: '1', date: '2026-01-01', time: '09:00' }]);
  });

  it('baseUrl подставляется перед путём', async () => {
    let capturedUrl = '';
    stubFetch(async (input) => {
      capturedUrl = String(input);
      return fakeResponse(200, []);
    });

    await createHttpMeetingsApi('http://api.test').list({
      from: '2026-01-01',
      to: '2026-01-02',
    });

    expect(capturedUrl).toBe('http://api.test/api/meetings?from=2026-01-01&to=2026-01-02');
  });

  it('create уходит POST с Content-Type: application/json и JSON-телом', async () => {
    let capturedInit: RequestInit | undefined;
    stubFetch(async (_input, init) => {
      capturedInit = init;
      return fakeResponse(201, { id: '2', date: '2026-01-02', time: '10:00' });
    });

    const meeting = await createHttpMeetingsApi().create({ date: '2026-01-02', time: '10:00' });

    // Регрессия: без заголовка каждый POST вернул бы 400 от express.json().
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(capturedInit?.body).toBe(JSON.stringify({ date: '2026-01-02', time: '10:00' }));
    expect(meeting).toEqual({ id: '2', date: '2026-01-02', time: '10:00' });
  });

  it('create бросает при 400 и 409 (дубль слота)', async () => {
    const api = createHttpMeetingsApi();

    for (const status of [400, 409]) {
      stubFetch(async () => fakeResponse(status, { error: 'nope' }));

      await expect(api.create({ date: '2026-01-02', time: '10:00' })).rejects.toThrow();
      vi.unstubAllGlobals();
    }
  });

  it('list бросает когда fetch сам упал (ошибка сети)', async () => {
    stubFetch(async () => {
      throw new TypeError('network error');
    });

    const api = createHttpMeetingsApi();
    await expect(api.list({ from: '2026-01-01', to: '2026-01-02' })).rejects.toThrow('network error');
  });
});