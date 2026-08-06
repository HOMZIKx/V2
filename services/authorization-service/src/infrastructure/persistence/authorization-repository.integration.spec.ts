import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
        'TRUNCATE pending_session_revoke, processed_event, audit_log, access_block, access_grant, discord_member_role, discord_membership, discord_role_mapping, discord_role_snapshot, discord_identity_link, connected_guild, organization CASCADE',
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

  const OWNER_DISCORD = 'owner-d';
  const OWNER_V2 = 'owner-v2';
  const ownerActor = { v2UserId: OWNER_V2, discordUserId: OWNER_DISCORD } as const;

  async function bootstrapOwnerFixture(repo: AuthorizationRepository): Promise<void> {
    // First bootstrap requires an existing identity link and an exact env seed.
    await repo.upsertIdentityLink({ discordUserId: OWNER_DISCORD, v2UserId: OWNER_V2 });
    await repo.bootstrapOwner({
      discordUserId: OWNER_DISCORD,
      v2UserId: OWNER_V2,
      requiredBootstrapDiscordUserId: OWNER_DISCORD,
    });
  }

  it('rejects first bootstrap when the discord user does not match the env seed', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await repository.upsertIdentityLink({ discordUserId: 'intruder-d', v2UserId: 'intruder-v2' });
    await expect(
      repository.bootstrapOwner({
        discordUserId: 'intruder-d',
        requiredBootstrapDiscordUserId: 'the-real-owner',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('bootstraps owner idempotently and never transfers ownership on env change', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await repository.upsertIdentityLink({ discordUserId: OWNER_DISCORD, v2UserId: OWNER_V2 });
    const first = await repository.bootstrapOwner({
      discordUserId: OWNER_DISCORD,
      v2UserId: OWNER_V2,
      requiredBootstrapDiscordUserId: OWNER_DISCORD,
    });
    expect(first.alreadyCompleted).toBe(false);

    // A changed env seed pointing at a different user must not transfer ownership.
    const second = await repository.bootstrapOwner({
      discordUserId: 'attacker-d',
      requiredBootstrapDiscordUserId: 'attacker-d',
    });
    expect(second.alreadyCompleted).toBe(true);
    expect(second.ownerDiscordUserId).toBe(OWNER_DISCORD);
  });

  it('activates a guild only after a fresh sync and enqueues no revokes yet', async ({ skip }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.registerGuild({ discordGuildId: 'guild-1' });

    // A freshly registered guild is unavailable — activation must be rejected.
    await expect(
      repository.activateGuild({ discordGuildId: 'guild-1', actor: ownerActor }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await repository.upsertIdentityLink({ discordUserId: 'user-d', v2UserId: 'user-v2' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-1',
      eventKey: `reconcile-test-${randomUUID()}`,
      roles: [{ discordRoleId: 'role-1', nameCache: 'Member' }],
      members: [
        { discordUserId: 'user-d', v2UserId: 'user-v2', roleIds: ['role-1'], status: 'active' },
      ],
    });

    await repository.activateGuild({ discordGuildId: 'guild-1', actor: ownerActor });
    const entitle = await repository.setGuildLoginEntitling({
      discordGuildId: 'guild-1',
      loginEntitling: true,
      actor: ownerActor,
    });
    expect(entitle.guild.loginEntitling).toBe(true);

    const decision = await repository.authorize({
      subject: { v2UserId: 'user-v2', discordUserId: 'user-d' },
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });
    expect(decision.decision).toBe('allow');
  });

  it('enqueues a durable pending revoke when entitlement is lost', async ({ skip }) => {
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

    const pending = await repository.listPendingSessionRevokes();
    expect(pending.some((row) => row.v2UserId === 'user-v2')).toBe(true);

    const second = await repository.applyDiscordEvent({
      eventKey: removeKey,
      eventType: 'member_remove',
      discordGuildId: 'guild-1',
      payload: { kind: 'member_remove', discordUserId: 'user-d' },
    });
    expect(second.duplicate).toBe(true);
    expect(second.applied).toBe(false);
  });

  it('rejects policy mutations from an actor without manage permission', async ({ skip }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await expect(
      repository.createBlock({
        v2UserId: 'victim-v2',
        scopeType: 'global',
        reason: 'unauthorized attempt',
        actor: { v2UserId: 'nobody-v2' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps identity links immutable and rejects mismatched authorize pairs', async ({ skip }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await repository.upsertIdentityLink({ discordUserId: 'link-d', v2UserId: 'link-v2' });
    await expect(
      repository.upsertIdentityLink({ discordUserId: 'link-d', v2UserId: 'other-v2' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      repository.authorize({
        subject: { discordUserId: 'link-d', v2UserId: 'other-v2' },
        permissionId: 'permission.platform.login.www',
        scope: { type: 'organization' },
        operationClass: 'sensitive',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('registers guilds without login entitlement and marks unavailable without detach', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    const registered = await repository.registerGuild({
      discordGuildId: 'guild-unavail',
    });
    expect(registered.status).toBe('pending_sync');
    expect(registered.loginEntitling).toBe(false);

    await repository.reconcileGuild({
      discordGuildId: 'guild-unavail',
      eventKey: `reconcile-unavail-${randomUUID()}`,
      roles: [],
      members: [],
    });
    await repository.activateGuild({ discordGuildId: 'guild-unavail', actor: ownerActor });
    await repository.setGuildLoginEntitling({
      discordGuildId: 'guild-unavail',
      loginEntitling: true,
      actor: ownerActor,
    });

    const unavailable = await repository.applyDiscordEvent({
      eventKey: `unavail-${randomUUID()}`,
      eventType: 'guild_unavailable',
      discordGuildId: 'guild-unavail',
      payload: { kind: 'guild_unavailable' },
    });
    expect(unavailable.applied).toBe(true);

    const decision = await repository.authorize({
      subject: ownerActor,
      permissionId: 'permission.authorization.policy.manage.org',
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });
    // Owner shield still works; guild stays active with login_entitling preserved.
    expect(decision.decision).toBe('allow');

    const guildRow = await pool!.query<{
      status: string;
      login_entitling: boolean;
      sync_status: string;
    }>(
      `SELECT status, login_entitling, sync_status FROM connected_guild WHERE discord_guild_id = $1`,
      ['guild-unavail'],
    );
    expect(guildRow.rows[0]).toMatchObject({
      status: 'active',
      login_entitling: true,
      sync_status: 'unavailable',
    });
  });

  it('stops deleted Discord roles from granting mapped permissions immediately', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'mod-d', v2UserId: 'mod-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-roles' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-roles',
      eventKey: `reconcile-roles-${randomUUID()}`,
      roles: [{ discordRoleId: 'role-mod', nameCache: 'Mod' }],
      members: [
        {
          discordUserId: 'mod-d',
          v2UserId: 'mod-v2',
          roleIds: ['role-mod'],
          status: 'active',
        },
      ],
    });
    await repository.activateGuild({ discordGuildId: 'guild-roles', actor: ownerActor });

    await pool.query(
      `INSERT INTO discord_role_mapping (id, discord_guild_id, discord_role_id, permission_id)
       VALUES ($1, 'guild-roles', 'role-mod', 'permission.authorization.policy.read')
       ON CONFLICT DO NOTHING`,
      [randomUUID()],
    );

    const before = await repository.authorize({
      subject: { discordUserId: 'mod-d', v2UserId: 'mod-v2' },
      permissionId: 'permission.authorization.policy.read',
      scope: { type: 'guild', guildId: 'guild-roles' },
      operationClass: 'ordinary',
    });
    expect(before.decision).toBe('allow');

    await repository.applyDiscordEvent({
      eventKey: `roles-delete-${randomUUID()}`,
      eventType: 'guild_role_delete',
      discordGuildId: 'guild-roles',
      payload: { kind: 'roles_snapshot', roles: [] },
    });

    const after = await repository.authorize({
      subject: { discordUserId: 'mod-d', v2UserId: 'mod-v2' },
      permissionId: 'permission.authorization.policy.read',
      scope: { type: 'guild', guildId: 'guild-roles' },
      operationClass: 'ordinary',
    });
    expect(after.decision).toBe('deny');
  });

  it('enqueues pending revoke when creating a global block against an entitled user', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.registerGuild({ discordGuildId: 'guild-block' });
    await repository.upsertIdentityLink({ discordUserId: 'blocked-d', v2UserId: 'blocked-v2' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-block',
      eventKey: `reconcile-block-${randomUUID()}`,
      roles: [],
      members: [
        {
          discordUserId: 'blocked-d',
          v2UserId: 'blocked-v2',
          roleIds: [],
          status: 'active',
        },
      ],
    });
    await repository.activateGuild({ discordGuildId: 'guild-block', actor: ownerActor });
    await repository.setGuildLoginEntitling({
      discordGuildId: 'guild-block',
      loginEntitling: true,
      actor: ownerActor,
    });

    const blocked = await repository.createBlock({
      v2UserId: 'blocked-v2',
      discordUserId: 'blocked-d',
      scopeType: 'global',
      reason: 'manual block',
      actor: ownerActor,
    });
    expect(blocked.revokedUserIds).toContain('blocked-v2');
    const pending = await repository.listPendingSessionRevokes();
    expect(pending.some((row) => row.v2UserId === 'blocked-v2')).toBe(true);
  });
});
