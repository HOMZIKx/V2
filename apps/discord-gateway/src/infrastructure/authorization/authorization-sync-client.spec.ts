import { exportPKCS8, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DiscordGatewayConfigSchema, normalizeDiscordConfig } from '../discord/discord-config.js';
import {
  createAuthorizationSyncClient,
  HttpAuthorizationSyncClient,
} from './authorization-sync-client.js';
import { buildDiscordToAuthzAssertion } from './build-client-assertion.js';

function makeSyncConfig(privatePem: string, overrides: Record<string, string> = {}) {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'false',
      DISCORD_AUTHORIZATION_SYNC_ENABLED: 'true',
      AUTHORIZATION_BASE_URL: 'http://127.0.0.1:4300',
      AUTHORIZATION_ASSERTION_AUD: 'http://127.0.0.1:4300/authorization/v1',
      DISCORD_TO_AUTHZ_CLIENT_ID: 'v2.discord-gateway',
      DISCORD_TO_AUTHZ_PRIVATE_KEY_PEM: privatePem,
      DISCORD_TO_AUTHZ_ACTIVE_KID: 'discord-gateway-test',
      ...overrides,
    }),
  );
}

describe('buildDiscordToAuthzAssertion', () => {
  let privatePem: string;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privatePem = await exportPKCS8(privateKey);
  });

  it('signs EdDSA assertion with iss=sub=clientId and TTL <= 60', async () => {
    const assertion = await buildDiscordToAuthzAssertion({
      clientId: 'v2.discord-gateway',
      privateKeyPem: privatePem,
      activeKid: 'discord-gateway-test',
      audience: 'http://127.0.0.1:4300/authorization/v1',
      ttlSeconds: 60,
    });
    expect(assertion.split('.')).toHaveLength(3);
  });
});

describe('HttpAuthorizationSyncClient', () => {
  let privatePem: string;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privatePem = await exportPKCS8(privateKey);
  });

  it('returns null when sync is disabled', () => {
    const config = normalizeDiscordConfig(
      DiscordGatewayConfigSchema.parse({
        DISCORD_ENABLED: 'false',
        DISCORD_AUTHORIZATION_SYNC_ENABLED: 'false',
      }),
    );
    const client = createAuthorizationSyncClient(config, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
    expect(client).toBeNull();
  });

  it('POSTs register with Authorization-Client-Assertion', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = new HttpAuthorizationSyncClient({
      config: makeSyncConfig(privatePem),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.registerGuild('1534228693017432124');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4300/authorization/v1/discord/guilds/register');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization-Client-Assertion']?.split('.')).toHaveLength(3);
    expect(JSON.parse(String(init.body))).toEqual({ discordGuildId: '1534228693017432124' });
  });

  it('POSTs discord events with exact Authz body fields', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = new HttpAuthorizationSyncClient({
      config: makeSyncConfig(privatePem),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.applyDiscordEvent({
      eventKey: 'dg:guild_member_add:g1:u1:1',
      eventType: 'guild_member_add',
      discordGuildId: 'g1',
      payload: {
        kind: 'member_upsert',
        member: {
          discordUserId: 'u1',
          roleIds: ['r1'],
          status: 'active',
        },
      },
      payloadHash: 'abc',
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4300/authorization/v1/discord/events');
    expect(JSON.parse(String(init.body))).toEqual({
      eventKey: 'dg:guild_member_add:g1:u1:1',
      eventType: 'guild_member_add',
      discordGuildId: 'g1',
      payload: {
        kind: 'member_upsert',
        member: {
          discordUserId: 'u1',
          roleIds: ['r1'],
          status: 'active',
        },
      },
      payloadHash: 'abc',
    });
  });

  it('POSTs reconcile snapshot to guild path', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = new HttpAuthorizationSyncClient({
      config: makeSyncConfig(privatePem),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.reconcileGuild('g1', {
      eventKey: 'dg:reconcile:g1:x',
      members: [{ discordUserId: 'u1', roleIds: [], status: 'active' }],
      roles: [{ discordRoleId: 'r1', nameCache: 'Member' }],
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4300/authorization/v1/discord/guilds/g1/reconcile');
    expect(JSON.parse(String(init.body))).toEqual({
      eventKey: 'dg:reconcile:g1:x',
      members: [{ discordUserId: 'u1', roleIds: [], status: 'active' }],
      roles: [{ discordRoleId: 'r1', nameCache: 'Member' }],
    });
  });

  it('uses per-path audience when AUTHORIZATION_ASSERTION_AUD is unset', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const base = makeSyncConfig(privatePem);
    const config = {
      ...base,
      AUTHORIZATION_ASSERTION_AUD: undefined,
    };
    const client = new HttpAuthorizationSyncClient({
      config,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.registerGuild('g1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
