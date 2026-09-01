import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { IdentityError } from '../../domain/errors.js';
import { createAuthorizationClient, HttpAuthorizationClient } from './authorization-client.js';

function pemString(): string {
  const { privateKey } = generateKeyPairSync('ed25519');
  const exported = privateKey.export({ type: 'pkcs8', format: 'pem' });
  if (typeof exported !== 'string') {
    throw new Error('expected PEM string');
  }
  return exported;
}

function parseRequestBody(body: RequestInit['body']): unknown {
  if (typeof body === 'string') {
    return JSON.parse(body) as unknown;
  }
  if (body === undefined || body === null) {
    return undefined;
  }
  throw new Error('unsupported request body in test');
}

function headerRecord(init: RequestInit): Record<string, string> {
  if (init.headers === undefined) {
    return {};
  }
  if (init.headers instanceof Headers) {
    return Object.fromEntries(init.headers.entries());
  }
  if (Array.isArray(init.headers)) {
    return Object.fromEntries(init.headers);
  }
  return init.headers as Record<string, string>;
}

const baseConfig = () => ({
  IDENTITY_AUTHORIZATION_BASE_URL: 'http://127.0.0.1:4300',
  IDENTITY_AUTHORIZATION_ASSERTION_AUD: 'http://127.0.0.1:4300/authorization/v1',
  IDENTITY_TO_AUTHZ_CLIENT_ID: 'v2.identity-service',
  IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM: pemString(),
  IDENTITY_TO_AUTHZ_ACTIVE_KID: 'test-kid',
  IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
});

describe('HttpAuthorizationClient', () => {
  it('upserts identity link when Authorization returns success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new HttpAuthorizationClient(baseConfig(), fetchImpl);

    await expect(
      client.upsertIdentityLink({ discordUserId: '808066932753563668', v2UserId: 'user-1' }),
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4300/authorization/v1/identity-links');
    expect(init.method).toBe('POST');
    const headers = headerRecord(init);
    expect(headers['content-type']).toBe('application/json');
    expect(typeof headers['authorization-client-assertion']).toBe('string');
    expect(parseRequestBody(init.body)).toEqual({
      discordUserId: '808066932753563668',
      v2UserId: 'user-1',
    });
  });

  it('throws AUTHORIZATION_UNAVAILABLE when identity link upsert fails', async () => {
    const client = new HttpAuthorizationClient(baseConfig(), () =>
      Promise.resolve(new Response('nope', { status: 503 })),
    );

    await expect(
      client.upsertIdentityLink({ discordUserId: 'd1', v2UserId: 'u1' }),
    ).rejects.toMatchObject({
      code: 'AUTHORIZATION_UNAVAILABLE',
    });
  });

  it('returns allow/deny from authorizeWwwLogin', async () => {
    const client = new HttpAuthorizationClient(baseConfig(), (_url, init) => {
      const parsed = parseRequestBody(init?.body);
      const v2UserId =
        typeof parsed === 'object' &&
        parsed !== null &&
        'subject' in parsed &&
        typeof (parsed as { subject?: { v2UserId?: unknown } }).subject?.v2UserId === 'string'
          ? (parsed as { subject: { v2UserId: string } }).subject.v2UserId
          : '';
      return Promise.resolve(
        new Response(JSON.stringify({ decision: v2UserId === 'allowed' ? 'allow' : 'deny' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    await expect(
      client.authorizeWwwLogin({ discordUserId: 'd1', v2UserId: 'allowed' }),
    ).resolves.toBe('allow');
    await expect(
      client.authorizeWwwLogin({ discordUserId: 'd1', v2UserId: 'blocked' }),
    ).resolves.toBe('deny');
  });

  it('throws when authorize response is not valid JSON decision', async () => {
    const client = new HttpAuthorizationClient(baseConfig(), () =>
      Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    );

    await expect(
      client.authorizeWwwLogin({ discordUserId: 'd1', v2UserId: 'u1' }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_UNAVAILABLE' });
  });

  it('throws when Authorization is unreachable', async () => {
    const client = new HttpAuthorizationClient(baseConfig(), () =>
      Promise.reject(new Error('ECONNREFUSED')),
    );

    await expect(
      client.authorizeWwwLogin({ discordUserId: 'd1', v2UserId: 'u1' }),
    ).rejects.toBeInstanceOf(IdentityError);
  });

  it('requires full signing configuration before calling Authorization', async () => {
    const client = new HttpAuthorizationClient({
      ...baseConfig(),
      IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM: undefined,
    });

    await expect(
      client.upsertIdentityLink({ discordUserId: 'd1', v2UserId: 'u1' }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_UNAVAILABLE' });
  });
});

describe('createAuthorizationClient', () => {
  it('returns HttpAuthorizationClient wired to env config', () => {
    const client = createAuthorizationClient(baseConfig() as never);
    expect(client).toBeInstanceOf(HttpAuthorizationClient);
  });
});
