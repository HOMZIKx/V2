import { describe, expect, it, vi } from 'vitest';

import { ActivityProxyController } from './activity-proxy.controller.js';

describe('ActivityProxyController', () => {
  it('rejects when activity base URL is missing', async () => {
    const controller = new ActivityProxyController(null);
    await expect(
      controller.proxy(
        { url: '/activity/v1/admin/guilds/g1/config', method: 'GET', body: undefined } as never,
        {} as never,
        {},
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('forwards GET to activity-service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sent: { status?: number; body?: Buffer } = {};
    const reply = {
      status(code: number) {
        sent.status = code;
        return this;
      },
      headers() {
        return this;
      },
      send(body: Buffer) {
        sent.body = body;
        return Promise.resolve();
      },
    };

    const controller = new ActivityProxyController('http://127.0.0.1:4400');
    await controller.proxy(
      { url: '/activity/v1/admin/guilds/g1/readiness', method: 'GET', body: undefined } as never,
      reply as never,
      { 'x-actor-discord-user-id': '123' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain('/activity/v1/admin/guilds/g1/readiness');
    expect((init.headers as Record<string, string>)['x-actor-discord-user-id']).toBe('123');
    expect(sent.status).toBe(200);
    expect(sent.body?.toString('utf8')).toContain('"ok":true');

    vi.unstubAllGlobals();
  });
});
