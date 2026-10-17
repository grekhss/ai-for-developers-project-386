// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { createRepository } from './repository.js';

// Интеграция собирается как в проде: createApp(createRepository(':memory:')).
// Через index.ts не ходим — он биндит порт и открывает файловую БД.
async function createTestApp(): Promise<{ baseUrl: string }> {
  const app = createApp(createRepository(createDatabase(':memory:')));
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}` };
}

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

function postMeeting(baseUrl: string, body: unknown, headers?: Record<string, string>) {
  return fetch(`${baseUrl}/api/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('routes /api/meetings', () => {
  it('GET возвращает пустой список', async () => {
    const { baseUrl } = await createTestApp();
    const response = await fetch(`${baseUrl}/api/meetings?from=2026-01-01&to=2026-12-31`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('POST принимает JSON и отвечает 201 с id строкой', async () => {
    const { baseUrl } = await createTestApp();
    const response = await postMeeting(baseUrl, { date: '2026-03-02', time: '09:00' });
    expect(response.status).toBe(201);
    const meeting = (await response.json()) as Record<string, unknown>;
    expect(meeting).toEqual({ id: '1', date: '2026-03-02', time: '09:00' });
    expect(typeof meeting.id).toBe('string');
  });

  it('POST дубля слота отвечает 409', async () => {
    const { baseUrl } = await createTestApp();
    const body = { date: '2026-03-02', time: '09:00' };

    expect((await postMeeting(baseUrl, body)).status).toBe(201);
    // Второй POST того же слота отклоняется сервером, а не UI.
    expect((await postMeeting(baseUrl, body)).status).toBe(409);
  });

  it('POST без Content-Type: application/json отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    // express.json() не парсит text/plain: req.body в Express 5 остаётся
    // undefined. Без заголовка каждый POST вернул бы 400.
    const response = await postMeeting(baseUrl, { date: '2026-03-02', time: '09:00' }, { 'Content-Type': 'text/plain' });
    expect(response.status).toBe(400);
  });

  it('POST невалидного тела отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const invalidBodies = [
      {},
      { date: '2026-03-02' },
      { date: '2026-03-02', time: '9:00' },
      { date: '02.03.2026', time: '09:00' },
      { date: '2026-03-02', time: '24:00' },
      { date: null, time: '09:00' },
      'not an object',
    ];

    for (const body of invalidBodies) {
      expect((await postMeeting(baseUrl, body)).status).toBe(400);
    }
  });

  it('GET без from/to отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const response = await fetch(`${baseUrl}/api/meetings`);
    expect(response.status).toBe(400);
  });

  it('GET с невалидным from/to отвечает 400', async () => {
    const { baseUrl } = await createTestApp();
    const response = await fetch(`${baseUrl}/api/meetings?from=01-01-2026&to=2026-12-31`);
    expect(response.status).toBe(400);
  });

  it('GET фильтрует по диапазону и сортирует по (date, time)', async () => {
    const { baseUrl } = await createTestApp();
    await postMeeting(baseUrl, { date: '2026-01-02', time: '10:00' });
    await postMeeting(baseUrl, { date: '2026-01-01', time: '11:00' });
    await postMeeting(baseUrl, { date: '2027-01-01', time: '09:00' });

    const response = await fetch(`${baseUrl}/api/meetings?from=2026-01-01&to=2026-12-31`);
    expect(await response.json()).toEqual([
      { id: '2', date: '2026-01-01', time: '11:00' },
      { id: '1', date: '2026-01-02', time: '10:00' },
    ]);
  });
});