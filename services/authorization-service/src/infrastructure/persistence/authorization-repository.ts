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
const LOGIN_WWW_PERMISSION = 'permission.platform.login.www';
const MANAGE_ORG_PERMISSION = 'permission.authorization.policy.manage.org';
const MANAGE_GUILD_PERMISSION = 'permission.authorization.policy.manage.guild';

/** Minimal query surface shared by Pool and PoolClient. */
type Queryable = {
  query: Pool['query'];
};

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
             SET updated_at = now(),
                 attachment_generation = connected_guild.attachment_generation + 1
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
      // Occurrence identity is owned by Authorization DB generations — not by
      // the gateway process. Client eventKey is accepted for non-lifecycle
      // events; lifecycle terminators always use durable keys.
      const durableEventKey = await this.resolveDurableEventKey(client, command);

      const inserted = await client.query(
        `INSERT INTO processed_event (event_key, event_type, discord_guild_id, payload_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key`,
        [durableEventKey, command.eventType, command.discordGuildId, command.payloadHash ?? null],
      );

      if (inserted.rowCount === 0) {
        return {
          applied: false,
          duplicate: true,
          eventKey: durableEventKey,
          revokedUserIds: [],
        };
      }

      await this.requireGuild(client, command.discordGuildId);

      const candidates = await this.collectGuildCandidateUserIds(client, command.discordGuildId);
      const entitledBefore = await this.filterWwwLoginEntitled(client, candidates);

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

      const revokedUserIds = await this.usersWhoLostWwwLoginEntitlement(client, entitledBefore);
      await this.enqueuePendingRevokes(
        client,
        revokedUserIds,
        REVOKE_REASON_ENTITLEMENT_LOST,
        durableEventKey,
      );

      await this.writeAudit(client, {
        action: 'discord.event',
        actorClientId: command.actorClientId ?? null,
        discordGuildId: command.discordGuildId,
        correlationId: command.correlationId ?? null,
        details: {
          eventKey: durableEventKey,
          clientEventKey: command.eventKey,
          eventType: command.eventType,
          kind: command.payload.kind,
          revokedUserIds,
        },
      });

      return {
        applied: true,
        duplicate: false,
        eventKey: durableEventKey,
        revokedUserIds,
      };
    });
  }

  public async reconcileGuild(command: ReconcileGuildCommand): Promise<ApplyDiscordEventResult> {
    // A deterministic key derived from the snapshot content keeps reconciles
    // idempotent. randomUUID would defeat de-duplication entirely.
    const eventKey =
      command.eventKey ??
      this.reconcileEventKey(command.discordGuildId, command.members, command.roles);

    return withTransaction(this.pool, async (client) => {
      // Serialize reconcile / recovery on the guild row so parallel recoveries
      // cannot double-bump availability_generation.
      const guildLock = await client.query<{
        sync_status: SyncStatus;
      }>(
        `SELECT sync_status FROM connected_guild
         WHERE discord_guild_id = $1
         FOR UPDATE`,
        [command.discordGuildId],
      );
      if (guildLock.rowCount === 0) {
        throw new AuthorizationError('NOT_FOUND', 'Guild is not registered');
      }
      const syncBefore = guildLock.rows[0]!.sync_status;

      const inserted = await client.query(
        `INSERT INTO processed_event (event_key, event_type, discord_guild_id)
         VALUES ($1, 'reconcile', $2)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key`,
        [eventKey, command.discordGuildId],
      );

      const isNewProcessedEvent = (inserted.rowCount ?? 0) > 0;
      const needsRecovery =
        !isNewProcessedEvent && (syncBefore === 'unavailable' || syncBefore === 'stale');

      if (!isNewProcessedEvent && !needsRecovery) {
        // Identical reconcile retry while already fresh — true idempotent duplicate.
        return { applied: false, duplicate: true, eventKey, revokedUserIds: [] };
      }

      const candidates = await this.collectGuildCandidateUserIds(client, command.discordGuildId);
      const entitledBefore = await this.filterWwwLoginEntitled(client, candidates);

      await this.applyReconcileSnapshot(client, command.discordGuildId, command.members, command.roles);

      const now = new Date();
      // Conditional bump: only transition unavailable/stale → fresh (or first apply).
      // Parallel recoveries serialize on FOR UPDATE; the second sees fresh and no-ops.
      const recovered = await client.query<{ availability_generation: number }>(
        `UPDATE connected_guild
         SET sync_status = 'fresh',
             last_fresh_at = $2,
             last_sync_at = $2,
             last_sync_error = NULL,
             availability_generation = availability_generation + 1,
             updated_at = $2
         WHERE discord_guild_id = $1
           AND (
             $3::boolean
             OR sync_status IN ('unavailable', 'stale')
           )
         RETURNING availability_generation`,
        [command.discordGuildId, now, isNewProcessedEvent],
      );

      if (recovered.rowCount === 0) {
        // Lost the race after lock release edge, or status already fresh.
        return { applied: false, duplicate: true, eventKey, revokedUserIds: [] };
      }

      const revokedUserIds = await this.usersWhoLostWwwLoginEntitlement(client, entitledBefore);
      await this.enqueuePendingRevokes(
        client,
        revokedUserIds,
        REVOKE_REASON_ENTITLEMENT_LOST,
        eventKey,
      );

      await this.writeAudit(client, {
        action: needsRecovery ? 'discord.reconcile_recovery' : 'discord.reconcile',
        actorClientId: command.actorClientId ?? null,
        discordGuildId: command.discordGuildId,
        correlationId: command.correlationId ?? null,
        details: {
          eventKey,
          revokedUserIds,
          recovery: needsRecovery,
          previousSyncStatus: syncBefore,
          availabilityGeneration: recovered.rows[0]!.availability_generation,
        },
      });

      return { applied: true, duplicate: false, eventKey, revokedUserIds };
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

      const candidates = await this.collectGuildCandidateUserIds(client, command.discordGuildId);
      const entitledBefore = await this.filterWwwLoginEntitled(client, candidates);

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

      const revokedUserIds = await this.usersWhoLostWwwLoginEntitlement(client, entitledBefore);
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

      const candidates = await this.collectGuildCandidateUserIds(client, command.discordGuildId);
      const entitledBefore = await this.filterWwwLoginEntitled(client, candidates);

      const result = await client.query<GuildRow>(
        `UPDATE connected_guild
         SET login_entitling = $2, updated_at = now()
         WHERE discord_guild_id = $1
         RETURNING discord_guild_id, status, login_entitling, sync_status, last_fresh_at`,
        [command.discordGuildId, command.loginEntitling],
      );
      const row = result.rows[0]!;

      const revokedUserIds = await this.usersWhoLostWwwLoginEntitlement(client, entitledBefore);
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
    // P3-D18: no-escalation for both allow and deny — actor must hold every
    // directly granted permission (and every permission in a group).
    await this.requireActorCanGrantPermissions(command);

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
        const targetV2 = await this.resolveV2ForSubject(
          client,
          command.v2UserId ?? null,
          command.discordUserId ?? null,
        );
        const entitledBefore =
          targetV2 !== undefined ? await this.isWwwLoginEntitled(client, targetV2) : false;

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

        const revokedUserIds: string[] = [];
        if (targetV2 !== undefined) {
          const entitledAfter = await this.isWwwLoginEntitled(client, targetV2);
          if (entitledBefore && !entitledAfter) {
            await this.enqueuePendingRevokes(
              client,
              [targetV2],
              REVOKE_REASON_ENTITLEMENT_LOST,
              `grant:${id}`,
            );
            revokedUserIds.push(targetV2);
          }
        }

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
      const targetV2 = await this.resolveV2ForSubject(
        client,
        command.v2UserId ?? null,
        command.discordUserId ?? null,
      );
      const entitledBefore =
        targetV2 !== undefined ? await this.isWwwLoginEntitled(client, targetV2) : false;

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

      const revokedUserIds: string[] = [];
      if (targetV2 !== undefined) {
        const entitledAfter = await this.isWwwLoginEntitled(client, targetV2);
        if (entitledBefore && !entitledAfter) {
          await this.enqueuePendingRevokes(
            client,
            [targetV2],
            REVOKE_REASON_ENTITLEMENT_LOST,
            `block:${id}`,
          );
          revokedUserIds.push(targetV2);
        }
      }

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
      source_event_key: string | null;
    }>(
      `SELECT id, v2_user_id, correlation_id, reason, attempts, source_event_key
       FROM pending_session_revoke
       WHERE status = 'pending'
         AND next_attempt_at <= now()
         AND (lease_expires_at IS NULL OR lease_expires_at < now())
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
      ...(row.source_event_key !== null ? { sourceEventKey: row.source_event_key } : {}),
    }));
  }

  public async claimPendingSessionRevokes(options: {
    readonly limit?: number;
    readonly leaseOwner: string;
    readonly leaseSeconds?: number;
  }): Promise<readonly PendingSessionRevokeRecord[]> {
    const limit = options.limit ?? 100;
    const leaseSeconds = options.leaseSeconds ?? 30;
    return withTransaction(this.pool, async (client) => {
      const claimed = await client.query<{
        id: string;
        v2_user_id: string;
        correlation_id: string;
        reason: string;
        attempts: number;
        source_event_key: string | null;
      }>(
        `WITH candidates AS (
           SELECT id
           FROM pending_session_revoke
           WHERE status = 'pending'
             AND next_attempt_at <= now()
             AND (lease_expires_at IS NULL OR lease_expires_at < now())
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE pending_session_revoke p
         SET lease_owner = $2,
             lease_expires_at = now() + ($3::text || ' seconds')::interval,
             updated_at = now()
         FROM candidates c
         WHERE p.id = c.id
         RETURNING p.id, p.v2_user_id, p.correlation_id, p.reason, p.attempts, p.source_event_key`,
        [limit, options.leaseOwner, leaseSeconds],
      );
      return claimed.rows.map((row) => ({
        id: row.id,
        v2UserId: row.v2_user_id,
        correlationId: row.correlation_id,
        reason: row.reason,
        attempts: row.attempts,
        ...(row.source_event_key !== null ? { sourceEventKey: row.source_event_key } : {}),
      }));
    });
  }

  public async markSessionRevokeDelivered(id: string, leaseOwner: string): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<{
        v2_user_id: string;
        correlation_id: string;
        source_event_key: string | null;
        attempts: number;
      }>(
        `UPDATE pending_session_revoke
         SET status = 'delivered',
             delivered_at = now(),
             updated_at = now(),
             lease_owner = NULL,
             lease_expires_at = NULL
         WHERE id = $1
           AND lease_owner = $2
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at >= now()
           AND status = 'pending'
         RETURNING v2_user_id, correlation_id, source_event_key, attempts`,
        [id, leaseOwner],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return false;
      }
      await this.writeAudit(client, {
        action: 'revoke.delivered',
        actor: leaseOwner,
        subjectV2UserId: row.v2_user_id,
        correlationId: row.correlation_id,
        details: {
          revokeId: id,
          attempt: row.attempts,
          outcome: 'delivered',
          sourceEventKey: row.source_event_key,
        },
      });
      return true;
    });
  }

  public async markSessionRevokeAttemptFailed(command: {
    readonly id: string;
    readonly leaseOwner: string;
    readonly errorMessage: string;
    readonly terminal?: boolean;
  }): Promise<boolean> {
    const terminal = command.terminal === true;
    // Exponential backoff capped at 15 minutes: 2^attempts seconds (min 2).
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<{
        v2_user_id: string;
        correlation_id: string;
        source_event_key: string | null;
        attempts: number;
      }>(
        `UPDATE pending_session_revoke
         SET attempts = attempts + 1,
             last_error = $3,
             updated_at = now(),
             status = CASE WHEN $4 THEN 'failed_terminal' ELSE 'pending' END,
             next_attempt_at = CASE
               WHEN $4 THEN next_attempt_at
               ELSE now() + (LEAST(900, GREATEST(2, POWER(2, attempts + 1)::int)) || ' seconds')::interval
             END,
             lease_owner = NULL,
             lease_expires_at = NULL
         WHERE id = $1
           AND lease_owner = $2
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at >= now()
           AND status = 'pending'
         RETURNING v2_user_id, correlation_id, source_event_key, attempts`,
        [command.id, command.leaseOwner, command.errorMessage, terminal],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return false;
      }
      await this.writeAudit(client, {
        action: terminal ? 'revoke.failed_terminal' : 'revoke.attempt_failed',
        actor: command.leaseOwner,
        subjectV2UserId: row.v2_user_id,
        correlationId: row.correlation_id,
        details: {
          revokeId: command.id,
          attempt: row.attempts,
          outcome: terminal ? 'failed_terminal' : 'attempt_failed',
          error: command.errorMessage,
          sourceEventKey: row.source_event_key,
        },
      });
      return true;
    });
  }

  public async processExpiredPolicies(
    now?: Date,
  ): Promise<{ readonly revokedUserIds: readonly string[] }> {
    const cutoff = now ?? new Date();
    return withTransaction(this.pool, async (client) => {
      const revoked = new Set<string>();

      const expiredAllows = await client.query<{
        id: string;
        permission_id: string | null;
        group_id: string | null;
        v2_user_id: string | null;
        discord_user_id: string | null;
        expires_at: Date;
      }>(
        `SELECT id, permission_id, group_id, v2_user_id, discord_user_id, expires_at
         FROM access_grant
         WHERE effect = 'allow'
           AND expires_at IS NOT NULL
           AND expires_at <= $1`,
        [cutoff],
      );

      const expiredDeniesAndBlocks: Array<{
        id: string;
        kind: 'grant_deny' | 'block';
      }> = [];

      const expiredDenies = await client.query<{ id: string }>(
        `SELECT id FROM access_grant
         WHERE effect = 'deny' AND expires_at IS NOT NULL AND expires_at <= $1`,
        [cutoff],
      );
      for (const row of expiredDenies.rows) {
        expiredDeniesAndBlocks.push({ id: row.id, kind: 'grant_deny' });
      }
      const expiredBlocks = await client.query<{ id: string }>(
        `SELECT id FROM access_block
         WHERE expires_at IS NOT NULL AND expires_at <= $1`,
        [cutoff],
      );
      for (const row of expiredBlocks.rows) {
        expiredDeniesAndBlocks.push({ id: row.id, kind: 'block' });
      }

      for (const row of expiredAllows.rows) {
        const v2 = await this.resolveV2ForSubject(client, row.v2_user_id, row.discord_user_id);
        if (v2 === undefined) {
          continue;
        }
        // Compare authoritative login entitlement just before vs after expiry.
        const beforeNow = new Date(row.expires_at.getTime() - 1);
        const entitledBefore = await this.isWwwLoginEntitled(client, v2, beforeNow);
        const entitledAfter = await this.isWwwLoginEntitled(client, v2, cutoff);
        if (entitledBefore && !entitledAfter) {
          await this.enqueuePendingRevokes(
            client,
            [v2],
            REVOKE_REASON_ENTITLEMENT_LOST,
            `expire:${row.id}`,
          );
          revoked.add(v2);
        }
      }

      // Expiry of deny/block must never enqueue revoke (access is restored or unchanged).
      for (const row of expiredDeniesAndBlocks) {
        await this.writeAudit(client, {
          action: 'policy.expire_noop_revoke',
          actor: 'system',
          details: { id: row.id, kind: row.kind, reason: 'deny_or_block_expiry' },
        });
      }

      // Physically remove expired rows so they are not re-processed.
      await client.query(
        `DELETE FROM access_grant WHERE expires_at IS NOT NULL AND expires_at <= $1`,
        [cutoff],
      );
      await client.query(
        `DELETE FROM access_block WHERE expires_at IS NOT NULL AND expires_at <= $1`,
        [cutoff],
      );

      const revokedUserIds = [...revoked];
      if (revokedUserIds.length > 0 || expiredAllows.rows.length > 0) {
        await this.writeAudit(client, {
          action: 'policy.expire',
          actor: 'system',
          details: {
            revokedUserIds,
            expiredAllowCount: expiredAllows.rows.length,
            expiredDenyOrBlockCount: expiredDeniesAndBlocks.length,
          },
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
      // Local managers may hold manage.guild; org managers / owners also qualify.
      const guildManage = await this.authorize({
        subject: actor,
        permissionId: MANAGE_GUILD_PERMISSION,
        scope: { type: 'guild', guildId: scopeGuildId },
        operationClass: 'sensitive',
      });
      if (guildManage.decision === 'allow') {
        return;
      }
      const orgManage = await this.authorize({
        subject: actor,
        permissionId: MANAGE_ORG_PERMISSION,
        scope: { type: 'organization' },
        operationClass: 'sensitive',
      });
      if (orgManage.decision === 'allow') {
        return;
      }
      throw new AuthorizationError(
        'FORBIDDEN',
        `Actor is not permitted to ${MANAGE_GUILD_PERMISSION}`,
      );
    }
    await this.requireActorCan(actor, MANAGE_ORG_PERMISSION, { type: 'organization' }, 'sensitive');
  }

  /**
   * P3-D18 no-escalation: for allow *and* deny grants, every granted permission
   * (direct or via group expansion) must already be held by the actor in the
   * same scope, unless the actor is an org policy manager / owner (manage.org).
   * Holding manage.guild alone is not sufficient to grant/deny arbitrary perms.
   */
  private async requireActorCanGrantPermissions(command: CreateGrantCommand): Promise<void> {
    const orgManage = await this.authorize({
      subject: command.actor,
      permissionId: MANAGE_ORG_PERMISSION,
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });
    if (orgManage.decision === 'allow') {
      return;
    }

    if (command.scopeType === 'organization') {
      throw new AuthorizationError(
        'FORBIDDEN',
        'Local managers cannot grant organization-scoped permissions',
      );
    }

    const permissions = await this.expandGrantPermissions(command.permissionId, command.groupId);
    const scope = {
      type: 'guild' as const,
      guildId: command.scopeGuildId!,
    };
    for (const permissionId of permissions) {
      const decision = await this.authorize({
        subject: command.actor,
        permissionId,
        scope,
        operationClass: 'sensitive',
      });
      if (decision.decision !== 'allow') {
        throw new AuthorizationError(
          'FORBIDDEN',
          `Actor cannot grant permission they do not hold: ${permissionId}`,
        );
      }
    }
  }

  private async expandGrantPermissions(
    permissionId: string | undefined,
    groupId: string | undefined,
  ): Promise<readonly string[]> {
    if (permissionId !== undefined) {
      return [permissionId];
    }
    if (groupId === undefined) {
      return [];
    }
    const result = await this.pool.query<{ permission_id: string }>(
      'SELECT permission_id FROM group_permission WHERE group_id = $1',
      [groupId],
    );
    return result.rows.map((row) => row.permission_id);
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

  /**
   * Build the durable processed_event key for lifecycle-sensitive occurrences.
   * Generations live in Authorization DB and survive gateway restarts.
   */
  private async resolveDurableEventKey(
    client: PoolClient,
    command: ApplyDiscordEventCommand,
  ): Promise<string> {
    switch (command.payload.kind) {
      case 'member_remove': {
        const row = await client.query<{ lifecycle_generation: number }>(
          `SELECT lifecycle_generation FROM discord_membership
           WHERE discord_guild_id = $1 AND discord_user_id = $2`,
          [command.discordGuildId, command.payload.discordUserId],
        );
        const generation = row.rows[0]?.lifecycle_generation ?? 0;
        return `dg:guild_member_remove:${command.discordGuildId}:${command.payload.discordUserId}:${generation}`;
      }
      case 'guild_unavailable': {
        const row = await client.query<{ availability_generation: number }>(
          `SELECT availability_generation FROM connected_guild WHERE discord_guild_id = $1`,
          [command.discordGuildId],
        );
        const generation = row.rows[0]?.availability_generation ?? 0;
        return `dg:guild_unavailable:${command.discordGuildId}:${generation}`;
      }
      case 'guild_detach': {
        const row = await client.query<{ attachment_generation: number }>(
          `SELECT attachment_generation FROM connected_guild WHERE discord_guild_id = $1`,
          [command.discordGuildId],
        );
        const generation = row.rows[0]?.attachment_generation ?? 0;
        return `dg:guild_detach:${command.discordGuildId}:${generation}`;
      }
      default:
        return command.eventKey;
    }
  }

  private async applyReconcileSnapshot(
    client: PoolClient,
    guildId: string,
    members: readonly MemberSnapshot[],
    roles: readonly RoleSnapshot[],
  ): Promise<void> {
    await this.replaceRoles(client, guildId, roles);

    const seenUsers = new Set<string>();
    for (const member of members) {
      seenUsers.add(member.discordUserId);
      await this.upsertMember(client, guildId, member);
    }

    const existing = await client.query<{ discord_user_id: string }>(
      `SELECT discord_user_id FROM discord_membership
       WHERE discord_guild_id = $1 AND status = 'active'`,
      [guildId],
    );
    for (const row of existing.rows) {
      if (!seenUsers.has(row.discord_user_id)) {
        await this.deactivateMember(client, guildId, row.discord_user_id);
      }
    }
  }

  private async upsertMember(
    client: PoolClient,
    guildId: string,
    member: MemberSnapshot,
  ): Promise<void> {
    // V2 binding comes only from the durable Identity link — Gateway must never
    // inject or overwrite a Discord↔V2 mapping via membership payloads.
    const link = await client.query<{ v2_user_id: string }>(
      'SELECT v2_user_id FROM discord_identity_link WHERE discord_user_id = $1',
      [member.discordUserId],
    );
    const linkedV2 = link.rows[0]?.v2_user_id ?? null;

    const previous = await client.query<{ status: string }>(
      `SELECT status FROM discord_membership
       WHERE discord_guild_id = $1 AND discord_user_id = $2`,
      [guildId, member.discordUserId],
    );
    const previousStatus = previous.rows[0]?.status;

    await client.query(
      `INSERT INTO discord_membership (
         discord_guild_id, discord_user_id, v2_user_id, status, last_synced_at, source
       ) VALUES ($1, $2, $3, $4, now(), 'gateway')
       ON CONFLICT (discord_guild_id, discord_user_id) DO UPDATE
         SET v2_user_id = COALESCE(
               (SELECT v2_user_id FROM discord_identity_link
                WHERE discord_user_id = EXCLUDED.discord_user_id),
               discord_membership.v2_user_id
             ),
             status = EXCLUDED.status,
             last_synced_at = now(),
             updated_at = now()`,
      [guildId, member.discordUserId, linkedV2, member.status],
    );

    // Rejoin (inactive → active) advances the durable membership generation so
    // a later leave is a new occurrence. First-time insert stays at 0.
    if (member.status === 'active' && previousStatus === 'inactive') {
      await client.query(
        `UPDATE discord_membership
         SET lifecycle_generation = lifecycle_generation + 1, updated_at = now()
         WHERE discord_guild_id = $1 AND discord_user_id = $2`,
        [guildId, member.discordUserId],
      );
    }

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

  /**
   * Candidate V2 users that may lose WWW login entitlement due to a guild-scoped
   * mutation: linked identities with membership (active or otherwise) on the guild.
   */
  private async collectGuildCandidateUserIds(
    client: PoolClient,
    guildId: string,
  ): Promise<ReadonlySet<string>> {
    const result = await client.query<{ v2_user_id: string }>(
      `SELECT DISTINCT COALESCE(m.v2_user_id, l.v2_user_id) AS v2_user_id
       FROM discord_membership m
       LEFT JOIN discord_identity_link l ON l.discord_user_id = m.discord_user_id
       WHERE m.discord_guild_id = $1
         AND COALESCE(m.v2_user_id, l.v2_user_id) IS NOT NULL`,
      [guildId],
    );
    return new Set(result.rows.map((row) => row.v2_user_id));
  }

  private async filterWwwLoginEntitled(
    client: PoolClient,
    candidates: ReadonlySet<string>,
    now?: Date,
  ): Promise<ReadonlySet<string>> {
    const entitled = new Set<string>();
    for (const v2UserId of candidates) {
      if (await this.isWwwLoginEntitled(client, v2UserId, now)) {
        entitled.add(v2UserId);
      }
    }
    return entitled;
  }

  private async isWwwLoginEntitled(
    queryable: Queryable,
    v2UserId: string,
    now?: Date,
  ): Promise<boolean> {
    const explanation = await this.authorizeWithQueryable(queryable, {
      subject: { v2UserId },
      permissionId: LOGIN_WWW_PERMISSION,
      scope: { type: 'organization' },
      operationClass: 'sensitive',
      ...(now !== undefined ? { now } : {}),
    });
    return explanation.decision === 'allow';
  }

  private async authorizeWithQueryable(
    queryable: Queryable,
    command: AuthorizeCommand,
  ): Promise<AuthorizationExplanation> {
    const decisionNow = command.now ?? new Date();
    const loaded = await this.loadAuthorizeContext(command.subject, queryable);
    return decideAuthorization(
      {
        subject: command.subject,
        permissionId: command.permissionId,
        scope: command.scope,
        operationClass: command.operationClass,
        now: decisionNow,
        trustWindowSeconds: this.trustWindowSeconds,
      },
      loaded.context,
      { groupPermissionIdsForGrants: loaded.groupPermissionIdsForGrants },
    );
  }

  private async usersWhoLostWwwLoginEntitlement(
    client: PoolClient,
    previouslyEntitled: ReadonlySet<string>,
    now?: Date,
  ): Promise<readonly string[]> {
    if (previouslyEntitled.size === 0) {
      return [];
    }
    const lost: string[] = [];
    for (const userId of previouslyEntitled) {
      const still = await this.isWwwLoginEntitled(client, userId, now);
      if (!still) {
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
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO pending_session_revoke (
           id, v2_user_id, correlation_id, reason, status, source_event_key, next_attempt_at
         ) VALUES ($1, $2, $3, $4, 'pending', $5, now())
         ON CONFLICT (correlation_id) DO NOTHING
         RETURNING id`,
        [randomUUID(), v2UserId, correlationId, reason, sourceEventKey ?? null],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        continue;
      }
      await this.writeAudit(client, {
        action: 'revoke.enqueued',
        actor: 'system',
        subjectV2UserId: v2UserId,
        correlationId,
        details: {
          revokeId: inserted.rows[0]!.id,
          reason,
          sourceEventKey: sourceEventKey ?? null,
          attempt: 0,
          outcome: 'enqueued',
        },
      });
    }
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

  private async loadAuthorizeContext(
    subject: DecisionSubject,
    queryable: Queryable = this.pool,
  ): Promise<{
    readonly context: AuthorizeContext;
    readonly groupPermissionIdsForGrants: ReadonlyMap<string, readonly string[]>;
  }> {
    const orgResult = await queryable.query<OrganizationRow>(
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
    const resolved = await this.resolvePrincipal(subject, queryable);
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

    const blocksResult = await queryable.query<{
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

    const grantsResult = await queryable.query<{
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

    const membershipRows = await queryable.query<{
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

    const roleRows = await queryable.query<{
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

    const guildsResult = await queryable.query<GuildRow>(
      `SELECT discord_guild_id, status, login_entitling, sync_status, last_fresh_at
       FROM connected_guild`,
    );
    const guilds = guildsResult.rows.map(mapGuild);

    const mappedResult = await queryable.query<{
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

    const groupPermsResult = await queryable.query<{
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
  private async resolvePrincipal(
    subject: DecisionSubject,
    queryable: Queryable = this.pool,
  ): Promise<{
    readonly v2UserId?: string;
    readonly discordUserId?: string;
    readonly identityLinked: boolean;
  }> {
    const { v2UserId, discordUserId } = subject;

    if (v2UserId !== undefined && discordUserId !== undefined) {
      const link = await queryable.query(
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
      const link = await queryable.query<{ discord_user_id: string }>(
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
      const link = await queryable.query<{ v2_user_id: string }>(
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
