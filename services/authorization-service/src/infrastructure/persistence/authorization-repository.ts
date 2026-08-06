import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import {
  computeGrantSpecificity,
  type ActivateGuildCommand,
  type ApplyDiscordEventCommand,
  type ApplyDiscordEventResult,
  type AuthorizeCommand,
  type BootstrapOwnerCommand,
  type BootstrapOwnerResult,
  type CreateBlockCommand,
  type CreateGrantCommand,
  type EnsureOrganizationResult,
  type IdentityLinkResult,
  type MemberSnapshot,
  type PendingSessionRevokeRecord,
  type PolicyMutationResult,
  type ReconcileGuildCommand,
  type RegisterGuildCommand,
  type RoleSnapshot,
  type SetGuildLoginEntitlingCommand,
  type UpsertIdentityLinkCommand,
} from '../../application/ports/authorization.ports.js';
import {
  decideAuthorization,
  type AccessBlockRecord,
  type AccessGrantRecord,
  type AuthorizationExplanation,
  type AuthorizationScope,
  type AuthorizeContext,
  type ConnectedGuildState,
  type DecisionSubject,
  type MappedPermissionGrant,
  type MembershipState,
  type OperationClass,
  type OrganizationOwner,
  type SyncStatus,
} from '../../domain/decision-engine.js';
import { AuthorizationError } from '../../domain/errors.js';

interface OrganizationRow {
  readonly id: string;
  readonly owner_discord_user_id: string | null;
  readonly owner_v2_user_id: string | null;
  readonly bootstrap_completed_at: Date | null;
  readonly bootstrap_source_discord_user_id_snapshot: string | null;
}

interface GuildRow {
  readonly discord_guild_id: string;
  readonly status: ConnectedGuildState['status'];
  readonly login_entitling: boolean;
  readonly sync_status: SyncStatus;
  readonly last_fresh_at: Date | null;
}

interface AuditEntry {
  readonly action: string;
  readonly actor?: string | null;
  readonly actorClientId?: string | null;
  readonly subjectV2UserId?: string | null;
  readonly subjectDiscordUserId?: string | null;
  readonly discordGuildId?: string | null;
  readonly correlationId?: string | null;
  readonly details?: Record<string, unknown>;
}

const REVOKE_REASON_ENTITLEMENT_LOST = 'login_entitlement_lost';

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

async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

function actorLabel(actor: DecisionSubject): string | null {
  return actor.v2UserId ?? actor.discordUserId ?? null;
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
        `SELECT id, owner_discord_user_id, owner_v2_user_id, bootstrap_completed_at,
                bootstrap_source_discord_user_id_snapshot
         FROM organization ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      );
      const org = orgResult.rows[0];
      if (org === undefined) {
        throw new AuthorizationError('CONFIG_INVALID', 'Organization is not seeded');
      }

      const alreadyBootstrapped =
        org.bootstrap_completed_at !== null && org.owner_discord_user_id !== null;

      if (alreadyBootstrapped) {
        return this.completeAlreadyBootstrapped(client, org, command);
      }

      // First bootstrap: the incoming Discord user must exactly match the env
      // seed. A missing seed means no one is authorized to become owner.
      if (
        command.requiredBootstrapDiscordUserId === undefined ||
        command.discordUserId !== command.requiredBootstrapDiscordUserId
      ) {
        throw new AuthorizationError(
          'FORBIDDEN',
          'Bootstrap Discord user does not match the required env seed',
        );
      }

      // The owner must already have a verified Discord ↔ V2 identity link.
      const link = await client.query<{ v2_user_id: string }>(
        'SELECT v2_user_id FROM discord_identity_link WHERE discord_user_id = $1',
        [command.discordUserId],
      );
      const linkRow = link.rows[0];
      if (linkRow === undefined) {
        throw new AuthorizationError(
          'FORBIDDEN',
          'Bootstrap requires an existing Discord identity link',
        );
      }
      if (command.v2UserId !== undefined && command.v2UserId !== linkRow.v2_user_id) {
        throw new AuthorizationError(
          'CONFLICT',
          'Provided V2 user does not match the linked Discord identity',
        );
      }

      const ownerV2 = command.v2UserId ?? linkRow.v2_user_id;
      const completedAt = new Date();
      await client.query(
        `UPDATE organization
         SET owner_discord_user_id = $1,
             owner_v2_user_id = $2,
             bootstrap_completed_at = $3,
             bootstrap_source_discord_user_id_snapshot = $1,
             updated_at = now()
         WHERE id = $4`,
        [command.discordUserId, ownerV2, completedAt, org.id],
      );

      await this.writeAudit(client, {
        action: 'bootstrap.owner',
        actor: command.actor ?? 'system',
        actorClientId: command.actorClientId ?? null,
        subjectDiscordUserId: command.discordUserId,
        subjectV2UserId: ownerV2,
        correlationId: command.correlationId ?? null,
        details: { organizationId: org.id },
      });

      return {
        organizationId: org.id,
        ownerDiscordUserId: command.discordUserId,
        ownerV2UserId: ownerV2,
        bootstrapCompletedAt: toIso(completedAt),
        alreadyCompleted: false,
      };
    });
  }

  private async completeAlreadyBootstrapped(
    client: PoolClient,
    org: OrganizationRow,
    command: BootstrapOwnerCommand,
  ): Promise<BootstrapOwnerResult> {
    const ownerDiscord = org.owner_discord_user_id!;
    const snapshot = org.bootstrap_source_discord_user_id_snapshot;
    const envSeed = command.requiredBootstrapDiscordUserId;

    // A changed env seed must never transfer ownership. Record the ignore and
    // return the persisted owner idempotently.
    const envDiffers = envSeed !== undefined && envSeed !== snapshot;
    const commandTargetsDifferentOwner = command.discordUserId !== ownerDiscord;

    if (envDiffers || commandTargetsDifferentOwner) {
      await this.writeAudit(client, {
        action: 'bootstrap.env_ignored',
        actor: command.actor ?? 'system',
        actorClientId: command.actorClientId ?? null,
        subjectDiscordUserId: ownerDiscord,
        subjectV2UserId: org.owner_v2_user_id,
        correlationId: command.correlationId ?? null,
        details: {
          organizationId: org.id,
          persistedOwnerDiscordUserId: ownerDiscord,
          bootstrapSourceSnapshot: snapshot,
          requestedDiscordUserId: command.discordUserId,
          envSeedDiscordUserId: envSeed ?? null,
        },
      });

      return {
        organizationId: org.id,
        ownerDiscordUserId: ownerDiscord,
        ...(org.owner_v2_user_id !== null ? { ownerV2UserId: org.owner_v2_user_id } : {}),
        bootstrapCompletedAt: toIso(org.bootstrap_completed_at!),
        alreadyCompleted: true,
      };
    }

    // Same owner: allow a one-time backfill of the V2 id, reject conflicting V2.
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
      ownerDiscordUserId: ownerDiscord,
      ...(ownerV2 !== null ? { ownerV2UserId: ownerV2 } : {}),
      bootstrapCompletedAt: toIso(org.bootstrap_completed_at!),
      alreadyCompleted: true,
    };
  }

  public async upsertIdentityLink(command: UpsertIdentityLinkCommand): Promise<IdentityLinkResult> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const existing = await client.query<{
          discord_user_id: string;
          v2_user_id: string;
          linked_at: Date;
        }>(
          `SELECT discord_user_id, v2_user_id, linked_at
           FROM discord_identity_link
           WHERE discord_user_id = $1
           FOR UPDATE`,
          [command.discordUserId],
        );

        const existingRow = existing.rows[0];
        if (existingRow !== undefined) {
          if (existingRow.v2_user_id !== command.v2UserId) {
            // Links are immutable 1:1 — never rebind a Discord user to a new V2 id.
            throw new AuthorizationError(
              'CONFLICT',
              'Discord user is already linked to a different V2 identity',
            );
          }

          // Idempotent re-link: ensure memberships carry the V2 id.
          await client.query(
            `UPDATE discord_membership
             SET v2_user_id = $1, updated_at = now()
             WHERE discord_user_id = $2`,
            [command.v2UserId, command.discordUserId],
          );

          return {
            discordUserId: existingRow.discord_user_id,
            v2UserId: existingRow.v2_user_id,
            linkedAt: toIso(existingRow.linked_at),
            created: false,
          };
        }

        // Insert a brand-new link. A unique violation on v2_user_id means the
        // V2 identity is already bound to a different Discord user.
        const inserted = await client.query<{
          discord_user_id: string;
          v2_user_id: string;
          linked_at: Date;
        }>(
          `INSERT INTO discord_identity_link (discord_user_id, v2_user_id)
           VALUES ($1, $2)
           RETURNING discord_user_id, v2_user_id, linked_at`,
          [command.discordUserId, command.v2UserId],
        );
        const row = inserted.rows[0];
        if (row === undefined) {
          throw new AuthorizationError('CONFIG_INVALID', 'Identity link insert failed');
        }

        await client.query(
          `UPDATE discord_membership
           SET v2_user_id = $1, updated_at = now()
           WHERE discord_user_id = $2`,
          [command.v2UserId, command.discordUserId],
        );

        await this.writeAudit(client, {
          action: 'identity.link',
          actorClientId: command.actorClientId ?? null,
          subjectDiscordUserId: command.discordUserId,
          subjectV2UserId: command.v2UserId,
          correlationId: command.correlationId ?? null,
          details: {},
        });

        return {
          discordUserId: row.discord_user_id,
          v2UserId: row.v2_user_id,
          linkedAt: toIso(row.linked_at),
          created: true,
        };
      });
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

  public async authorize(command: AuthorizeCommand): Promise<AuthorizationExplanation> {
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
      return await withTransaction(this.pool, async (client) => {
        // A freshly registered guild is always inert: pending_sync, no login
        // entitlement, and unavailable until a reconcile marks it fresh. Any
        // client-provided entitlement flag is ignored.
        const result = await client.query<GuildRow>(
          `INSERT INTO connected_guild (
             discord_guild_id, organization_id, status, login_entitling, sync_status
           ) VALUES ($1, $2, 'pending_sync', FALSE, 'unavailable')
           ON CONFLICT (discord_guild_id) DO UPDATE
             SET updated_at = now()
           RETURNING discord_guild_id, status, login_entitling, sync_status, last_fresh_at`,
          [command.discordGuildId, org],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new AuthorizationError('CONFIG_INVALID', 'Guild register failed');
        }

        await this.writeAudit(client, {
          action: 'guild.register',
          actorClientId: command.actorClientId ?? null,
          discordGuildId: command.discordGuildId,
          correlationId: command.correlationId ?? null,
          details: {},
        });

        return mapGuild(row);
      });
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
          await this.deactivateMember(
            client,
            command.discordGuildId,
            command.payload.discordUserId,
          );
          break;
        case 'roles_snapshot':
          await this.replaceRoles(client, command.discordGuildId, command.payload.roles);
          break;
        case 'guild_unavailable':
          // Transient outage: only downgrade freshness. Status and login
          // entitlement are preserved so recovery does not require re-activation.
          await client.query(
            `UPDATE connected_guild
             SET sync_status = 'unavailable', updated_at = now()
             WHERE discord_guild_id = $1`,
            [command.discordGuildId],
          );
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
      await this.enqueuePendingRevokes(
        client,
        revokedUserIds,
        REVOKE_REASON_ENTITLEMENT_LOST,
        command.eventKey,
      );

      await this.writeAudit(client, {
        action: 'discord.event',
        actorClientId: command.actorClientId ?? null,
        discordGuildId: command.discordGuildId,
        correlationId: command.correlationId ?? null,
        details: {
          eventKey: command.eventKey,
          eventType: command.eventType,
          kind: command.payload.kind,
          revokedUserIds,
        },
      });

      return { applied: true, duplicate: false, revokedUserIds };
    });
  }

  public async reconcileGuild(command: ReconcileGuildCommand): Promise<ApplyDiscordEventResult> {
    // A deterministic key derived from the snapshot content keeps reconciles
    // idempotent. randomUUID would defeat de-duplication entirely.
    const eventKey =
      command.eventKey ??
      this.reconcileEventKey(command.discordGuildId, command.members, command.roles);

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
      await this.enqueuePendingRevokes(
        client,
        revokedUserIds,
        REVOKE_REASON_ENTITLEMENT_LOST,
        eventKey,
      );

      await this.writeAudit(client, {
        action: 'discord.reconcile',
        actorClientId: command.actorClientId ?? null,
        discordGuildId: command.discordGuildId,
        correlationId: command.correlationId ?? null,
        details: { eventKey, revokedUserIds },
      });

      return { applied: true, duplicate: false, revokedUserIds };
    });
  }

  public async activateGuild(command: ActivateGuildCommand): Promise<{
    readonly guild: ConnectedGuildState;
    readonly revokedUserIds: readonly string[];
  }> {
    await this.requireActorCan(
      command.actor,
      'permission.authorization.policy.manage.org',
      { type: 'organization' },
      'sensitive',
    );

    return withTransaction(this.pool, async (client) => {
      const current = await client.query<GuildRow>(
        `SELECT discord_guild_id, status, login_entitling, sync_status, last_fresh_at
         FROM connected_guild
         WHERE discord_guild_id = $1
         FOR UPDATE`,
        [command.discordGuildId],
      );
      const currentRow = current.rows[0];
      if (currentRow === undefined) {
        throw new AuthorizationError('NOT_FOUND', 'Guild is not registered');
      }
      if (
        currentRow.sync_status !== 'fresh' ||
        (currentRow.status !== 'pending_sync' && currentRow.status !== 'active')
      ) {
        throw new AuthorizationError(
          'VALIDATION_FAILED',
          'Guild must be freshly synced and pending or active to activate',
        );
      }

      const candidatesBefore = await this.collectEntitledUserIds(client, command.discordGuildId);

      // Activation only flips lifecycle status; login entitlement is managed
      // separately so activating never grants login access implicitly.
      const result = await client.query<GuildRow>(
        `UPDATE connected_guild
         SET status = 'active', updated_at = now()
         WHERE discord_guild_id = $1
         RETURNING discord_guild_id, status, login_entitling, sync_status, last_fresh_at`,
        [command.discordGuildId],
      );
      const row = result.rows[0]!;

      const revokedUserIds = await this.usersWhoLostEntitlement(client, candidatesBefore);
      await this.enqueuePendingRevokes(
        client,
        revokedUserIds,
        REVOKE_REASON_ENTITLEMENT_LOST,
        `guild_activate:${command.discordGuildId}`,
      );

      await this.writeAudit(client, {
        action: 'guild.activate',
        actor: actorLabel(command.actor),
        actorClientId: command.actorClientId ?? null,
        discordGuildId: command.discordGuildId,
        correlationId: command.correlationId ?? null,
        details: { revokedUserIds },
      });

      return { guild: mapGuild(row), revokedUserIds };
    });
  }

  public async setGuildLoginEntitling(command: SetGuildLoginEntitlingCommand): Promise<{
    readonly guild: ConnectedGuildState;
    readonly revokedUserIds: readonly string[];
  }> {
    await this.requireActorCan(
      command.actor,
      'permission.authorization.policy.manage.org',
      { type: 'organization' },
      'sensitive',
    );

    return withTransaction(this.pool, async (client) => {
      const current = await client.query<GuildRow>(
        `SELECT discord_guild_id, status, login_entitling, sync_status, last_fresh_at
         FROM connected_guild
         WHERE discord_guild_id = $1
         FOR UPDATE`,
        [command.discordGuildId],
      );
      const currentRow = current.rows[0];
      if (currentRow === undefined) {
        throw new AuthorizationError('NOT_FOUND', 'Guild is not registered');
      }
      if (currentRow.status !== 'active' || currentRow.sync_status !== 'fresh') {
        throw new AuthorizationError(
          'VALIDATION_FAILED',
          'Guild must be active and freshly synced to change login entitlement',
        );
      }

      const candidatesBefore = await this.collectEntitledUserIds(client, command.discordGuildId);

      const result = await client.query<GuildRow>(
        `UPDATE connected_guild
         SET login_entitling = $2, updated_at = now()
         WHERE discord_guild_id = $1
         RETURNING discord_guild_id, status, login_entitling, sync_status, last_fresh_at`,
        [command.discordGuildId, command.loginEntitling],
      );
      const row = result.rows[0]!;

      const revokedUserIds = await this.usersWhoLostEntitlement(client, candidatesBefore);
      await this.enqueuePendingRevokes(
        client,
        revokedUserIds,
        REVOKE_REASON_ENTITLEMENT_LOST,
        `guild_login_entitling:${command.discordGuildId}`,
      );

      await this.writeAudit(client, {
        action: 'guild.login_entitling',
        actor: actorLabel(command.actor),
        actorClientId: command.actorClientId ?? null,
        discordGuildId: command.discordGuildId,
        correlationId: command.correlationId ?? null,
        details: { loginEntitling: command.loginEntitling, revokedUserIds },
      });

      return { guild: mapGuild(row), revokedUserIds };
    });
  }

  public async createGrant(command: CreateGrantCommand): Promise<PolicyMutationResult> {
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

    await this.requireActorCanManageScope(command.actor, command.scopeType, command.scopeGuildId);

    // Specificity is derived from subject + scope, never trusted from callers.
    const specificity = computeGrantSpecificity({
      ...(command.discordUserId !== undefined ? { discordUserId: command.discordUserId } : {}),
      ...(command.v2UserId !== undefined ? { v2UserId: command.v2UserId } : {}),
      scopeType: command.scopeType,
    });
    const createdBy = actorLabel(command.actor);

    const id = randomUUID();
    try {
      return await withTransaction(this.pool, async (client) => {
        await client.query(
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
            specificity,
            command.reason ?? null,
            createdBy,
            command.expiresAt ?? null,
          ],
        );

        // A new deny can strip login access from the target — revoke sessions.
        const revokedUserIds =
          command.effect === 'deny'
            ? await this.enqueueRevokesForTarget(
                client,
                command.v2UserId,
                command.discordUserId,
                `grant:${id}`,
              )
            : [];

        await this.writeAudit(client, {
          action: 'grant.create',
          actor: createdBy,
          actorClientId: command.actorClientId ?? null,
          subjectDiscordUserId: command.discordUserId ?? null,
          subjectV2UserId: command.v2UserId ?? null,
          correlationId: command.correlationId ?? null,
          details: {
            grantId: id,
            effect: command.effect,
            scopeType: command.scopeType,
            revokedUserIds,
          },
        });

        return { id, revokedUserIds };
      });
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

  public async createBlock(command: CreateBlockCommand): Promise<PolicyMutationResult> {
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

    await this.requireActorCanManageScope(
      command.actor,
      command.scopeType === 'global' ? 'organization' : 'guild',
      command.scopeGuildId,
    );

    const createdBy = actorLabel(command.actor);
    const id = randomUUID();
    return withTransaction(this.pool, async (client) => {
      await client.query(
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
          createdBy,
          command.expiresAt ?? null,
        ],
      );

      // Any block can strip login access from the target — revoke sessions.
      const revokedUserIds = await this.enqueueRevokesForTarget(
        client,
        command.v2UserId,
        command.discordUserId,
        `block:${id}`,
      );

      await this.writeAudit(client, {
        action: 'block.create',
        actor: createdBy,
        actorClientId: command.actorClientId ?? null,
        subjectDiscordUserId: command.discordUserId ?? null,
        subjectV2UserId: command.v2UserId ?? null,
        correlationId: command.correlationId ?? null,
        details: { blockId: id, scopeType: command.scopeType, revokedUserIds },
      });

      return { id, revokedUserIds };
    });
  }

  public async listPendingSessionRevokes(
    limit = 100,
  ): Promise<readonly PendingSessionRevokeRecord[]> {
    const result = await this.pool.query<{
      id: string;
      v2_user_id: string;
      correlation_id: string;
      reason: string;
      attempts: number;
    }>(
      `SELECT id, v2_user_id, correlation_id, reason, attempts
       FROM pending_session_revoke
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      v2UserId: row.v2_user_id,
      correlationId: row.correlation_id,
      reason: row.reason,
      attempts: row.attempts,
    }));
  }

  public async markSessionRevokeDelivered(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE pending_session_revoke
       SET status = 'delivered', delivered_at = now(), updated_at = now()
       WHERE id = $1`,
      [id],
    );
  }

  public async markSessionRevokeAttemptFailed(id: string, errorMessage: string): Promise<void> {
    // Keep the row pending so a later drain retries; record the attempt count
    // and the last error for observability.
    await this.pool.query(
      `UPDATE pending_session_revoke
       SET attempts = attempts + 1, last_error = $2, updated_at = now()
       WHERE id = $1`,
      [id, errorMessage],
    );
  }

  public async processExpiredPolicies(
    now?: Date,
  ): Promise<{ readonly revokedUserIds: readonly string[] }> {
    const cutoff = now ?? new Date();
    return withTransaction(this.pool, async (client) => {
      const revoked = new Set<string>();

      const expiredGrants = await client.query<{
        id: string;
        v2_user_id: string | null;
        discord_user_id: string | null;
      }>(
        `SELECT id, v2_user_id, discord_user_id
         FROM access_grant
         WHERE expires_at IS NOT NULL AND expires_at <= $1`,
        [cutoff],
      );
      const expiredBlocks = await client.query<{
        id: string;
        v2_user_id: string | null;
        discord_user_id: string | null;
      }>(
        `SELECT id, v2_user_id, discord_user_id
         FROM access_block
         WHERE expires_at IS NOT NULL AND expires_at <= $1`,
        [cutoff],
      );

      for (const row of [...expiredGrants.rows, ...expiredBlocks.rows]) {
        const v2 = await this.resolveV2ForSubject(client, row.v2_user_id, row.discord_user_id);
        if (v2 === undefined) {
          continue;
        }
        const correlationId = `expire:${row.id}:${v2}`;
        const inserted = await client.query(
          `INSERT INTO pending_session_revoke (
             id, v2_user_id, correlation_id, reason, status, source_event_key
           ) VALUES ($1, $2, $3, 'policy_expired', 'pending', $4)
           ON CONFLICT (correlation_id) DO NOTHING
           RETURNING id`,
          [randomUUID(), v2, correlationId, `expire:${row.id}`],
        );
        if ((inserted.rowCount ?? 0) > 0) {
          revoked.add(v2);
        }
      }

      const revokedUserIds = [...revoked];
      if (revokedUserIds.length > 0) {
        await this.writeAudit(client, {
          action: 'policy.expire',
          actor: 'system',
          details: { revokedUserIds },
        });
      }

      return { revokedUserIds };
    });
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

  private async requireActorCanManageScope(
    actor: DecisionSubject,
    scopeType: 'organization' | 'guild',
    scopeGuildId: string | undefined,
  ): Promise<void> {
    if (scopeType === 'guild') {
      if (scopeGuildId === undefined) {
        throw new AuthorizationError(
          'VALIDATION_FAILED',
          'scopeGuildId is required for guild scope',
        );
      }
      await this.requireActorCan(
        actor,
        'permission.authorization.policy.manage.guild',
        { type: 'guild', guildId: scopeGuildId },
        'sensitive',
      );
      return;
    }
    await this.requireActorCan(
      actor,
      'permission.authorization.policy.manage.org',
      { type: 'organization' },
      'sensitive',
    );
  }

  private async requireActorCan(
    actor: DecisionSubject,
    permissionId: string,
    scope: AuthorizationScope,
    operationClass: OperationClass,
  ): Promise<void> {
    if (actor.v2UserId === undefined && actor.discordUserId === undefined) {
      throw new AuthorizationError('FORBIDDEN', 'Actor identity is required');
    }
    const decision = await this.authorize({ subject: actor, permissionId, scope, operationClass });
    if (decision.decision !== 'allow') {
      throw new AuthorizationError('FORBIDDEN', `Actor is not permitted to ${permissionId}`);
    }
  }

  private async requireGuild(client: PoolClient, guildId: string): Promise<void> {
    const result = await client.query('SELECT 1 FROM connected_guild WHERE discord_guild_id = $1', [
      guildId,
    ]);
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
        // Drop member↔role edges for the soft-deleted role so it can never grant
        // mapped permissions again.
        await client.query(
          `DELETE FROM discord_member_role
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

  private async enqueuePendingRevokes(
    client: PoolClient,
    userIds: readonly string[],
    reason: string,
    sourceEventKey?: string,
  ): Promise<void> {
    for (const v2UserId of new Set(userIds)) {
      const correlationId =
        sourceEventKey !== undefined
          ? `${sourceEventKey}:${v2UserId}`
          : `${reason}:${v2UserId}:${randomUUID()}`;
      await client.query(
        `INSERT INTO pending_session_revoke (
           id, v2_user_id, correlation_id, reason, status, source_event_key
         ) VALUES ($1, $2, $3, $4, 'pending', $5)
         ON CONFLICT (correlation_id) DO NOTHING`,
        [randomUUID(), v2UserId, correlationId, reason, sourceEventKey ?? null],
      );
    }
  }

  private async enqueueRevokesForTarget(
    client: PoolClient,
    v2UserId: string | undefined,
    discordUserId: string | undefined,
    sourceEventKey: string,
  ): Promise<readonly string[]> {
    const v2 = await this.resolveV2ForSubject(client, v2UserId ?? null, discordUserId ?? null);
    if (v2 === undefined) {
      return [];
    }
    await this.enqueuePendingRevokes(client, [v2], REVOKE_REASON_ENTITLEMENT_LOST, sourceEventKey);
    return [v2];
  }

  private async resolveV2ForSubject(
    client: PoolClient,
    v2UserId: string | null,
    discordUserId: string | null,
  ): Promise<string | undefined> {
    if (v2UserId !== null) {
      return v2UserId;
    }
    if (discordUserId === null) {
      return undefined;
    }
    const link = await client.query<{ v2_user_id: string }>(
      'SELECT v2_user_id FROM discord_identity_link WHERE discord_user_id = $1',
      [discordUserId],
    );
    return link.rows[0]?.v2_user_id;
  }

  private reconcileEventKey(
    guildId: string,
    members: readonly MemberSnapshot[],
    roles: readonly RoleSnapshot[],
  ): string {
    const canonicalMembers = members
      .map((member) => ({
        discordUserId: member.discordUserId,
        v2UserId: member.v2UserId ?? null,
        roleIds: [...member.roleIds].sort((left, right) => left.localeCompare(right)),
        status: member.status,
      }))
      .sort((left, right) => left.discordUserId.localeCompare(right.discordUserId));
    const canonicalRoles = roles
      .map((role) => ({ discordRoleId: role.discordRoleId, nameCache: role.nameCache ?? null }))
      .sort((left, right) => left.discordRoleId.localeCompare(right.discordRoleId));
    const canonical = JSON.stringify({ members: canonicalMembers, roles: canonicalRoles });
    const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
    return `reconcile:${guildId}:${hash}`;
  }

  private async writeAudit(client: PoolClient, entry: AuditEntry): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (
         id, action, actor, actor_client_id, subject_v2_user_id, subject_discord_user_id,
         discord_guild_id, correlation_id, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        randomUUID(),
        entry.action,
        entry.actor ?? null,
        entry.actorClientId ?? null,
        entry.subjectV2UserId ?? null,
        entry.subjectDiscordUserId ?? null,
        entry.discordGuildId ?? null,
        entry.correlationId ?? null,
        JSON.stringify(entry.details ?? {}),
      ],
    );
  }

  private async loadAuthorizeContext(subject: DecisionSubject): Promise<{
    readonly context: AuthorizeContext;
    readonly groupPermissionIdsForGrants: ReadonlyMap<string, readonly string[]>;
  }> {
    const orgResult = await this.pool.query<OrganizationRow>(
      `SELECT id, owner_discord_user_id, owner_v2_user_id, bootstrap_completed_at,
              bootstrap_source_discord_user_id_snapshot
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

    // Resolve a single, identity-linked principal. Never union grants/blocks of
    // two unrelated identifiers: an attacker could otherwise assert a foreign
    // v2UserId alongside their own discordUserId and inherit foreign policy.
    const resolved = await this.resolvePrincipal(subject);
    const identityLinked = resolved.identityLinked;

    const subjectFilters: string[] = [];
    const subjectParams: string[] = [];
    if (resolved.v2UserId !== undefined) {
      subjectParams.push(resolved.v2UserId);
      subjectFilters.push(`v2_user_id = $${subjectParams.length}`);
    }
    if (resolved.discordUserId !== undefined) {
      subjectParams.push(resolved.discordUserId);
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
    if (resolved.v2UserId !== undefined) {
      membershipParams.push(resolved.v2UserId);
      membershipFilters.push(`m.v2_user_id = $${membershipParams.length}`);
    }
    if (resolved.discordUserId !== undefined) {
      membershipParams.push(resolved.discordUserId);
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
       INNER JOIN discord_role_snapshot rs
         ON rs.discord_guild_id = mr.discord_guild_id
        AND rs.discord_role_id = mr.discord_role_id
        AND rs.deleted_at IS NULL
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
       INNER JOIN discord_role_snapshot rs
         ON rs.discord_guild_id = mr.discord_guild_id
        AND rs.discord_role_id = mr.discord_role_id
        AND rs.deleted_at IS NULL
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

  /**
   * Resolve the querying subject to a single linked person. When both ids are
   * given they must be an exact link pair; when one is given the other is filled
   * from the link if present. `identityLinked` is only true for an exact link.
   */
  private async resolvePrincipal(subject: DecisionSubject): Promise<{
    readonly v2UserId?: string;
    readonly discordUserId?: string;
    readonly identityLinked: boolean;
  }> {
    const { v2UserId, discordUserId } = subject;

    if (v2UserId !== undefined && discordUserId !== undefined) {
      const link = await this.pool.query(
        `SELECT 1 FROM discord_identity_link
         WHERE discord_user_id = $1 AND v2_user_id = $2
         LIMIT 1`,
        [discordUserId, v2UserId],
      );
      if ((link.rowCount ?? 0) === 0) {
        throw new AuthorizationError('CONFLICT', 'Discord and V2 identity pair does not match');
      }
      return { v2UserId, discordUserId, identityLinked: true };
    }

    if (v2UserId !== undefined) {
      const link = await this.pool.query<{ discord_user_id: string }>(
        'SELECT discord_user_id FROM discord_identity_link WHERE v2_user_id = $1 LIMIT 1',
        [v2UserId],
      );
      const linkedDiscord = link.rows[0]?.discord_user_id;
      if (linkedDiscord !== undefined) {
        return { v2UserId, discordUserId: linkedDiscord, identityLinked: true };
      }
      return { v2UserId, identityLinked: false };
    }

    if (discordUserId !== undefined) {
      const link = await this.pool.query<{ v2_user_id: string }>(
        'SELECT v2_user_id FROM discord_identity_link WHERE discord_user_id = $1 LIMIT 1',
        [discordUserId],
      );
      const linkedV2 = link.rows[0]?.v2_user_id;
      if (linkedV2 !== undefined) {
        return { v2UserId: linkedV2, discordUserId, identityLinked: true };
      }
      return { discordUserId, identityLinked: false };
    }

    return { identityLinked: false };
  }
}
