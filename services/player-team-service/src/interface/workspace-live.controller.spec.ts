import { generateKeyPairSync, sign } from 'node:crypto';

import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { parsePlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { WorkspaceLiveController } from './workspace-live.controller.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';

const ISSUER = 'https://workspace-identity.test';
const JWKS_URL = `${ISSUER}/identity/.well-known/jwks.json`;
const AUDIENCE = 'v2.api-gateway';
const DISCORD_ID = '123456789012345678';
const WORKSPACE_ID = 'workspace-a';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function productionAuthFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const kid = 'workspace-live-test-key';
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'EdDSA', typ: 'JWT', kid });
  const payload = encode({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'viewer-test',
    iat: now,
    exp: now + 120,
  });
  const unsigned = `${header}.${payload}`;
  const signature = sign(null, Buffer.from(unsigned), privateKey).toString('base64url');
  const token = `${unsigned}.${signature}`;
  const env = parsePlayerTeamEnv({
    NODE_ENV: 'test',
    PLAYER_TEAM_DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
    PLAYER_TEAM_ALLOW_DEMO_WRITE: 'false',
    PLAYER_TEAM_INTERNAL_JWT_ENABLED: 'true',
    PLAYER_TEAM_INTERNAL_JWT_ISSUER: ISSUER,
    PLAYER_TEAM_INTERNAL_JWT_AUDIENCE: AUDIENCE,
    PLAYER_TEAM_INTERNAL_JWT_JWKS_URL: JWKS_URL,
  });
  return { env, kid, publicJwk, token };
}

const fixture = productionAuthFixture();

const SNAPSHOT = {
  workspaceId: WORKSPACE_ID,
  state: { id: WORKSPACE_ID },
  revision: 3,
  updatedByUserId: DISCORD_ID,
  updatedAtIso: '2026-09-08T19:00:00.000Z',
};

function stubJwks(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(JWKS_URL);
      return new Response(
        JSON.stringify({ keys: [{ ...fixture.publicJwk, kid: fixture.kid, alg: 'EdDSA' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
}

function createController() {
  const assertDemoAccess = vi.fn(() => {
    throw new Error('demo auth must not be used in production JWT mode');
  });
  const getWorkspaceSnapshot = vi.fn().mockResolvedValue(SNAPSHOT);
  const upsertWorkspaceSnapshot = vi.fn().mockResolvedValue(SNAPSHOT);
  const useCases = {
    assertDemoAccess,
    getWorkspaceSnapshot,
    upsertWorkspaceSnapshot,
  } as unknown as PlayerTeamStateUseCases;

  return {
    instance: new WorkspaceLiveController(useCases, fixture.env, new WorkspaceLiveBus()),
    assertDemoAccess,
    getWorkspaceSnapshot,
    upsertWorkspaceSnapshot,
  };
}

function authHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${fixture.token}`,
    'x-authenticated-discord-id': DISCORD_ID,
    'x-demo-viewer-id': 'forged-demo-id',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WorkspaceLiveController production authentication', () => {
  it('reads shared workspace state with a verified Identity JWT while demo writes are disabled', async () => {
    stubJwks();
    const { instance, assertDemoAccess, getWorkspaceSnapshot } = createController();

    await expect(instance.getState(authHeaders(), WORKSPACE_ID)).resolves.toEqual(SNAPSHOT);

    expect(assertDemoAccess).not.toHaveBeenCalled();
    expect(getWorkspaceSnapshot).toHaveBeenCalledWith(DISCORD_ID, WORKSPACE_ID);
  });

  it('writes shared workspace state with the verified Discord identity', async () => {
    stubJwks();
    const { instance, assertDemoAccess, upsertWorkspaceSnapshot } = createController();

    await expect(
      instance.putState(authHeaders(), WORKSPACE_ID, {
        state: { id: WORKSPACE_ID },
        expectedRevision: 2,
      }),
    ).resolves.toEqual(SNAPSHOT);

    expect(assertDemoAccess).not.toHaveBeenCalled();
    expect(upsertWorkspaceSnapshot).toHaveBeenCalledWith({
      ownerUserId: DISCORD_ID,
      workspaceId: WORKSPACE_ID,
      state: { id: WORKSPACE_ID },
      expectedRevision: 2,
    });
  });

  it('authenticates the SSE stream before the first workspace read', async () => {
    stubJwks();
    const { instance, assertDemoAccess, getWorkspaceSnapshot } = createController();

    await expect(firstValueFrom(instance.events(authHeaders(), WORKSPACE_ID))).resolves.toEqual({
      type: 'workspace',
      data: SNAPSHOT,
    });

    expect(assertDemoAccess).not.toHaveBeenCalled();
    expect(getWorkspaceSnapshot).toHaveBeenCalledWith(DISCORD_ID, WORKSPACE_ID);
  });

  it('rejects GET, PUT and SSE without an internal bearer token in production mode', async () => {
    const headers = { 'x-authenticated-discord-id': DISCORD_ID };
    const { instance, getWorkspaceSnapshot, upsertWorkspaceSnapshot } = createController();

    await expect(instance.getState(headers, WORKSPACE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(
      instance.putState(headers, WORKSPACE_ID, {
        state: { id: WORKSPACE_ID },
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(firstValueFrom(instance.events(headers, WORKSPACE_ID))).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    expect(getWorkspaceSnapshot).not.toHaveBeenCalled();
    expect(upsertWorkspaceSnapshot).not.toHaveBeenCalled();
  });
});
