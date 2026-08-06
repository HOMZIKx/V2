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
      members: [{ discordUserId: 'user-d', roleIds: ['role-1'], status: 'active' }],
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

  it('binds membership V2 id from identity link and ignores gateway-injected ids', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'gw-d', v2UserId: 'gw-real-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-gw' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-gw',
      eventKey: `reconcile-gw-${randomUUID()}`,
      roles: [],
      members: [{ discordUserId: 'gw-d', roleIds: [], status: 'active' }],
    });

    const row = await pool.query<{ v2_user_id: string | null }>(
      `SELECT v2_user_id FROM discord_membership
       WHERE discord_guild_id = 'guild-gw' AND discord_user_id = 'gw-d'`,
    );
    expect(row.rows[0]?.v2_user_id).toBe('gw-real-v2');
  });

  it('does not revoke WWW login when denying a non-login permission', async ({ skip }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'nl-d', v2UserId: 'nl-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-nl' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-nl',
      eventKey: `reconcile-nl-${randomUUID()}`,
      roles: [],
      members: [{ discordUserId: 'nl-d', roleIds: [], status: 'active' }],
    });
    await repository.activateGuild({ discordGuildId: 'guild-nl', actor: ownerActor });
    await repository.setGuildLoginEntitling({
      discordGuildId: 'guild-nl',
      loginEntitling: true,
      actor: ownerActor,
    });

    const denied = await repository.createGrant({
      effect: 'deny',
      permissionId: 'permission.authorization.policy.read',
      v2UserId: 'nl-v2',
      discordUserId: 'nl-d',
      scopeType: 'guild',
      scopeGuildId: 'guild-nl',
      actor: ownerActor,
    });
    expect(denied.revokedUserIds).toEqual([]);

    const login = await repository.authorize({
      subject: { v2UserId: 'nl-v2', discordUserId: 'nl-d' },
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });
    expect(login.decision).toBe('allow');
  });

  it('does not revoke when a guild block leaves another login-entitling guild intact', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'mg-d', v2UserId: 'mg-v2' });

    for (const guildId of ['guild-a', 'guild-b'] as const) {
      await repository.registerGuild({ discordGuildId: guildId });
      await repository.reconcileGuild({
        discordGuildId: guildId,
        eventKey: `reconcile-${guildId}-${randomUUID()}`,
        roles: [],
        members: [{ discordUserId: 'mg-d', roleIds: [], status: 'active' }],
      });
      await repository.activateGuild({ discordGuildId: guildId, actor: ownerActor });
      await repository.setGuildLoginEntitling({
        discordGuildId: guildId,
        loginEntitling: true,
        actor: ownerActor,
      });
    }

    const blocked = await repository.createBlock({
      v2UserId: 'mg-v2',
      discordUserId: 'mg-d',
      scopeType: 'guild',
      scopeGuildId: 'guild-a',
      reason: 'local mute',
      actor: ownerActor,
    });
    expect(blocked.revokedUserIds).toEqual([]);

    const login = await repository.authorize({
      subject: { v2UserId: 'mg-v2', discordUserId: 'mg-d' },
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });
    expect(login.decision).toBe('allow');
  });

  it('rejects local manager escalation via direct permission and via group', async ({ skip }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'local-d', v2UserId: 'local-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-esc' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-esc',
      eventKey: `reconcile-esc-${randomUUID()}`,
      roles: [],
      members: [{ discordUserId: 'local-d', roleIds: [], status: 'active' }],
    });
    await repository.activateGuild({ discordGuildId: 'guild-esc', actor: ownerActor });

    // Give local manager only manage.guild + policy.read (via seeded group).
    await repository.createGrant({
      effect: 'allow',
      groupId: 'group.foundation.test.local_mod',
      v2UserId: 'local-v2',
      discordUserId: 'local-d',
      scopeType: 'guild',
      scopeGuildId: 'guild-esc',
      actor: ownerActor,
    });

    const localActor = { v2UserId: 'local-v2', discordUserId: 'local-d' };

    await expect(
      repository.createGrant({
        effect: 'allow',
        permissionId: 'permission.platform.login.www',
        v2UserId: 'victim-v2',
        scopeType: 'guild',
        scopeGuildId: 'guild-esc',
        actor: localActor,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      repository.createGrant({
        effect: 'allow',
        groupId: 'group.foundation.test.member',
        v2UserId: 'victim-v2',
        scopeType: 'guild',
        scopeGuildId: 'guild-esc',
        actor: localActor,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      repository.createGrant({
        effect: 'allow',
        permissionId: 'permission.authorization.policy.read',
        v2UserId: 'victim-v2',
        scopeType: 'organization',
        actor: localActor,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('expiry of sole allow login enqueues revoke; deny/block expiry does not', async ({ skip }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'ex-d', v2UserId: 'ex-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-ex' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-ex',
      eventKey: `reconcile-ex-${randomUUID()}`,
      roles: [],
      members: [{ discordUserId: 'ex-d', roleIds: [], status: 'active' }],
    });
    await repository.activateGuild({ discordGuildId: 'guild-ex', actor: ownerActor });
    await repository.setGuildLoginEntitling({
      discordGuildId: 'guild-ex',
      loginEntitling: true,
      actor: ownerActor,
    });

    // Expiring deny must not revoke (access stays via membership).
    const past = new Date(Date.now() - 60_000);
    await pool.query(
      `INSERT INTO access_grant (
         id, effect, permission_id, discord_user_id, v2_user_id, scope_type, specificity, created_by, expires_at
       ) VALUES ($1, 'deny', 'permission.platform.login.www', 'ex-d', 'ex-v2', 'organization', 'user', 'owner-v2', $2)`,
      [randomUUID(), past],
    );
    const denyExpiry = await repository.processExpiredPolicies(new Date());
    expect(denyExpiry.revokedUserIds).not.toContain('ex-v2');

    // Detach so membership is not an entitlement source.
    await repository.applyDiscordEvent({
      eventKey: `detach-ex-${randomUUID()}`,
      eventType: 'guild_delete',
      discordGuildId: 'guild-ex',
      payload: { kind: 'guild_detach' },
    });
    await pool.query(`DELETE FROM pending_session_revoke WHERE v2_user_id = 'ex-v2'`);

    const allowId = randomUUID();
    const future = new Date(Date.now() + 60_000);
    await pool.query(
      `INSERT INTO access_grant (
         id, effect, permission_id, discord_user_id, v2_user_id, scope_type, specificity, created_by, expires_at
       ) VALUES ($1, 'allow', 'permission.platform.login.www', 'ex-d', 'ex-v2', 'organization', 'user', 'owner-v2', $2)`,
      [allowId, future],
    );

    const before = await repository.authorize({
      subject: { v2UserId: 'ex-v2', discordUserId: 'ex-d' },
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });
    expect(before.decision).toBe('allow');

    await pool.query(`UPDATE access_grant SET expires_at = $1 WHERE id = $2`, [
      new Date(Date.now() - 1_000),
      allowId,
    ]);
    const allowExpiry = await repository.processExpiredPolicies(new Date());
    expect(allowExpiry.revokedUserIds).toContain('ex-v2');

    const pending = await pool.query(
      `SELECT 1 FROM pending_session_revoke WHERE v2_user_id = 'ex-v2' AND status = 'pending'`,
    );
    expect(pending.rowCount).toBeGreaterThan(0);

    // Block expiry must not enqueue revoke.
    await pool.query(`DELETE FROM pending_session_revoke WHERE v2_user_id = 'ex-v2'`);
    await pool.query(
      `INSERT INTO access_block (
         id, discord_user_id, v2_user_id, scope_type, reason, created_by, expires_at
       ) VALUES ($1, 'ex-d', 'ex-v2', 'global', 'temp', 'owner-v2', $2)`,
      [randomUUID(), new Date(Date.now() - 1_000)],
    );
    const blockExpiry = await repository.processExpiredPolicies(new Date());
    expect(blockExpiry.revokedUserIds).not.toContain('ex-v2');
  });

  it('recovers identical reconcile snapshot after unavailable without random keys', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'rec-d', v2UserId: 'rec-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-rec' });

    const snapshot = {
      roles: [{ discordRoleId: 'role-rec', nameCache: 'Rec' }],
      members: [{ discordUserId: 'rec-d', roleIds: ['role-rec'], status: 'active' as const }],
    };
    const reconcileKey = 'dg:reconcile:guild-rec:identical-snapshot-S';

    const first = await repository.reconcileGuild({
      discordGuildId: 'guild-rec',
      eventKey: reconcileKey,
      ...snapshot,
    });
    expect(first.applied).toBe(true);

    const genAfterFirst = await pool.query<{ availability_generation: number }>(
      `SELECT availability_generation FROM connected_guild WHERE discord_guild_id = 'guild-rec'`,
    );
    const generationBeforeOutage = genAfterFirst.rows[0]!.availability_generation;

    await repository.applyDiscordEvent({
      eventKey: 'client:rec-unavail-1',
      eventType: 'guild_unavailable',
      discordGuildId: 'guild-rec',
      payload: { kind: 'guild_unavailable' },
    });
    const unavailableState = await pool.query<{ sync_status: string }>(
      `SELECT sync_status FROM connected_guild WHERE discord_guild_id = 'guild-rec'`,
    );
    expect(unavailableState.rows[0]!.sync_status).toBe('unavailable');

    const firstUnavailable = await pool.query<{ event_key: string }>(
      `SELECT event_key FROM processed_event
       WHERE event_key LIKE 'dg:guild_unavailable:guild-rec:%'
       ORDER BY processed_at ASC LIMIT 1`,
    );
    const firstUnavailableKey = firstUnavailable.rows[0]!.event_key;

    // New repository instance (simulates gateway/authz process restart).
    const restarted = new AuthorizationRepository(pool, 120);
    const recovery = await restarted.reconcileGuild({
      discordGuildId: 'guild-rec',
      eventKey: reconcileKey,
      ...snapshot,
    });
    expect(recovery.applied).toBe(true);
    expect(recovery.duplicate).toBe(false);

    const afterRecovery = await pool.query<{
      sync_status: string;
      availability_generation: number;
      last_sync_error: string | null;
    }>(
      `SELECT sync_status, availability_generation, last_sync_error
       FROM connected_guild WHERE discord_guild_id = 'guild-rec'`,
    );
    expect(afterRecovery.rows[0]!.sync_status).toBe('fresh');
    expect(afterRecovery.rows[0]!.last_sync_error).toBeNull();
    expect(afterRecovery.rows[0]!.availability_generation).toBe(generationBeforeOutage + 1);

    const recoveryAudit = await pool.query(
      `SELECT 1 FROM audit_log
       WHERE action = 'discord.reconcile_recovery'
         AND discord_guild_id = 'guild-rec'
         AND details->>'eventKey' = $1`,
      [reconcileKey],
    );
    expect(recoveryAudit.rowCount).toBeGreaterThan(0);

    // Identical reconcile while already fresh → true duplicate, no generation bump.
    const duplicateWhileFresh = await restarted.reconcileGuild({
      discordGuildId: 'guild-rec',
      eventKey: reconcileKey,
      ...snapshot,
    });
    expect(duplicateWhileFresh.applied).toBe(false);
    expect(duplicateWhileFresh.duplicate).toBe(true);
    const genAfterDuplicate = await pool.query<{ availability_generation: number }>(
      `SELECT availability_generation FROM connected_guild WHERE discord_guild_id = 'guild-rec'`,
    );
    expect(genAfterDuplicate.rows[0]!.availability_generation).toBe(generationBeforeOutage + 1);

    const nextUnavailable = await restarted.applyDiscordEvent({
      eventKey: 'client:rec-unavail-2',
      eventType: 'guild_unavailable',
      discordGuildId: 'guild-rec',
      payload: { kind: 'guild_unavailable' },
    });
    expect(nextUnavailable.applied).toBe(true);
    expect(nextUnavailable.eventKey).not.toBe(firstUnavailableKey);

    // Parallel recovery must bump generation exactly once.
    const parallelKey = 'dg:reconcile:guild-rec:parallel-recovery-S';
    const parallelSnapshot = {
      roles: [{ discordRoleId: 'role-rec', nameCache: 'Rec' }],
      members: [{ discordUserId: 'rec-d', roleIds: ['role-rec'], status: 'active' as const }],
    };
    // Seed processed_event as if this snapshot was reconciled earlier while fresh.
    await repository.reconcileGuild({
      discordGuildId: 'guild-rec',
      eventKey: parallelKey,
      ...parallelSnapshot,
    });
    await pool.query(
      `UPDATE connected_guild SET sync_status = 'unavailable' WHERE discord_guild_id = 'guild-rec'`,
    );
    const genBeforeRace = await pool.query<{ availability_generation: number }>(
      `SELECT availability_generation FROM connected_guild WHERE discord_guild_id = 'guild-rec'`,
    );
    const raceBase = genBeforeRace.rows[0]!.availability_generation;

    const repoA = new AuthorizationRepository(pool, 120);
    const repoB = new AuthorizationRepository(pool, 120);
    const [resultA, resultB] = await Promise.all([
      repoA.reconcileGuild({
        discordGuildId: 'guild-rec',
        eventKey: parallelKey,
        ...parallelSnapshot,
      }),
      repoB.reconcileGuild({
        discordGuildId: 'guild-rec',
        eventKey: parallelKey,
        ...parallelSnapshot,
      }),
    ]);
    const appliedCount = [resultA, resultB].filter((entry) => entry.applied).length;
    const duplicateCount = [resultA, resultB].filter((entry) => entry.duplicate).length;
    expect(appliedCount).toBe(1);
    expect(duplicateCount).toBe(1);

    const genAfterRace = await pool.query<{ availability_generation: number }>(
      `SELECT availability_generation FROM connected_guild WHERE discord_guild_id = 'guild-rec'`,
    );
    expect(genAfterRace.rows[0]!.availability_generation).toBe(raceBase + 1);

    const recoveryAudits = await pool.query(
      `SELECT 1 FROM audit_log
       WHERE action = 'discord.reconcile_recovery'
         AND discord_guild_id = 'guild-rec'
         AND details->>'eventKey' = $1`,
      [parallelKey],
    );
    expect(recoveryAudits.rowCount).toBe(1);
  });

  it('durable lifecycle generations survive across repository instances', async ({ skip }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'life-d', v2UserId: 'life-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-life' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-life',
      eventKey: `reconcile-life-${randomUUID()}`,
      roles: [],
      members: [{ discordUserId: 'life-d', roleIds: [], status: 'active' }],
    });

    const firstLeave = await repository.applyDiscordEvent({
      eventKey: 'client:remove:1',
      eventType: 'guild_member_remove',
      discordGuildId: 'guild-life',
      payload: { kind: 'member_remove', discordUserId: 'life-d' },
    });
    expect(firstLeave.applied).toBe(true);
    expect(firstLeave.eventKey).toBe('dg:guild_member_remove:guild-life:life-d:0');

    const retryLeave = await repository.applyDiscordEvent({
      eventKey: 'client:remove:retry',
      eventType: 'guild_member_remove',
      discordGuildId: 'guild-life',
      payload: { kind: 'member_remove', discordUserId: 'life-d' },
    });
    expect(retryLeave.duplicate).toBe(true);
    expect(retryLeave.eventKey).toBe(firstLeave.eventKey);

    await repository.applyDiscordEvent({
      eventKey: `client:add:${randomUUID()}`,
      eventType: 'guild_member_add',
      discordGuildId: 'guild-life',
      payload: {
        kind: 'member_upsert',
        member: { discordUserId: 'life-d', roleIds: [], status: 'active' },
      },
    });

    // Simulate gateway restart: new repository instance, same DB.
    const freshRepo = new AuthorizationRepository(pool, 120);
    const secondLeave = await freshRepo.applyDiscordEvent({
      eventKey: 'client:remove:2',
      eventType: 'guild_member_remove',
      discordGuildId: 'guild-life',
      payload: { kind: 'member_remove', discordUserId: 'life-d' },
    });
    expect(secondLeave.applied).toBe(true);
    expect(secondLeave.eventKey).toBe('dg:guild_member_remove:guild-life:life-d:1');
    expect(secondLeave.eventKey).not.toBe(firstLeave.eventKey);

    // unavailable → identical reconcile recovery → new unavailable generation
    const outageSnapshot = {
      roles: [] as Array<{ discordRoleId: string; nameCache: string }>,
      members: [] as Array<{ discordUserId: string; roleIds: string[]; status: 'active' }>,
    };
    const outageReconcileKey = 'dg:reconcile:guild-life:outage-recovery-snapshot';
    await repository.reconcileGuild({
      discordGuildId: 'guild-life',
      eventKey: outageReconcileKey,
      ...outageSnapshot,
    });
    const unavail1 = await repository.applyDiscordEvent({
      eventKey: 'client:unavail:1',
      eventType: 'guild_unavailable',
      discordGuildId: 'guild-life',
      payload: { kind: 'guild_unavailable' },
    });
    expect(unavail1.eventKey).toMatch(/^dg:guild_unavailable:guild-life:\d+$/);
    // Same snapshot + same eventKey after outage must recover (not randomUUID).
    const recovered = await freshRepo.reconcileGuild({
      discordGuildId: 'guild-life',
      eventKey: outageReconcileKey,
      ...outageSnapshot,
    });
    expect(recovered.applied).toBe(true);
    expect(recovered.duplicate).toBe(false);
    const unavail2 = await freshRepo.applyDiscordEvent({
      eventKey: 'client:unavail:2',
      eventType: 'guild_unavailable',
      discordGuildId: 'guild-life',
      payload: { kind: 'guild_unavailable' },
    });
    expect(unavail2.applied).toBe(true);
    expect(unavail2.eventKey).not.toBe(unavail1.eventKey);

    // detach → reconnect → new instance → detach
    const detach1 = await repository.applyDiscordEvent({
      eventKey: 'client:detach:1',
      eventType: 'guild_delete',
      discordGuildId: 'guild-life',
      payload: { kind: 'guild_detach' },
    });
    await freshRepo.registerGuild({ discordGuildId: 'guild-life' });
    const detach2 = await freshRepo.applyDiscordEvent({
      eventKey: 'client:detach:2',
      eventType: 'guild_delete',
      discordGuildId: 'guild-life',
      payload: { kind: 'guild_detach' },
    });
    expect(detach2.applied).toBe(true);
    expect(detach2.eventKey).not.toBe(detach1.eventKey);
  });

  it('rejects stale lease owner delivered/failed after another worker claims', async ({ skip }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    const id = randomUUID();
    await pool.query(
      `INSERT INTO pending_session_revoke (id, v2_user_id, correlation_id, reason, status, next_attempt_at)
       VALUES ($1, 'lease2-user', 'lease-corr-2', 'login_entitlement_lost', 'pending', now())`,
      [id],
    );

    const claimedA = await repository.claimPendingSessionRevokes({
      leaseOwner: 'worker-a',
      leaseSeconds: 1,
      limit: 10,
    });
    expect(claimedA.some((row) => row.id === id)).toBe(true);

    await pool.query(
      `UPDATE pending_session_revoke SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [id],
    );

    const claimedB = await repository.claimPendingSessionRevokes({
      leaseOwner: 'worker-b',
      leaseSeconds: 60,
      limit: 10,
    });
    expect(claimedB.some((row) => row.id === id)).toBe(true);

    const lateDelivered = await repository.markSessionRevokeDelivered(id, 'worker-a');
    expect(lateDelivered).toBe(false);
    const lateFailed = await repository.markSessionRevokeAttemptFailed({
      id,
      leaseOwner: 'worker-a',
      errorMessage: 'stale',
    });
    expect(lateFailed).toBe(false);

    const ok = await repository.markSessionRevokeDelivered(id, 'worker-b');
    expect(ok).toBe(true);

    const audits = await pool.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE details->>'revokeId' = $1`,
      [id],
    );
    const deliveredCount = audits.rows.filter((row) => row.action === 'revoke.delivered').length;
    expect(deliveredCount).toBe(1);
  });

  it('local manager cannot allow or deny permissions (or groups) they do not hold', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'deny-d', v2UserId: 'deny-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-deny-esc' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-deny-esc',
      eventKey: `reconcile-deny-esc-${randomUUID()}`,
      roles: [],
      members: [{ discordUserId: 'deny-d', roleIds: [], status: 'active' }],
    });
    await repository.activateGuild({ discordGuildId: 'guild-deny-esc', actor: ownerActor });
    await repository.createGrant({
      effect: 'allow',
      groupId: 'group.foundation.test.local_mod',
      v2UserId: 'deny-v2',
      discordUserId: 'deny-d',
      scopeType: 'guild',
      scopeGuildId: 'guild-deny-esc',
      actor: ownerActor,
    });
    const localActor = { v2UserId: 'deny-v2', discordUserId: 'deny-d' };

    await expect(
      repository.createGrant({
        effect: 'deny',
        permissionId: 'permission.platform.login.www',
        v2UserId: 'victim2',
        scopeType: 'guild',
        scopeGuildId: 'guild-deny-esc',
        actor: localActor,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      repository.createGrant({
        effect: 'deny',
        groupId: 'group.foundation.test.member',
        v2UserId: 'victim2',
        scopeType: 'guild',
        scopeGuildId: 'guild-deny-esc',
        actor: localActor,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Local manager may deny a permission they hold (policy.read).
    const deniedHeld = await repository.createGrant({
      effect: 'deny',
      permissionId: 'permission.authorization.policy.read',
      v2UserId: 'victim2',
      discordUserId: 'victim2-d',
      scopeType: 'guild',
      scopeGuildId: 'guild-deny-esc',
      actor: localActor,
    });
    expect(deniedHeld.id.length).toBeGreaterThan(0);

    const allowedHeld = await repository.createGrant({
      effect: 'allow',
      permissionId: 'permission.authorization.policy.read',
      v2UserId: 'victim3',
      discordUserId: 'victim3-d',
      scopeType: 'guild',
      scopeGuildId: 'guild-deny-esc',
      actor: localActor,
    });
    expect(allowedHeld.id.length).toBeGreaterThan(0);
    await pool.query(
      `INSERT INTO group_definition (group_id, description) VALUES ('group.test.escalate_org', 'test')
       ON CONFLICT DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO group_permission (group_id, permission_id) VALUES
         ('group.test.escalate_org', 'permission.authorization.policy.manage.org')
       ON CONFLICT DO NOTHING`,
    );
    await expect(
      repository.createGrant({
        effect: 'deny',
        groupId: 'group.test.escalate_org',
        v2UserId: 'victim4',
        discordUserId: 'victim4-d',
        scopeType: 'guild',
        scopeGuildId: 'guild-deny-esc',
        actor: localActor,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('organization deny login revokes; unrelated deny does not; sole allow expiry revokes', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'lg-d', v2UserId: 'lg-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-lg' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-lg',
      eventKey: `reconcile-lg-${randomUUID()}`,
      roles: [],
      members: [{ discordUserId: 'lg-d', roleIds: [], status: 'active' }],
    });
    await repository.activateGuild({ discordGuildId: 'guild-lg', actor: ownerActor });
    await repository.setGuildLoginEntitling({
      discordGuildId: 'guild-lg',
      loginEntitling: true,
      actor: ownerActor,
    });

    const loginOk = await repository.authorize({
      subject: { v2UserId: 'lg-v2', discordUserId: 'lg-d' },
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });
    expect(loginOk.decision).toBe('allow');

    const denied = await repository.createGrant({
      effect: 'deny',
      permissionId: 'permission.platform.login.www',
      v2UserId: 'lg-v2',
      discordUserId: 'lg-d',
      scopeType: 'organization',
      actor: ownerActor,
    });
    expect(denied.revokedUserIds).toContain('lg-v2');

    await pool.query(`DELETE FROM pending_session_revoke WHERE v2_user_id = 'lg-v2'`);
    await pool.query(`DELETE FROM access_grant WHERE id = $1`, [denied.id]);

    const unrelated = await repository.createGrant({
      effect: 'deny',
      permissionId: 'permission.authorization.policy.read',
      v2UserId: 'lg-v2',
      discordUserId: 'lg-d',
      scopeType: 'organization',
      actor: ownerActor,
    });
    expect(unrelated.revokedUserIds).toEqual([]);
  });

  it('audits revoke.enqueued / attempt_failed / delivered lifecycle', async ({ skip }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await bootstrapOwnerFixture(repository);
    await repository.upsertIdentityLink({ discordUserId: 'aud-d', v2UserId: 'aud-v2' });
    await repository.registerGuild({ discordGuildId: 'guild-aud' });
    await repository.reconcileGuild({
      discordGuildId: 'guild-aud',
      eventKey: `reconcile-aud-${randomUUID()}`,
      roles: [],
      members: [{ discordUserId: 'aud-d', roleIds: [], status: 'active' }],
    });
    await repository.activateGuild({ discordGuildId: 'guild-aud', actor: ownerActor });
    await repository.setGuildLoginEntitling({
      discordGuildId: 'guild-aud',
      loginEntitling: true,
      actor: ownerActor,
    });

    await repository.createBlock({
      v2UserId: 'aud-v2',
      discordUserId: 'aud-d',
      scopeType: 'global',
      reason: 'audit revoke',
      actor: ownerActor,
    });

    const enqueued = await pool.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE action = 'revoke.enqueued' AND subject_v2_user_id = 'aud-v2'`,
    );
    expect(enqueued.rowCount).toBeGreaterThan(0);

    const claimed = await repository.claimPendingSessionRevokes({
      leaseOwner: 'test-worker',
      limit: 10,
    });
    const row = claimed.find((entry) => entry.v2UserId === 'aud-v2');
    expect(row).toBeDefined();

    await repository.markSessionRevokeAttemptFailed({
      id: row!.id,
      leaseOwner: 'test-worker',
      errorMessage: 'identity down',
    });
    const failed = await pool.query(
      `SELECT 1 FROM audit_log WHERE action = 'revoke.attempt_failed' AND subject_v2_user_id = 'aud-v2'`,
    );
    expect(failed.rowCount).toBeGreaterThan(0);

    // Failed attempt clears the lease; reclaim before marking delivered.
    await pool.query(
      `UPDATE pending_session_revoke
       SET next_attempt_at = now(), lease_owner = NULL, lease_expires_at = NULL
       WHERE id = $1`,
      [row!.id],
    );
    const reclaimed = await repository.claimPendingSessionRevokes({
      leaseOwner: 'test-worker',
      limit: 10,
    });
    expect(reclaimed.some((entry) => entry.id === row!.id)).toBe(true);

    const deliveredOk = await repository.markSessionRevokeDelivered(row!.id, 'test-worker');
    expect(deliveredOk).toBe(true);
    const delivered = await pool.query(
      `SELECT 1 FROM audit_log WHERE action = 'revoke.delivered' AND subject_v2_user_id = 'aud-v2'`,
    );
    expect(delivered.rowCount).toBeGreaterThan(0);
  });

  it('claims pending revokes with lease so a second claim skips locked rows', async ({ skip }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    await pool.query(
      `INSERT INTO pending_session_revoke (id, v2_user_id, correlation_id, reason, status, next_attempt_at)
       VALUES ($1, 'lease-user', 'lease-corr-1', 'login_entitlement_lost', 'pending', now())
       ON CONFLICT DO NOTHING`,
      [randomUUID()],
    );
    const first = await repository.claimPendingSessionRevokes({
      leaseOwner: 'worker-a',
      leaseSeconds: 60,
      limit: 10,
    });
    expect(first.some((row) => row.correlationId === 'lease-corr-1')).toBe(true);

    const second = await repository.claimPendingSessionRevokes({
      leaseOwner: 'worker-b',
      leaseSeconds: 60,
      limit: 10,
    });
    expect(second.some((row) => row.correlationId === 'lease-corr-1')).toBe(false);
  });
});
