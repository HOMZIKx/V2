import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import type { IdentityUserView } from '../domain/identity-models.js';
import type { PlayerProfileRepository } from '../infrastructure/persistence/player-profile.repository.js';
import { DirectoryController } from './directory.controller.js';

const request = { headers: { cookie: 'v2.identity.session=abc' } } as unknown as FastifyRequest;

const user: IdentityUserView = {
  id: 'u1',
  name: 'User',
  email: null,
  emailSynthetic: true,
  emailVerified: false,
  image: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const entry = {
  v2UserId: 'u2',
  discordUserId: '123456789012345678',
  displayName: 'Mateusz',
  username: 'mateusz',
  initials: 'MA',
};

function sessionPort(overrides: Partial<IdentitySessionPort> = {}): IdentitySessionPort {
  return {
    getMe: vi.fn().mockResolvedValue(user),
    listAccounts: vi.fn().mockResolvedValue([]),
    startLink: vi.fn(),
    unlinkAccount: vi.fn(),
    logoutCurrent: vi.fn(),
    logoutAll: vi.fn(),
    revokeAllSessionsForUser: vi.fn(),
    ...overrides,
  };
}

function profiles(
  overrides: Partial<Pick<PlayerProfileRepository, 'resolveDiscordDirectoryEntry'>> = {},
): PlayerProfileRepository {
  return {
    resolveDiscordDirectoryEntry: vi.fn().mockResolvedValue(entry),
    ...overrides,
  } as unknown as PlayerProfileRepository;
}

describe('DirectoryController', () => {
  it('resolves a linked Discord account to a V2 directory entry', async () => {
    const port = sessionPort();
    const resolveDiscordDirectoryEntry = vi.fn().mockResolvedValue(entry);
    const repo = profiles({ resolveDiscordDirectoryEntry });
    const controller = new DirectoryController(port, repo);

    await expect(
      controller.resolveDiscord(request, { discordUserId: '123456789012345678' }),
    ).resolves.toEqual({ entry });
    expect(resolveDiscordDirectoryEntry).toHaveBeenCalledWith('123456789012345678');
  });

  it('throws UNAUTHENTICATED when session is missing', async () => {
    const controller = new DirectoryController(
      sessionPort({ getMe: vi.fn().mockResolvedValue(null) }),
      profiles(),
    );
    await expect(
      controller.resolveDiscord(request, { discordUserId: '123456789012345678' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('throws AUTH_DISABLED when session port is null', async () => {
    const controller = new DirectoryController(null, profiles());
    await expect(
      controller.resolveDiscord(request, { discordUserId: '123456789012345678' }),
    ).rejects.toMatchObject({ code: 'AUTH_DISABLED' });
  });

  it('throws AUTH_DISABLED when profile store is null', async () => {
    const controller = new DirectoryController(sessionPort(), null);
    await expect(
      controller.resolveDiscord(request, { discordUserId: '123456789012345678' }),
    ).rejects.toMatchObject({ code: 'AUTH_DISABLED' });
  });

  it('throws VALIDATION_FAILED for non-snowflake discordUserId', async () => {
    const controller = new DirectoryController(sessionPort(), profiles());
    await expect(
      controller.resolveDiscord(request, { discordUserId: 'not-a-id' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('throws NOT_FOUND when Discord account is not linked', async () => {
    const controller = new DirectoryController(
      sessionPort(),
      profiles({ resolveDiscordDirectoryEntry: vi.fn().mockResolvedValue(null) }),
    );
    await expect(
      controller.resolveDiscord(request, { discordUserId: '123456789012345678' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
