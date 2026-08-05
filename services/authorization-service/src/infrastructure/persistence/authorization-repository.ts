import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import {
  decideAuthorization,
  type AccessBlockRecord,
  type AccessGrantRecord,
  type AuthorizeContext,
  type ConnectedGuildState,
  type DecisionSubject,
  type MappedPermissionGrant,
  type MembershipState,
  type OrganizationOwner,
  type SyncStatus,
} from '../../domain/decision-engine.js';
import { AuthorizationError } from '../../domain/errors.js';
import type {
  ActivateGuildCommand,
  ApplyDiscordEventCommand,
  ApplyDiscordEventResult,
  AuthorizeCommand,
  BootstrapOwnerCommand,
  BootstrapOwnerResult,
  CreateBlockCommand,
  CreateGrantCommand,
  EnsureOrganizationResult,
  IdentityLinkResult,
  MemberSnapshot,
  ReconcileGuildCommand,
  RegisterGuildCommand,
  RoleSnapshot,
  UpsertIdentityLinkCommand,
} from '../../application/ports/authorization.ports.js';

interface OrganizationRow {
  readonly id: string;
  readonly owner_discord_user_id: string | null;
  readonly owner_v2_user_id: string | null;
  readonly bootstrap_completed_at: Date | null;
}

interface GuildRow {
  readonly discord_guild_id: string;
  readonly status: ConnectedGuildState['status'];
  readonly login_entitling: boolean;
  readonly sync_status: SyncStatus;
  readonly last_fresh_at: Date | null;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function mapGuild(row: GuildRow): ConnectedGuildState {
  return {
    discordGuildId: row.discord_guild_id,
    status: row.status,
    loginEntitling: row.login_entitling,
    syncStatus: row.sync_status,
    ...(row.last_fresh_at !== null ? { lastFreshAt: row.last_fresh_at } : {}),
  };
}

async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503';
}

/**
 * Raw-SQL persistence for the Authorization Service. Owns all queries against
 * the authorization database; never imported by domain.
 */
export class AuthorizationRepository {
  public constructor(
    private readonly pool: Pool,
    private readonly trustWindowSeconds: number,
  ) {}

  public async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  public async ensureOrganization(preferredId?: string): Promise<EnsureOrganizationResult> {
    const existing = await this.pool.query<{ id: string }>(
      'SELECT id FROM organization ORDER BY created_at ASC LIMIT 1',
    );
    const row = existing.rows[0];
    if (row !== undefined) {
      return { id: row.id, created: false };
    }

    const id = preferredId ?? randomUUID();
    try {
      await this.pool.query(
        `INSERT INTO organization (id) VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [id],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }

    const after = await this.pool.query<{ id: string }>(
      'SELECT id FROM organization ORDER BY created_at ASC LIMIT 1',
    );
    const created = after.rows[0];
    if (created === undefined) {
      throw new AuthorizationError('CONFIG_INVALID', 'Failed to seed organization');
    }
    return { id: created.id, created: created.id === id };
  }

  public async bootstrapOwner(command: BootstrapOwnerCommand): Promise<BootstrapOwnerResult> {
    return withTransaction(this.pool, async (client) => {
      const orgResult = await client.query<OrganizationRow>(
        'SELECT id, owner_discord_user_id, owner_v2_user_id, bootstrap_completed_at FROM organization ORDER BY created_at ASC LIMIT 1 FOR UPDATE',
      );
      const org = orgResult.rows[0];
      if (org === undefined) {
        throw new AuthorizationError('CONFIG_INVALID', 'Organization is not seeded');
      }

      if (org.bootstrap_completed_at !== null && org.owner_discord_user_id !== null) {
        if (org.owner_discord_user_id !== command.discordUserId) {
          throw new AuthorizationError(
            'CONFLICT',
            'Organization owner is already bootstrapped',
          );
        }
        if (
          command.v2UserId !== undefined &&
          org.owner_v2_user_id !== null &&
          org.owner_v2_user_id !== command.v2UserId
        ) {
          throw new AuthorizationError(
            'CONFLICT',
            'Organization owner V2 user does not match bootstrap request',
          );
        }

        let ownerV2 = org.owner_v2_user_id;
        if (command.v2UserId !== undefined && org.owner_v2_user_id === null) {
          await client.query(
            `UPDATE organization
             SET owner_v2_user_id = $1, updated_at = now()
             WHERE id = $2`,
            [command.v2UserId, org.id],
          );
          ownerV2 = command.v2UserId;
        }

        return {
          organizationId: org.id,
          ownerDiscordUserId: org.owner_discord_user_id,
          ...(ownerV2 !== null ? { ownerV2UserId: ownerV2 } : {}),
          bootstrapCompletedAt: toIso(org.bootstrap_completed_at),
          alreadyCompleted: true,
        };
      }

      const completedAt = new Date();
      await client.query(
        `UPDATE organization
         SET owner_discord_user_id = $1,
             owner_v2_user_id = $2,
             bootstrap_completed_at = $3,
             bootstrap_source_discord_user_id_snapshot = $1,
             updated_at = now()
         WHERE id = $4`,
        [command.discordUserId, command.v2UserId ?? null, completedAt, org.id],
      );

      await client.query(
        `INSERT INTO audit_log (id, action, actor, subject_discord_user_id, subject_v2_user_id, correlation_id, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          randomUUID(),
          'bootstrap.owner',
          command.actor ?? 'system',
          command.discordUserId,
          command.v2UserId ?? null,
          command.correlationId ?? null,
          JSON.stringify({ organizationId: org.id }),
        ],
      );

      return {
        organizationId: org.id,
        ownerDiscordUserId: command.discordUserId,
        ...(command.v2UserId !== undefined ? { ownerV2UserId: command.v2UserId } : {}),
        bootstrapCompletedAt: toIso(completedAt),
        alreadyCompleted: false,
      };
    });
  }

  public async upsertIdentityLink(
    command: UpsertIdentityLinkCommand,
  ): Promise<IdentityLinkResult> {
    try {
      const result = await withTransaction(this.pool, async (client) => {
        const linked = await client.query<{
          discord_user_id: string;
          v2_user_id: string;
          linked_at: Date;
        }>(
          `INSERT INTO discord_identity_link (discord_user_id, v2_user_id)
           VALUES ($1, $2)
           ON CONFLICT (discord_user_id) DO UPDATE
             SET v2_user_id = EXCLUDED.v2_user_id,
                 linked_at = now()
           RETURNING discord_user_id, v2_user_id, linked_at`,
          [command.discordUserId, command.v2UserId],
        );

        await client.query(
          `UPDATE discord_membership
           SET v2_user_id = $1, updated_at = now()
           WHERE discord_user_id = $2`,
          [command.v2UserId, command.discordUserId],
        );

        const row = linked.rows[0];
        if (row === undefined) {
          throw new AuthorizationError('CONFIG_INVALID', 'Identity link upsert failed');
        }
        return row;
      });

      return {
        discordUserId: result.discord_user_id,
        v2UserId: result.v2_user_id,
        linkedAt: toIso(result.linked_at),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthorizationError(
          'CONFLICT',
          'V2 user or Discord user is already linked to a different identity',
        );
      }
      throw error;
    }
  }

  public async authorize(command: AuthorizeCommand): Promise<ReturnType<typeof decideAuthorization>> {
    const now = command.now ?? new Date();
    const loaded = await this.loadAuthorizeContext(command.subject);
    return decideAuthorization(
      {
        subject: command.subject,
        permissionId: command.permissionId,
        scope: command.scope,
        operationClass: command.operationClass,
        now,
        trustWindowSeconds: this.trustWindowSeconds,
      },
      loaded.context,
      { groupPermissionIdsForGrants: loaded.groupPermissionIdsForGrants },
    );
  }

  public async registerGuild(command: RegisterGuildCommand): Promise<ConnectedGuildState> {
    const org = await this.requireOrganizationId();
    try {
      const result = await this.pool.query<GuildRow>(
        `INSERT INTO connected_guild (
           discord_guild_id, organization_id, status, login_entitling, sync_status
         ) VALUES ($1, $2, 'pending_sync', $3, 'unavailable')
         ON CONFLICT (discord_guild_id) DO UPDATE
           SET updated_at = now()
         RETURNING discord_guild_id, status, login_entitling, sync_status, last_fresh_at`,
        [command.discordGuildId, org, command.loginEntitling ?? false],
      );
      const row = result.rows[0];
      if (row === undefined) {
        throw new AuthorizationError('CONFIG_INVALID', 'Guild register failed');
      }
      return mapGuild(row);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new AuthorizationError('CONFIG_INVALID', 'Organization is not seeded');
      }
      throw error;
    }
  }

  public async applyDiscordEvent(
    command: ApplyDiscordEventCommand,
  ): Promise<ApplyDiscordEventResult> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query(
        `INSERT INTO processed_event (event_key, event_type, discord_guild_id, payload_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key`,
        [command.eventKey, command.eventType, command.discordGuildId, command.payloadHash ?? null],
      );

      if (inserted.rowCount === 0) {
        return { applied: false, duplicate: true, revokedUserIds: [] };
      }

      await this.requireGuild(client, command.discordGuildId);

      const candidatesBefore = await this.collectEntitledUserIds(client, command.discordGuildId);

      switch (command.payload.kind) {
        case 'member_upsert':
          await this.upsertMember(client, command.discordGuildId, command.payload.member);
          break;
        case 'member_remove':
          await this.deactivateMember(client, command.discordGuildId, command.payload.discordUserId);
          break;
        case 'roles_snapshot':
          await this.replaceRoles(client, command.discordGuildId, command.payload.roles);
          break;
        case 'guild_detach':
          await client.query(
            `UPDATE connected_guild
             SET status = 'inactive_detached', login_entitling = FALSE, sync_status = 'unavailable', updated_at = now()
             WHERE discord_guild_id = $1`,
            [command.discordGuildId],
          );
          break;
        default: {
          const _exhaustive: never = command.payload;
          throw new AuthorizationError(
            'VALIDATION_FAILED',
            `Unsupported event payload: ${JSON.stringify(_exhaustive)}`,
          );
        }
      }

      await client.query(
        `UPDATE connected_guild
         SET last_sync_at = now(), updated_at = now()
         WHERE discord_guild_id = $1`,
        [command.discordGuildId],
      );

      const revokedUserIds = await this.usersWhoLostEntitlement(client, candidatesBefore);
      return { applied: true, duplicate: false, revokedUserIds };
    });
  }

  public async reconcileGuild(command: ReconcileGuildCommand): Promise<ApplyDiscordEventResult> {
    const eventKey = command.eventKey ?? `reconcile:${command.discordGuildId}:${randomUUID()}`;

    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query(
        `INSERT INTO processed_event (event_key, event_type, discord_guild_id)
         VALUES ($1, 'reconcile', $2)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key`,
        [eventKey, command.discordGuildId],
      );
      if (inserted.rowCount === 0) {
        return { applied: false, duplicate: true, revokedUserIds: [] };
      }

      await this.requireGuild(client, command.discordGuildId);
      const candidatesBefore = await this.collectEntitledUserIds(client, command.discordGuildId);

      await this.replaceRoles(client, command.discordGuildId, command.roles);

      const seenUsers = new Set<string>();
      for (const member of command.members) {
        seenUsers.add(member.discordUserId);
        await this.upsertMember(client, command.discordGuildId, member);
      }

      const existing = await client.query<{ discord_user_id: string }>(
        `SELECT discord_user_id FROM discord_membership
         WHERE discord_guild_id = $1 AND status = 'active'`,
        [command.discordGuildId],
      );
      for (const row of existing.rows) {
        if (!seenUsers.has(row.discord_user_id)) {
          await this.deactivateMember(client, command.discordGuildId, row.discord_user_id);
        }
      }

      const now = new Date();
      await client.query(
        `UPDATE connected_guild
         SET sync_status = 'fresh',
             last_fresh_at = $2,
             last_sync_at = $2,
             last_sync_error = NULL,
             updated_at = $2
         WHERE discord_guild_id = $1`,
        [command.discordGuildId, now],
      );

      const revokedUserIds = await this.usersWhoLostEntitlement(client, candidatesBefore);
      return { applied: true, duplicate: false, revokedUserIds };
    });
  }

  public async activateGuild(command: ActivateGuildCommand): Promise<{
    readonly guild: ConnectedGuildState;
    readonly revokedUserIds: readonly string[];
  }> {
    return withTransaction(this.pool, async (client) => {
      await this.requireGuild(client, command.discordGuildId);
      const candidatesBefore = await this.collectEntitledUserIds(client, command.discordGuildId);

      const result = await client.query<GuildRow>(
        `UPDATE connected_guild
         SET status = 'active',
             login_entitling = $2,
             updated_at = now()
         WHERE discord_guild_id = $1
         RETURNING discord_guild_id, status, login_entitling, sync_status, last_fresh_at`,
        [command.discordGuildId, command.loginEntitling],
      );
      const row = result.rows[0];
      if (row === undefined) {
        throw new AuthorizationError('NOT_FOUND', 'Guild not found');
      }

      const revokedUserIds = await this.usersWhoLostEntitlement(client, candidatesBefore);
      return { guild: mapGuild(row), revokedUserIds };
    });
  }

  public async createGrant(command: CreateGrantCommand): Promise<{ readonly id: string }> {
    if (
      (command.permissionId === undefined && command.groupId === undefined) ||
      (command.permissionId !== undefined && command.groupId !== undefined)
    ) {
      throw new AuthorizationError(
        'VALIDATION_FAILED',
        'Exactly one of permissionId or groupId is required',
      );
    }
    if (command.discordUserId === undefined && command.v2UserId === undefined) {
      throw new AuthorizationError(
        'VALIDATION_FAILED',
        'At least one of discordUserId or v2UserId is required',
      );
    }
    if (command.scopeType === 'guild' && command.scopeGuildId === undefined) {
      throw new AuthorizationError('VALIDATION_FAILED', 'scopeGuildId is required for guild scope');
    }
    if (command.scopeType === 'organization' && command.scopeGuildId !== undefined) {
      throw new AuthorizationError(
        'VALIDATION_FAILED',
        'scopeGuildId must be omitted for organization scope',
      );
    }

    const id = randomUUID();
    try {
      await this.pool.query(
        `INSERT INTO access_grant (
           id, effect, permission_id, group_id, discord_user_id, v2_user_id,
           scope_type, scope_guild_id, specificity, reason, created_by, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id,
          command.effect,
          command.permissionId ?? null,
          command.groupId ?? null,
          command.discordUserId ?? null,
          command.v2UserId ?? null,
          command.scopeType,
          command.scopeGuildId ?? null,
          command.specificity,
          command.reason ?? null,
          command.createdBy ?? null,
          command.expiresAt ?? null,
        ],
      );
      return { id };
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new AuthorizationError(
          'VALIDATION_FAILED',
          'Unknown permission, group, or guild reference',
        );
      }
      throw error;
    }
  }

  public async createBlock(command: CreateBlockCommand): Promise<{ readonly id: string }> {
    if (command.discordUserId === undefined && command.v2UserId === undefined) {
      throw new AuthorizationError(
        'VALIDATION_FAILED',
        'At least one of discordUserId or v2UserId is required',
      );
    }
    if (command.scopeType === 'guild' && command.scopeGuildId === undefined) {
      throw new AuthorizationError('VALIDATION_FAILED', 'scopeGuildId is required for guild scope');
    }
    if (command.scopeType === 'global' && command.scopeGuildId !== undefined) {
      throw new AuthorizationError(
        'VALIDATION_FAILED',
        'scopeGuildId must be omitted for global scope',
      );
    }

    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO access_block (
         id, discord_user_id, v2_user_id, scope_type, scope_guild_id, reason, created_by, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        command.discordUserId ?? null,
        command.v2UserId ?? null,
        command.scopeType,
        command.scopeGuildId ?? null,
        command.reason,
        command.createdBy ?? null,
        command.expiresAt ?? null,
      ],
    );
    return { id };
  }

  private async requireOrganizationId(): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM organization ORDER BY created_at ASC LIMIT 1',
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new AuthorizationError('CONFIG_INVALID', 'Organization is not seeded');
    }
    return row.id;
  }

  private async requireGuild(client: PoolClient, guildId: string): Promise<void> {
    const result = await client.query(
      'SELECT 1 FROM connected_guild WHERE discord_guild_id = $1',
      [guildId],
    );
    if (result.rowCount === 0) {
      throw new AuthorizationError('NOT_FOUND', 'Guild is not registered');
    }
  }

  private async upsertMember(
    client: PoolClient,
    guildId: string,
    member: MemberSnapshot,
  ): Promise<void> {
    await client.query(
      `INSERT INTO discord_membership (
         discord_guild_id, discord_user_id, v2_user_id, status, last_synced_at, source
       ) VALUES ($1, $2, $3, $4, now(), 'gateway')
       ON CONFLICT (discord_guild_id, discord_user_id) DO UPDATE
         SET v2_user_id = COALESCE(EXCLUDED.v2_user_id, discord_membership.v2_user_id),
             status = EXCLUDED.status,
             last_synced_at = now(),
             updated_at = now()`,
      [guildId, member.discordUserId, member.v2UserId ?? null, member.status],
    );

    await client.query(
      `DELETE FROM discord_member_role
       WHERE discord_guild_id = $1 AND discord_user_id = $2`,
      [guildId, member.discordUserId],
    );

    for (const roleId of member.roleIds) {
      await client.query(
        `INSERT INTO discord_member_role (discord_guild_id, discord_user_id, discord_role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [guildId, member.discordUserId, roleId],
      );
    }
  }

  private async deactivateMember(
    client: PoolClient,
    guildId: string,
    discordUserId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE discord_membership
       SET status = 'inactive', last_synced_at = now(), updated_at = now()
       WHERE discord_guild_id = $1 AND discord_user_id = $2`,
      [guildId, discordUserId],
    );
    await client.query(
      `DELETE FROM discord_member_role
       WHERE discord_guild_id = $1 AND discord_user_id = $2`,
      [guildId, discordUserId],
    );
  }

  private async replaceRoles(
    client: PoolClient,
    guildId: string,
    roles: readonly RoleSnapshot[],
  ): Promise<void> {
    const keep = new Set(roles.map((role) => role.discordRoleId));
    for (const role of roles) {
      await client.query(
        `INSERT INTO discord_role_snapshot (discord_guild_id, discord_role_id, name_cache, deleted_at, updated_at)
         VALUES ($1, $2, $3, NULL, now())
         ON CONFLICT (discord_guild_id, discord_role_id) DO UPDATE
           SET name_cache = EXCLUDED.name_cache,
               deleted_at = NULL,
               updated_at = now()`,
        [guildId, role.discordRoleId, role.nameCache ?? null],
      );
    }

    const existing = await client.query<{ discord_role_id: string }>(
      `SELECT discord_role_id FROM discord_role_snapshot
       WHERE discord_guild_id = $1 AND deleted_at IS NULL`,
      [guildId],
    );
    for (const row of existing.rows) {
      if (!keep.has(row.discord_role_id)) {
        await client.query(
          `UPDATE discord_role_snapshot
           SET deleted_at = now(), updated_at = now()
           WHERE discord_guild_id = $1 AND discord_role_id = $2`,
          [guildId, row.discord_role_id],
        );
      }
    }
  }

  private async collectEntitledUserIds(
    client: PoolClient,
    guildId?: string,
  ): Promise<ReadonlySet<string>> {
    const params: string[] = [];
    let guildFilter = '';
    if (guildId !== undefined) {
      params.push(guildId);
      guildFilter = `AND m.discord_guild_id = $${params.length}`;
    }

    const result = await client.query<{ v2_user_id: string }>(
      `SELECT DISTINCT m.v2_user_id
       FROM discord_membership m
       INNER JOIN connected_guild g ON g.discord_guild_id = m.discord_guild_id
       WHERE m.status = 'active'
         AND m.v2_user_id IS NOT NULL
         AND g.status = 'active'
         AND g.login_entitling = TRUE
         ${guildFilter}`,
      params,
    );
    return new Set(result.rows.map((row) => row.v2_user_id));
  }

  private async usersWhoLostEntitlement(
    client: PoolClient,
    previouslyEntitled: ReadonlySet<string>,
  ): Promise<readonly string[]> {
    if (previouslyEntitled.size === 0) {
      return [];
    }
    const stillEntitled = await this.collectEntitledUserIds(client);
    const lost: string[] = [];
    for (const userId of previouslyEntitled) {
      if (!stillEntitled.has(userId)) {
        lost.push(userId);
      }
    }
    return lost;
  }

  private async loadAuthorizeContext(subject: DecisionSubject): Promise<{
    readonly context: AuthorizeContext;
    readonly groupPermissionIdsForGrants: ReadonlyMap<string, readonly string[]>;
  }> {
    const orgResult = await this.pool.query<OrganizationRow>(
      `SELECT id, owner_discord_user_id, owner_v2_user_id, bootstrap_completed_at
       FROM organization ORDER BY created_at ASC LIMIT 1`,
    );
    const org = orgResult.rows[0];

    let owner: OrganizationOwner | undefined;
    if (
      org !== undefined &&
      org.bootstrap_completed_at !== null &&
      org.owner_discord_user_id !== null
    ) {
      owner = {
        ownerDiscordUserId: org.owner_discord_user_id,
        ...(org.owner_v2_user_id !== null ? { ownerV2UserId: org.owner_v2_user_id } : {}),
        bootstrapCompletedAt: org.bootstrap_completed_at,
      };
    }

    const subjectFilters: string[] = [];
    const subjectParams: string[] = [];
    if (subject.v2UserId !== undefined) {
      subjectParams.push(subject.v2UserId);
      subjectFilters.push(`v2_user_id = $${subjectParams.length}`);
    }
    if (subject.discordUserId !== undefined) {
      subjectParams.push(subject.discordUserId);
      subjectFilters.push(`discord_user_id = $${subjectParams.length}`);
    }

    const subjectClause =
      subjectFilters.length === 0 ? 'FALSE' : `(${subjectFilters.join(' OR ')})`;

    const blocksResult = await this.pool.query<{
      id: string;
      scope_type: 'global' | 'guild';
      scope_guild_id: string | null;
      reason: string;
      expires_at: Date | null;
    }>(
      `SELECT id, scope_type, scope_guild_id, reason, expires_at
       FROM access_block
       WHERE ${subjectClause}`,
      subjectParams,
    );

    const blocks: AccessBlockRecord[] = blocksResult.rows.map((row) => ({
      id: row.id,
      scopeType: row.scope_type,
      reason: row.reason,
      ...(row.scope_guild_id !== null ? { scopeGuildId: row.scope_guild_id } : {}),
      ...(row.expires_at !== null ? { expiresAt: row.expires_at } : {}),
    }));

    const grantsResult = await this.pool.query<{
      id: string;
      effect: 'allow' | 'deny';
      permission_id: string | null;
      group_id: string | null;
      scope_type: 'organization' | 'guild';
      scope_guild_id: string | null;
      specificity: AccessGrantRecord['specificity'];
      expires_at: Date | null;
      reason: string | null;
      created_by: string | null;
    }>(
      `SELECT id, effect, permission_id, group_id, scope_type, scope_guild_id, specificity, expires_at, reason, created_by
       FROM access_grant
       WHERE ${subjectClause}`,
      subjectParams,
    );

    const grants: AccessGrantRecord[] = grantsResult.rows.map((row) => ({
      id: row.id,
      effect: row.effect,
      scopeType: row.scope_type,
      specificity: row.specificity,
      source: row.created_by ?? row.reason ?? 'access_grant',
      ...(row.permission_id !== null ? { permissionId: row.permission_id } : {}),
      ...(row.group_id !== null ? { groupId: row.group_id } : {}),
      ...(row.scope_guild_id !== null ? { scopeGuildId: row.scope_guild_id } : {}),
      ...(row.expires_at !== null ? { expiresAt: row.expires_at } : {}),
    }));

    const membershipParams: string[] = [];
    const membershipFilters: string[] = [];
    if (subject.v2UserId !== undefined) {
      membershipParams.push(subject.v2UserId);
      membershipFilters.push(`m.v2_user_id = $${membershipParams.length}`);
    }
    if (subject.discordUserId !== undefined) {
      membershipParams.push(subject.discordUserId);
      membershipFilters.push(`m.discord_user_id = $${membershipParams.length}`);
    }
    const membershipClause =
      membershipFilters.length === 0 ? 'FALSE' : `(${membershipFilters.join(' OR ')})`;

    const membershipRows = await this.pool.query<{
      discord_guild_id: string;
      discord_user_id: string;
      v2_user_id: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT m.discord_guild_id, m.discord_user_id, m.v2_user_id, m.status
       FROM discord_membership m
       WHERE ${membershipClause}`,
      membershipParams,
    );

    const roleRows = await this.pool.query<{
      discord_guild_id: string;
      discord_user_id: string;
      discord_role_id: string;
    }>(
      `SELECT mr.discord_guild_id, mr.discord_user_id, mr.discord_role_id
       FROM discord_member_role mr
       INNER JOIN discord_membership m
         ON m.discord_guild_id = mr.discord_guild_id
        AND m.discord_user_id = mr.discord_user_id
       WHERE ${membershipClause}`,
      membershipParams,
    );

    const rolesByMember = new Map<string, string[]>();
    for (const row of roleRows.rows) {
      const key = `${row.discord_guild_id}:${row.discord_user_id}`;
      const list = rolesByMember.get(key) ?? [];
      list.push(row.discord_role_id);
      rolesByMember.set(key, list);
    }

    const memberships: MembershipState[] = membershipRows.rows.map((row) => ({
      discordGuildId: row.discord_guild_id,
      discordUserId: row.discord_user_id,
      ...(row.v2_user_id !== null ? { v2UserId: row.v2_user_id } : {}),
      status: row.status,
      roleIds: rolesByMember.get(`${row.discord_guild_id}:${row.discord_user_id}`) ?? [],
    }));

    const guildsResult = await this.pool.query<GuildRow>(
      `SELECT discord_guild_id, status, login_entitling, sync_status, last_fresh_at
       FROM connected_guild`,
    );
    const guilds = guildsResult.rows.map(mapGuild);

    const mappedResult = await this.pool.query<{
      mapping_id: string;
      discord_guild_id: string;
      permission_id: string;
      source: string;
    }>(
      `SELECT drm.id AS mapping_id,
              drm.discord_guild_id,
              COALESCE(drm.permission_id, gp.permission_id) AS permission_id,
              'discord_role_mapping' AS source
       FROM discord_membership m
       INNER JOIN discord_member_role mr
         ON mr.discord_guild_id = m.discord_guild_id
        AND mr.discord_user_id = m.discord_user_id
       INNER JOIN discord_role_mapping drm
         ON drm.discord_guild_id = mr.discord_guild_id
        AND drm.discord_role_id = mr.discord_role_id
       LEFT JOIN group_permission gp ON gp.group_id = drm.group_id
       WHERE m.status = 'active'
         AND ${membershipClause}
         AND COALESCE(drm.permission_id, gp.permission_id) IS NOT NULL`,
      membershipParams,
    );

    const mappedPermissions: MappedPermissionGrant[] = mappedResult.rows.map((row) => ({
      mappingId: row.mapping_id,
      guildId: row.discord_guild_id,
      permissionId: row.permission_id,
      source: row.source,
    }));

    let identityLinked = false;
    if (subject.v2UserId !== undefined || subject.discordUserId !== undefined) {
      const linkParams: string[] = [];
      const linkFilters: string[] = [];
      if (subject.v2UserId !== undefined) {
        linkParams.push(subject.v2UserId);
        linkFilters.push(`v2_user_id = $${linkParams.length}`);
      }
      if (subject.discordUserId !== undefined) {
        linkParams.push(subject.discordUserId);
        linkFilters.push(`discord_user_id = $${linkParams.length}`);
      }
      const link = await this.pool.query(
        `SELECT 1 FROM discord_identity_link WHERE ${linkFilters.join(' OR ')} LIMIT 1`,
        linkParams,
      );
      identityLinked = (link.rowCount ?? 0) > 0;
    }

    const groupPermsResult = await this.pool.query<{
      group_id: string;
      permission_id: string;
    }>('SELECT group_id, permission_id FROM group_permission');
    const groupPermissionIdsForGrants = new Map<string, string[]>();
    for (const row of groupPermsResult.rows) {
      const list = groupPermissionIdsForGrants.get(row.group_id) ?? [];
      list.push(row.permission_id);
      groupPermissionIdsForGrants.set(row.group_id, list);
    }

    return {
      context: {
        ...(owner !== undefined ? { owner } : {}),
        blocks,
        grants,
        mappedPermissions,
        memberships,
        guilds,
        identityLinked,
      },
      groupPermissionIdsForGrants,
    };
  }
}
