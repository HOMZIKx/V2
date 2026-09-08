import { generateKeyPairSync, sign } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type TeamInvitationsUseCases } from '../application/use-cases/team-invitations.use-cases.js';
import { parsePlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { TeamInvitationsController } from './team-invitations.controller.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';

const ISSUER = 'https://invitation-identity.test';
const JWKS_URL = `${ISSUER}/identity/.well-known/jwks.json`;
const AUDIENCE = 'v2.api-gateway';
const DISCORD_ID = ['123456789', '012345678'].join('');
const RECIPIENT_ID = ['223456789', '012345678'].join('');
const FORGED_DEMO_ID = ['999999999', '999999999'].join('');
const APP_ID = 'viewer-app-id';
const WORKSPACE_ID = 'workspace-a';
const INVITATION_ID = 'invite-a';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function productionAuthFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const kid = 'team-invitation-test-key';
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'EdDSA', typ: 'JWT', kid });
  const payload = encode({ iss: ISSUER, aud: AUDIENCE, sub: 'viewer-test', iat: now, exp: now + 120 });
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
const workspaceResult = {
  invitation: { id: INVITATION_ID },
  workspaceId: WORKSPACE_ID,
  workspace: { id: WORKSPACE_ID },
  revision: 4,
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
  const assertAccess = vi.fn(() => {
    throw new Error('demo invitation auth must not be used in production JWT mode');
  });
  const listPendingInvitations = vi.fn().mockResolvedValue([]);
  const createInvitation = vi.fn().mockResolvedValue(workspaceResult);
  const cancelInvitation = vi.fn().mockResolvedValue(workspaceResult);
  const getInvitation = vi.fn().mockResolvedValue({ id: INVITATION_ID });
  const respond = vi.fn().mockResolvedValue(workspaceResult);
  const useCases = {
    assertAccess,
    listPendingInvitations,
    createInvitation,
    cancelInvitation,
    getInvitation,
    respond,
  } as unknown as TeamInvitationsUseCases;

  return {
    instance: new TeamInvitationsController(useCases, fixture.env, new WorkspaceLiveBus()),
    assertAccess,
    listPendingInvitations,
    createInvitation,
    getInvitation,
    respond,
  };
}

function authHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${fixture.token}`,
    'x-authenticated-discord-id': DISCORD_ID,
    'x-v2-user-id': APP_ID,
    'x-demo-viewer-id': FORGED_DEMO_ID,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TeamInvitationsController production authentication', () => {
  it('lists incoming invitations with the verified Discord identity', async () => {
    stubJwks();
    const { instance, assertAccess, listPendingInvitations } = createController();

    await expect(instance.listIncoming(authHeaders())).resolves.toEqual([]);
    expect(assertAccess).not.toHaveBeenCalled();
    expect(listPendingInvitations).toHaveBeenCalledWith(DISCORD_ID);
  });

  it('creates invitations as the verified owner identity', async () => {
    stubJwks();
    const { instance, assertAccess, createInvitation } = createController();

    await expect(
      instance.create(authHeaders(), WORKSPACE_ID, {
        recipientDiscordId: RECIPIENT_ID,
        recipientDisplayName: 'Oak',
      }),
    ).resolves.toEqual(workspaceResult);

    expect(assertAccess).not.toHaveBeenCalled();
    expect(createInvitation).toHaveBeenCalledWith({
      ownerDiscordId: DISCORD_ID,
      workspaceId: WORKSPACE_ID,
      recipientDiscordId: RECIPIENT_ID,
      recipientDisplayName: 'Oak',
    });
  });

  it('uses the verified Discord identity and server injected app id on accept', async () => {
    stubJwks();
    const { instance, respond } = createController();

    await expect(instance.accept(authHeaders(), INVITATION_ID)).resolves.toEqual(workspaceResult);
    expect(respond).toHaveBeenCalledWith({
      recipientDiscordId: DISCORD_ID,
      recipientAppId: APP_ID,
      invitationId: INVITATION_ID,
      decision: 'accept',
    });
  });

  it('rejects invitation reads and writes without an internal bearer token', async () => {
    const headers = { 'x-authenticated-discord-id': DISCORD_ID, 'x-v2-user-id': APP_ID };
    const { instance, listPendingInvitations, createInvitation, getInvitation, respond } = createController();

    await expect(instance.listIncoming(headers)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(instance.getInvitation(headers, INVITATION_ID)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      instance.create(headers, WORKSPACE_ID, {
        recipientDiscordId: RECIPIENT_ID,
        recipientDisplayName: 'Oak',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(instance.accept(headers, INVITATION_ID)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(listPendingInvitations).not.toHaveBeenCalled();
    expect(createInvitation).not.toHaveBeenCalled();
    expect(getInvitation).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });
});
