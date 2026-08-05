import { APIError } from 'better-auth';
import { describe, expect, it, vi } from 'vitest';

import { buildSyntheticEmail } from '../../domain/synthetic-email.js';
import type { BetterAuthInstance } from '../auth/create-better-auth.js';
import { BetterAuthIdentityAdapter } from './better-auth-identity.adapter.js';

interface FakeApi {
  getSession: ReturnType<typeof vi.fn>;
  listUserAccounts: ReturnType<typeof vi.fn>;
  linkSocialAccount: ReturnType<typeof vi.fn>;
  unlinkAccount: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  revokeSessions: ReturnType<typeof vi.fn>;
}

function makeAuth(
  api: Partial<FakeApi> = {},
  deleteUserSessions = vi.fn(),
): {
  auth: BetterAuthInstance;
  api: FakeApi;
  deleteUserSessions: ReturnType<typeof vi.fn>;
} {
  const fullApi: FakeApi = {
    getSession: vi.fn(),
    listUserAccounts: vi.fn().mockResolvedValue([]),
    linkSocialAccount: vi.fn().mockResolvedValue({ url: 'https://provider.test/auth' }),
    unlinkAccount: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue({}),
    revokeSessions: vi.fn().mockResolvedValue({}),
    ...api,
  };
  const auth = {
    api: fullApi,
    $context: Promise.resolve({ internalAdapter: { deleteUserSessions } }),
  } as unknown as BetterAuthInstance;
  return { auth, api: fullApi, deleteUserSessions };
}

const headers = new Headers();

describe('BetterAuthIdentityAdapter.getMe', () => {
  it('maps a real-email session into a view', async () => {
    const { auth } = makeAuth({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: 'u1',
          name: 'Real',
          email: 'real@example.com',
          emailVerified: true,
          image: 'http://img',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      }),
    });
    const view = await new BetterAuthIdentityAdapter(auth).getMe(headers);
    expect(view).toMatchObject({ id: 'u1', email: 'real@example.com', emailSynthetic: false });
  });

  it('hides synthetic emails behind email=null', async () => {
    const synthetic = buildSyntheticEmail('discord', '123');
    const { auth } = makeAuth({
      getSession: vi.fn().mockResolvedValue({
        user: { id: 'u1', name: 'NoEmail', email: synthetic, emailVerified: false },
      }),
    });
    const view = await new BetterAuthIdentityAdapter(auth).getMe(headers);
    expect(view?.email).toBeNull();
    expect(view?.emailSynthetic).toBe(true);
  });

  it('returns null when there is no session', async () => {
    const { auth } = makeAuth({ getSession: vi.fn().mockResolvedValue(null) });
    await expect(new BetterAuthIdentityAdapter(auth).getMe(headers)).resolves.toBeNull();
  });
});

describe('BetterAuthIdentityAdapter accounts', () => {
  it('maps accounts and strips tokens from the view', async () => {
    const { auth } = makeAuth({
      listUserAccounts: vi.fn().mockResolvedValue([
        {
          id: 'a1',
          providerId: 'discord',
          accountId: 'd1',
          scopes: ['identify'],
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ]),
    });
    const accounts = await new BetterAuthIdentityAdapter(auth).listAccounts(headers);
    expect(accounts[0]).toMatchObject({ id: 'a1', provider: 'discord', accountId: 'd1' });
    expect(JSON.stringify(accounts)).not.toContain('token');
  });

  it('resolves the account row id to provider ids before unlinking', async () => {
    const unlink = vi.fn().mockResolvedValue({});
    const { auth } = makeAuth({
      listUserAccounts: vi
        .fn()
        .mockResolvedValue([{ id: 'a1', providerId: 'discord', accountId: 'd1', scopes: [] }]),
      unlinkAccount: unlink,
    });
    await new BetterAuthIdentityAdapter(auth).unlinkAccount('a1', headers);
    expect(unlink).toHaveBeenCalledWith({
      body: { providerId: 'discord', accountId: 'd1' },
      headers,
    });
  });

  it('maps a missing account to NOT_FOUND', async () => {
    const { auth } = makeAuth({ listUserAccounts: vi.fn().mockResolvedValue([]) });
    await expect(
      new BetterAuthIdentityAdapter(auth).unlinkAccount('missing', headers),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('BetterAuthIdentityAdapter session ops', () => {
  it('starts a link and returns the provider url', async () => {
    const { auth } = makeAuth();
    await expect(
      new BetterAuthIdentityAdapter(auth).startLink('google', headers, 'http://cb.test'),
    ).resolves.toEqual({ url: 'https://provider.test/auth' });
  });

  it('logs out current and all', async () => {
    const { auth, api } = makeAuth();
    const adapter = new BetterAuthIdentityAdapter(auth);
    await adapter.logoutCurrent(headers);
    await adapter.logoutAll(headers);
    expect(api.signOut).toHaveBeenCalledOnce();
    expect(api.revokeSessions).toHaveBeenCalledOnce();
  });

  it('system-revokes via the internal adapter', async () => {
    const { auth, deleteUserSessions } = makeAuth();
    await new BetterAuthIdentityAdapter(auth).revokeAllSessionsForUser('u1');
    expect(deleteUserSessions).toHaveBeenCalledWith('u1');
  });
});

describe('BetterAuthIdentityAdapter error mapping', () => {
  const scenarios: Array<[string, string]> = [
    ['FAILED_TO_UNLINK_LAST_ACCOUNT', 'CANNOT_UNLINK_LAST'],
    ['SOCIAL_ACCOUNT_ALREADY_LINKED', 'ACCOUNT_ALREADY_LINKED'],
    ['ACCOUNT_NOT_FOUND', 'NOT_FOUND'],
    ['FAILED_TO_GET_SESSION', 'UNAUTHENTICATED'],
  ];

  it.each(scenarios)('maps %s to %s', async (code, expected) => {
    const { auth } = makeAuth({
      getSession: vi.fn().mockRejectedValue(new APIError('BAD_REQUEST', { message: 'x', code })),
    });
    await expect(new BetterAuthIdentityAdapter(auth).getMe(headers)).rejects.toMatchObject({
      code: expected,
    });
  });

  it('maps unknown library errors to VALIDATION_FAILED', async () => {
    const { auth } = makeAuth({
      getSession: vi.fn().mockRejectedValue(new APIError('BAD_REQUEST', { message: 'x' })),
    });
    await expect(new BetterAuthIdentityAdapter(auth).getMe(headers)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
