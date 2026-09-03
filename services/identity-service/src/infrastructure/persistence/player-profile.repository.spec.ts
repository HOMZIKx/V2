import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PlayerProfileRepository } from './player-profile.repository.js';

function createPool(queryImpl: (...args: unknown[]) => { rows: unknown[] }): Pool {
  return {
    query: vi.fn((...args: unknown[]) => Promise.resolve(queryImpl(...args))),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('PlayerProfileRepository discord directory', () => {
  it('returns null when Discord account is not linked', async () => {
    const pool = createPool(() => ({ rows: [] }));
    const repo = new PlayerProfileRepository(pool);
    await expect(repo.resolveDiscordDirectoryEntry('123456789012345678')).resolves.toBeNull();
  });

  it('maps linked Discord account to directory entry with profile display name', async () => {
    const pool = createPool((sql: unknown) => {
      const text = String(sql);
      if (text.includes('FROM "account"') && text.includes('providerId')) {
        return { rows: [{ userId: 'u2' }] };
      }
      if (text.includes('FROM "user"')) {
        return { rows: [{ name: 'Auth Name' }] };
      }
      if (text.includes('FROM player_profiles')) {
        return { rows: [{ display_name: 'Mateusz' }] };
      }
      return { rows: [] };
    });
    const repo = new PlayerProfileRepository(pool);
    await expect(repo.resolveDiscordDirectoryEntry('123456789012345678')).resolves.toEqual({
      v2UserId: 'u2',
      discordUserId: '123456789012345678',
      displayName: 'Mateusz',
      username: 'auth_name',
      initials: 'M',
    });
  });
});

describe('PlayerProfileRepository game accounts', () => {
  it('rejects cross-user game account updates', async () => {
    const pool = createPool((sql: unknown) => {
      const text = String(sql);
      if (text.includes('FROM player_game_accounts') && text.includes('archived_at IS NULL')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO player_profiles')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const repo = new PlayerProfileRepository(pool);
    await expect(
      repo.updateGameAccount('u1', 'foreign-acc', { displayName: 'HACK' }),
    ).rejects.toThrow(/nie należy/);
  });

  it('assigns game account on character upsert', async () => {
    const clientQuery = vi.fn((sql: unknown) => {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('INSERT INTO player_characters')) {
        return Promise.resolve({ rows: [{ id: 'char-1' }] });
      }
      if (text.includes('DELETE FROM player_character_party_roles')) {
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('INSERT INTO player_character_party_roles')) {
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('UPDATE player_profiles SET active_character_id')) {
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('UPDATE player_characters SET is_default = FALSE')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const client = { query: clientQuery, release: vi.fn() } as unknown as PoolClient;
    const pool = createPool((sql: unknown) => {
      const text = String(sql);
      if (text.includes('INSERT INTO player_profiles')) {
        return { rows: [] };
      }
      if (text.includes('FROM player_game_accounts') && text.includes('archived_at IS NULL')) {
        return {
          rows: [{ id: 'acc-1', display_name: 'MAIN', description: null, display_order: 0 }],
        };
      }
      if (
        text.includes('FROM player_game_accounts') &&
        text.includes('id = $1::uuid AND user_id')
      ) {
        return {
          rows: [{ id: 'acc-1', display_name: 'MAIN', description: null, display_order: 0 }],
        };
      }
      if (text.includes('UPDATE player_characters') && text.includes('game_account_id IS NULL')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO player_private_audit')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    const repo = new PlayerProfileRepository(pool);
    const id = await repo.upsertCharacter('u1', {
      nickname: 'Yodasz',
      classSpecKey: 'warrior_body',
      level: 95,
      isDefault: true,
      gameAccountId: 'acc-1',
      partyRoles: ['DPS'],
    });
    expect(id).toBe('char-1');
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO player_characters'),
      expect.arrayContaining(['u1', 'Yodasz', 'warrior_body', 95, true, 'acc-1']),
    );
  });
});
