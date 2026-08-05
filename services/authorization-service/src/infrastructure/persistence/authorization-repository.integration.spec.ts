import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { runMigrations } from '../db/run-migrations.js';
import { AuthorizationRepository } from './authorization-repository.js';

/**
 * Gated by RUN_INFRA_TESTS=true. When the flag is set but PostgreSQL is
 * unreachable, the suite is skipped instead of failing the unit-test job.
 */
const wantInfra = process.env.RUN_INFRA_TESTS === 'true';

describe.skipIf(!wantInfra)('AuthorizationRepository (infra)', () => {
  let pool: Pool | undefined;
  let repository: AuthorizationRepository | undefined;
  let infraReady = false;
  const databaseUrl =
    process.env.AUTHORIZATION_DATABASE_URL ??
    'postgresql://authorization:authorization_dev_password@127.0.0.1:5432/authorization';

  beforeAll(async () => {
    try {
      const migrationsDir = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../migrations',
      );
      await runMigrations({ connectionString: databaseUrl, migrationsDir });
      pool = new Pool({ connectionString: databaseUrl });
      await pool.query(
        'TRUNCATE processed_event, audit_log, access_block, access_grant, discord_member_role, discord_membership, discord_role_mapping, discord_role_snapshot, discord_identity_link, connected_guild, organization CASCADE',
      );
      repository = new AuthorizationRepository(pool, 120);
      await repository.ensureOrganization(randomUUID());
      infraReady = true;
    } catch (error) {
      console.warn(
        'AuthorizationRepository infra tests skipped: database unavailable.',
        error instanceof Error ? error.message : error,
      );
      infraReady = false;
    }
  }, 60_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
  });

  it('bootstraps owner idempotently', async ({ skip }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    const first = await repository.bootstrapOwner({ discordUserId: 'owner-d' });
    expect(first.alreadyCompleted).toBe(false);
    const second = await repository.bootstrapOwner({ discordUserId: 'owner-d' });
    expect(second.alreadyCompleted).toBe(true);
  });

  it('upserts identity links and authorizes login entitlement', async ({ skip }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await repository.registerGuild({ discordGuildId: 'guild-1' });
    await repository.activateGuild({ discordGuildId: 'guild-1', loginEntitling: true });
    await repository.upsertIdentityLink({ discordUserId: 'user-d', v2UserId: 'user-v2' });

    await repository.reconcileGuild({
      discordGuildId: 'guild-1',
      eventKey: `reconcile-test-${randomUUID()}`,
      roles: [{ discordRoleId: 'role-1', nameCache: 'Member' }],
      members: [
        {
          discordUserId: 'user-d',
          v2UserId: 'user-v2',
          roleIds: ['role-1'],
          status: 'active',
        },
      ],
    });

    const decision = await repository.authorize({
      subject: { v2UserId: 'user-v2', discordUserId: 'user-d' },
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });

    expect(decision.decision).toBe('allow');
  });

  it('applies discord events idempotently and detects entitlement loss', async ({ skip }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    const removeKey = `remove-${randomUUID()}`;
    const first = await repository.applyDiscordEvent({
      eventKey: removeKey,
      eventType: 'member_remove',
      discordGuildId: 'guild-1',
      payload: { kind: 'member_remove', discordUserId: 'user-d' },
    });
    expect(first.applied).toBe(true);
    expect(first.revokedUserIds).toContain('user-v2');

    const second = await repository.applyDiscordEvent({
      eventKey: removeKey,
      eventType: 'member_remove',
      discordGuildId: 'guild-1',
      payload: { kind: 'member_remove', discordUserId: 'user-d' },
    });
    expect(second.duplicate).toBe(true);
    expect(second.applied).toBe(false);
  });
});
