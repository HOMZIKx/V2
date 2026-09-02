import { describe, expect, it, vi } from 'vitest';

import { ActivityProxyController } from './activity-proxy.controller.js';

function mockReply() {
  const sent: { status?: number; body?: Buffer; headers?: Record<string, string> } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    headers(value: Record<string, string>) {
      sent.headers = value;
      return this;
    },
    send(body: Buffer) {
      sent.body = body;
      return Promise.resolve();
    },
  };
  return { reply, sent };
}

describe('ActivityProxyController', () => {
  it('rejects when activity base URL is missing', async () => {
    const controller = new ActivityProxyController(null, false);
    await expect(
      controller.proxy(
        { url: '/activity/v1/admin/guilds/g1/config', method: 'GET', body: undefined } as never,
        {} as never,
        {},
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('forwards allowlisted headers and GET to activity-service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { reply, sent } = mockReply();
    const controller = new ActivityProxyController('http://127.0.0.1:4400', false);
    await controller.proxy(
      { url: '/activity/v1/admin/guilds/g1/readiness', method: 'GET', body: undefined } as never,
      reply as never,
      {
        cookie: 'session=abc',
        accept: 'application/json',
        'x-request-id': 'req-1',
        'x-correlation-id': 'corr-1',
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain('/activity/v1/admin/guilds/g1/readiness');
    const headers = init.headers as Record<string, string>;
    expect(headers.cookie).toBeUndefined();
    expect(headers.accept).toBe('application/json');
    expect(headers['x-request-id']).toBe('req-1');
    expect(headers['x-correlation-id']).toBe('corr-1');
    expect(sent.status).toBe(200);
    expect(sent.body?.toString('utf8')).toContain('"ok":true');

    vi.unstubAllGlobals();
  });

  it('strips activity-client-assertion and authorization by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reply } = mockReply();
    const controller = new ActivityProxyController('http://127.0.0.1:4400', false);
    await controller.proxy(
      { url: '/activity/v1/admin/guilds/g1/config', method: 'GET', body: undefined } as never,
      reply as never,
      {
        authorization: 'Bearer secret',
        'activity-client-assertion': 'jwt-should-not-forward',
        'proxy-connection': 'keep-alive',
        cookie: 'ok=1',
      },
    );

    const headers = (fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers.authorization).toBeUndefined();
    expect(headers['activity-client-assertion']).toBeUndefined();
    expect(headers['proxy-connection']).toBeUndefined();
    expect(headers.cookie).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('strips actor headers when API_GATEWAY_FORWARD_ACTOR_HEADERS is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reply } = mockReply();
    const controller = new ActivityProxyController('http://127.0.0.1:4400', false);
    await controller.proxy(
      { url: '/activity/v1/admin/guilds/g1/config', method: 'GET', body: undefined } as never,
      reply as never,
      {
        'x-actor-discord-user-id': '123',
        'x-actor-v2-user-id': 'uuid',
      },
    );

    const headers = (fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['x-actor-discord-user-id']).toBeUndefined();
    expect(headers['x-actor-v2-user-id']).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('forwards actor headers only when explicitly enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reply } = mockReply();
    const controller = new ActivityProxyController('http://127.0.0.1:4400', true);
    await controller.proxy(
      { url: '/activity/v1/admin/guilds/g1/config', method: 'GET', body: undefined } as never,
      reply as never,
      {
        'x-actor-discord-user-id': '123',
        authorization: 'Bearer no',
      },
    );

    const headers = (fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['x-actor-discord-user-id']).toBe('123');
    expect(headers.authorization).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('injects actor headers from Identity session cookie', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'v2-1', name: 'User' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accounts: [{ provider: 'discord', accountId: 'discord-9' }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{"items":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reply } = mockReply();
    const controller = new ActivityProxyController(
      'http://127.0.0.1:4400',
      false,
      'http://127.0.0.1:4200',
    );
    await controller.proxy(
      { url: '/activity/v1/activities?guildId=g1', method: 'GET', body: undefined } as never,
      reply as never,
      { cookie: 'v2.identity.session=abc', accept: 'application/json' },
    );

    const activityCall = fetchMock.mock.calls[2] as [URL, RequestInit];
    const headers = activityCall[1].headers as Record<string, string>;
    expect(headers['x-actor-discord-user-id']).toBe('discord-9');
    expect(headers['x-actor-v2-user-id']).toBe('v2-1');
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('attaches Activity-Client-Assertion when assertion config is set', async () => {
    const { exportPKCS8, generateKeyPair } = await import('jose');
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privatePem = await exportPKCS8(privateKey);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reply } = mockReply();
    const controller = new ActivityProxyController('http://127.0.0.1:4400', true, null, {
      clientId: 'v2.api-gateway',
      privateKeyPem: privatePem,
      activeKid: 'api-active',
      audience: 'http://127.0.0.1:4400/activity/v1',
    });
    await controller.proxy(
      { url: '/activity/v1/admin/guilds', method: 'GET', body: undefined } as never,
      reply as never,
      { 'x-actor-discord-user-id': '808066932753563668' },
    );

    const headers = (fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['activity-client-assertion']?.split('.')).toHaveLength(3);
    expect(headers['x-actor-discord-user-id']).toBe('808066932753563668');

    vi.unstubAllGlobals();
  });

  it('does not bake unsigned browser actor into the assertion when forwarding is disabled', async () => {
    const { exportPKCS8, generateKeyPair, decodeJwt } = await import('jose');
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privatePem = await exportPKCS8(privateKey);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reply } = mockReply();
    const controller = new ActivityProxyController('http://127.0.0.1:4400', false, null, {
      clientId: 'v2.api-gateway',
      privateKeyPem: privatePem,
      activeKid: 'api-active',
      audience: 'http://127.0.0.1:4400/activity/v1',
    });
    await controller.proxy(
      { url: '/activity/v1/admin/guilds', method: 'GET', body: undefined } as never,
      reply as never,
      { 'x-actor-discord-user-id': '808066932753563668' },
    );

    const headers = (fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['x-actor-discord-user-id']).toBeUndefined();
    const payload = decodeJwt(headers['activity-client-assertion'] ?? '');
    expect(payload.actor_discord_user_id).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('drops duplicate actor headers instead of joining them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reply } = mockReply();
    const controller = new ActivityProxyController('http://127.0.0.1:4400', true);
    await controller.proxy(
      { url: '/activity/v1/admin/guilds/g1/config', method: 'GET', body: undefined } as never,
      reply as never,
      {
        'x-actor-discord-user-id': ['victim', 'attacker'],
      },
    );

    const headers = (fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['x-actor-discord-user-id']).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
