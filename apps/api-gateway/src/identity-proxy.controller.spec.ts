import { describe, expect, it, vi } from 'vitest';

import { IdentityProxyController } from './identity-proxy.controller.js';

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

describe('IdentityProxyController', () => {
  it('forwards identity-client-assertion for internal S2S profile routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { reply } = mockReply();
    const controller = new IdentityProxyController('http://127.0.0.1:4200');
    await controller.proxy(
      {
        url: '/identity/v1/internal/profile',
        method: 'GET',
        body: undefined,
      } as never,
      reply as never,
      {
        'identity-client-assertion': 'signed-jwt',
        accept: 'application/json',
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['identity-client-assertion']).toBe('signed-jwt');

    vi.unstubAllGlobals();
  });
});
