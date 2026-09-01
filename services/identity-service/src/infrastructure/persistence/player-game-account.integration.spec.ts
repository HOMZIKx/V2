import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../db/run-migrations.js';
import { PlayerProfileRepository } from '../persistence/player-profile.repository.js';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

const runInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;

runInfra('player game accounts integration', () => {
  let pool: Pool;
  let repo: PlayerProfileRepository;
  const userA = `user-${randomUUID()}`;
  const userB = `user-${randomUUID()}`;

  beforeAll(async () => {
    const databaseUrl = process.env.IDENTITY_DATABASE_URL;
    if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
      throw new Error('IDENTITY_DATABASE_URL is required for integration tests');
    }
    await runMigrations({ connectionString: databaseUrl, migrationsDir });
    pool = new Pool({ connectionString: databaseUrl });
    repo = new PlayerProfileRepository(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM player_characters WHERE user_id = ANY($1::text[])`, [
      [userA, userB],
    ]);
    await pool.query(`DELETE FROM player_game_accounts WHERE user_id = ANY($1::text[])`, [
      [userA, userB],
    ]);
    await pool.query(`DELETE FROM player_profiles WHERE user_id = ANY($1::text[])`, [
      [userA, userB],
    ]);
    await pool.end();
  });

  it('creates default account and backfills characters idempotently', async () => {
    await repo.ensureProfile(userA, 'Tester A');
    const charId = await repo.upsertCharacter(userA, {
      nickname: 'Yodasz',
      classSpecKey: 'warrior_body',
      level: 95,
      isDefault: true,
      partyRoles: ['DPS'],
    });

    const first = await repo.getProfile(userA);
    expect(first?.gameAccounts.length).toBeGreaterThanOrEqual(1);
    expect(first?.gameAccounts[0]?.displayName).toBe('Moje konto');
    expect(first?.characters[0]?.gameAccountId).toBe(first?.gameAccounts[0]?.id);
    expect(first?.characters[0]?.id).toBe(charId);

    const second = await repo.getProfile(userA);
    expect(second?.gameAccounts).toHaveLength(1);
  });

  it('isolates accounts between users', async () => {
    await repo.ensureProfile(userB, 'Tester B');
    const account = await repo.createGameAccount(userB, { displayName: 'DROP' });
    await expect(
      repo.updateGameAccount(userA, account.id, { displayName: 'HACK' }),
    ).rejects.toThrow(/nie należy/);
  });

  it('moves character between owned accounts with stable id', async () => {
    const drop = await repo.createGameAccount(userA, { displayName: 'DROP' });
    const profile = await repo.getProfile(userA);
    const character = profile?.characters[0];
    expect(character).toBeDefined();
    if (character === undefined) {
      return;
    }
    const movedId = await repo.upsertCharacter(
      userA,
      {
        nickname: character.nickname,
        classSpecKey: character.classSpecKey,
        level: character.level,
        partyRoles: character.partyRoles,
        gameAccountId: drop.id,
      },
      character.id,
    );
    expect(movedId).toBe(character.id);
    const after = await repo.getProfile(userA);
    const moved = after?.characters.find((entry) => entry.id === character.id);
    expect(moved?.gameAccountId).toBe(drop.id);
  });
});
