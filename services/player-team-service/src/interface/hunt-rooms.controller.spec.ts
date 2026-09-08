import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HuntRoomsUseCases } from '../application/use-cases/hunt-rooms.use-cases.js';
import { parsePlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { HuntRoomsController } from './hunt-rooms.controller.js';

const ISSUER = 'https://identity.test';
const JWKS_URL = `${ISSUER}/identity/.well-known/jwks.json`;
const AUDIENCE = 'v2.api-gateway';
const DISCORD_ID = '123456789012345678';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function productionAuthFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const kid = `hunt-test-${Date.now()}-${Math.random()}`;
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HuntRoomsController production authentication', () => {
  it('creates Party with verified Identity JWT while demo writes are disabled', async () => {
    const fixture = productionAuthFixture();
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

    const createPartyRoom = vi.fn().mockResolvedValue({ id: 'party-test' });
    const assertDemoAccess = vi.fn(() => {
      throw new Error('demo auth must not be used in production JWT mode');
    });
    const useCases = {
      assertDemoAccess,
      createPartyRoom,
    } as unknown as HuntRoomsUseCases;
    const controller = new HuntRoomsController(useCases, fixture.env);

    await expect(
      controller.createPartyRoom(
        {
          authorization: `Bearer ${fixture.token}`,
          'x-authenticated-discord-id': DISCORD_ID,
          'x-demo-viewer-id': 'forged-demo-id',
        },
        {
          displayName: 'KuzynPasek',
          mapKey: 'Czerwony Las',
          activeChannel: 1,
          visibility: 'open',
        },
      ),
    ).resolves.toEqual({ id: 'party-test' });

    expect(assertDemoAccess).not.toHaveBeenCalled();
    expect(createPartyRoom).toHaveBeenCalledWith({
      leaderId: DISCORD_ID,
      displayName: 'KuzynPasek',
      mapKey: 'Czerwony Las',
      activeChannel: 1,
      visibility: 'open',
    });
  });

  it('rejects Hunt Rooms without the internal bearer token in production mode', async () => {
    const fixture = productionAuthFixture();
    const useCases = {
      assertDemoAccess: vi.fn(),
      createPartyRoom: vi.fn(),
    } as unknown as HuntRoomsUseCases;
    const controller = new HuntRoomsController(useCases, fixture.env);

    await expect(
      controller.createPartyRoom(
        { 'x-authenticated-discord-id': DISCORD_ID },
        {
          displayName: 'KuzynPasek',
          mapKey: 'Czerwony Las',
          activeChannel: 1,
          visibility: 'open',
        },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
