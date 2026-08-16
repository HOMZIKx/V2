import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import type {
  ActivityDraftRecord,
  ActivityRecord,
  ActivityRepositoryPort,
  ActivityTx,
  GuildActivitySettingsRecord,
  HubPanelRecord,
  IdempotencyHit,
  OutboxInsert,
  OutboxMessageRecord,
  ParticipationRecord,
  ParticipationStatusDefRecord,
} from '../../application/ports/activity.ports.js';
import { ActivityError } from '../../domain/errors.js';
import type { ActivityStatus } from '../../domain/lifecycle.js';
import { DEFAULT_STATUS_SEED, type StatusBehavior } from '../../domain/status-def.js';

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

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  throw new Error('Expected string-compatible database value');
}

function asRequiredString(value: unknown, field: string): string {
  const result = asNullableString(value);
  if (result === null) {
    throw new Error(`Expected non-null string for ${field}`);
  }
  return result;
}

function asNullableDate(value: unknown): Date | null {
  const raw = asNullableString(value);
  return raw === null ? null : new Date(raw);
}

function asRequiredDate(value: unknown, field: string): Date {
  const result = asNullableDate(value);
  if (result === null) {
    throw new Error(`Expected non-null date for ${field}`);
  }
  return result;
}

function mapSettings(row: Record<string, unknown>): GuildActivitySettingsRecord {
  return {
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    orgId: asRequiredString(row.org_id, 'org_id'),
    organizerDefaultStatusId: asNullableString(row.organizer_default_status_id),
    waitlistPromotionStatusId: asNullableString(row.waitlist_promotion_status_id),
    maxActivePerCreator: Number(row.max_active_per_creator),
    registrationDefaultClosesAtStart: Boolean(row.registration_default_closes_at_start),
  };
}

function mapStatus(row: Record<string, unknown>): ParticipationStatusDefRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    label: asRequiredString(row.label, 'label'),
    occupiesSlot: Boolean(row.occupies_slot),
    behavior: asRequiredString(row.behavior, 'behavior') as StatusBehavior,
    selectableByMember: Boolean(row.selectable_by_member),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
    seedKey: asNullableString(row.seed_key),
  };
}

function mapDraft(row: Record<string, unknown>): ActivityDraftRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    creatorSubjectType: asRequiredString(row.creator_subject_type, 'creator_subject_type') as
      'discord' | 'v2',
    creatorDiscordUserId: asNullableString(row.creator_discord_user_id),
    creatorV2UserId: asNullableString(row.creator_v2_user_id),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    expiresAt: asRequiredDate(row.expires_at, 'expires_at'),
    createdAt: asRequiredDate(row.created_at, 'created_at'),
    updatedAt: asRequiredDate(row.updated_at, 'updated_at'),
  };
}

function mapActivity(row: Record<string, unknown>): ActivityRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    organizationId: asRequiredString(row.organization_id, 'organization_id'),
    typeId: asNullableString(row.type_id),
    name: asRequiredString(row.name, 'name'),
    description: asRequiredString(row.description, 'description'),
    startAt: asRequiredDate(row.start_at, 'start_at'),
    endAt: asNullableDate(row.end_at),
    status: asRequiredString(row.status, 'status') as ActivityStatus,
    enrollmentOpen: Boolean(row.enrollment_open),
    participantLimit:
      row.participant_limit === null || row.participant_limit === undefined
        ? null
        : Number(row.participant_limit),
    organizerDiscordUserId: asNullableString(row.organizer_discord_user_id),
    organizerV2UserId: asNullableString(row.organizer_v2_user_id),
    coOrganizerDiscordUserId: asNullableString(row.co_organizer_discord_user_id),
    coOrganizerV2UserId: asNullableString(row.co_organizer_v2_user_id),
    publicationChannelId: asNullableString(row.publication_channel_id),
    timezone: asRequiredString(row.timezone, 'timezone'),
    locationText: asNullableString(row.location_text),
    cancelReason: asNullableString(row.cancel_reason),
    cancelledAt: asNullableDate(row.cancelled_at),
    version: Number(row.version),
    scheduledFinishAt: asRequiredDate(row.scheduled_finish_at, 'scheduled_finish_at'),
    createdAt: asRequiredDate(row.created_at, 'created_at'),
    updatedAt: asRequiredDate(row.updated_at, 'updated_at'),
  };
}

function mapParticipation(row: Record<string, unknown>): ParticipationRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    activityId: asRequiredString(row.activity_id, 'activity_id'),
    discordUserId: asNullableString(row.discord_user_id),
    v2UserId: asNullableString(row.v2_user_id),
    statusDefId: asRequiredString(row.status_def_id, 'status_def_id'),
    confirmationState: asRequiredString(row.confirmation_state, 'confirmation_state') as
      'confirmed' | 'requires_reconfirmation',
    reconfirmDeadline: asNullableDate(row.reconfirm_deadline),
    waitlistPosition:
      row.waitlist_position === null || row.waitlist_position === undefined
        ? null
        : Number(row.waitlist_position),
    resignedAt: asNullableDate(row.resigned_at),
    removedAt: asNullableDate(row.removed_at),
    removeReason: asNullableString(row.remove_reason),
    occupiesSlot: Boolean(row.occupies_slot),
    statusBehavior: asRequiredString(
      row.status_behavior ?? row.behavior,
      'status_behavior',
    ) as StatusBehavior,
  };
}

function mapPanel(row: Record<string, unknown>): HubPanelRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    organizationId: asRequiredString(row.organization_id, 'organization_id'),
    discordGuildId: asRequiredString(row.discord_guild_id, 'discord_guild_id'),
    channelId: asRequiredString(row.channel_id, 'channel_id'),
    messageId: asNullableString(row.message_id),
    panelType: asRequiredString(row.panel_type, 'panel_type'),
    payloadVersion: Number(row.payload_version),
    status: asRequiredString(row.status, 'status'),
  };
}

function createTx(client: PoolClient): ActivityTx {
  return {
    async lockCreatorAdvisory(guildId, creatorKey) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `${guildId}::${creatorKey}`,
      ]);
    },

    async lockActivity(activityId) {
      const result = await client.query(`SELECT * FROM activities WHERE id = $1 FOR UPDATE`, [
        activityId,
      ]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      return mapActivity(row);
    },

    async ensureGuildDefaults(input) {
      await client.query(
        `INSERT INTO guild_activity_settings (guild_id, org_id)
         VALUES ($1, $2)
         ON CONFLICT (guild_id) DO NOTHING`,
        [input.guildId, input.orgId],
      );

      for (const seed of DEFAULT_STATUS_SEED) {
        await client.query(
          `INSERT INTO participation_status_defs (
             guild_id, label, occupies_slot, behavior, selectable_by_member, active, sort_order, seed_key
           ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
           ON CONFLICT (guild_id, seed_key) DO NOTHING`,
          [
            input.guildId,
            seed.label,
            seed.occupiesSlot,
            seed.behavior,
            seed.selectableByMember,
            seed.sortOrder,
            seed.key,
          ],
        );
      }

      const confirmed = await client.query(
        `SELECT id FROM participation_status_defs
         WHERE guild_id = $1 AND seed_key = 'confirmed' LIMIT 1`,
        [input.guildId],
      );
      const confirmedId = asNullableString(
        (confirmed.rows[0] as Record<string, unknown> | undefined)?.id,
      );
      if (confirmedId !== null) {
        await client.query(
          `UPDATE guild_activity_settings
           SET organizer_default_status_id = COALESCE(organizer_default_status_id, $2),
               waitlist_promotion_status_id = COALESCE(waitlist_promotion_status_id, $2),
               updated_at = now()
           WHERE guild_id = $1`,
          [input.guildId, confirmedId],
        );
      }

      await client.query(
        `INSERT INTO activity_types (guild_id, key, label, enabled, is_other, sort_order)
         VALUES ($1, 'other', 'Inna aktywność', TRUE, TRUE, 1000)
         ON CONFLICT (guild_id, key) DO NOTHING`,
        [input.guildId],
      );

      const settingsResult = await client.query(
        `SELECT * FROM guild_activity_settings WHERE guild_id = $1`,
        [input.guildId],
      );
      const statusesResult = await client.query(
        `SELECT * FROM participation_status_defs WHERE guild_id = $1 ORDER BY sort_order`,
        [input.guildId],
      );

      return {
        settings: mapSettings(settingsResult.rows[0] as Record<string, unknown>),
        statuses: statusesResult.rows.map((row) => mapStatus(row as Record<string, unknown>)),
      };
    },

    async getSettings(guildId) {
      const result = await client.query(
        `SELECT * FROM guild_activity_settings WHERE guild_id = $1`,
        [guildId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapSettings(row);
    },

    async updateSettings(guildId, patch) {
      const result = await client.query(
        `UPDATE guild_activity_settings SET
           organizer_default_status_id = COALESCE($2, organizer_default_status_id),
           waitlist_promotion_status_id = COALESCE($3, waitlist_promotion_status_id),
           max_active_per_creator = COALESCE($4, max_active_per_creator),
           registration_default_closes_at_start = COALESCE($5, registration_default_closes_at_start),
           updated_at = now()
         WHERE guild_id = $1
         RETURNING *`,
        [
          guildId,
          patch.organizerDefaultStatusId ?? null,
          patch.waitlistPromotionStatusId ?? null,
          patch.maxActivePerCreator ?? null,
          patch.registrationDefaultClosesAtStart ?? null,
        ],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Guild settings not found');
      }
      return mapSettings(row);
    },

    async listStatusDefs(guildId) {
      const result = await client.query(
        `SELECT * FROM participation_status_defs WHERE guild_id = $1 ORDER BY sort_order`,
        [guildId],
      );
      return result.rows.map((row) => mapStatus(row as Record<string, unknown>));
    },

    async getStatusDef(id) {
      const result = await client.query(`SELECT * FROM participation_status_defs WHERE id = $1`, [
        id,
      ]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapStatus(row);
    },

    async countActiveOwn(guildId, organizerDiscordUserId) {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM activities
         WHERE guild_id = $1
           AND organizer_discord_user_id = $2
           AND status = ANY($3::activity_status[])`,
        [
          guildId,
          organizerDiscordUserId,
          ['published', 'registrations_open', 'registrations_closed', 'in_progress'],
        ],
      );
      return Number(result.rows[0]?.count ?? 0);
    },

    async insertDraft(input) {
      const result = await client.query(
        `INSERT INTO activity_drafts (
           id, guild_id, creator_subject_type, creator_discord_user_id, creator_v2_user_id, payload, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         RETURNING *`,
        [
          input.id,
          input.guildId,
          input.creatorSubjectType,
          input.creatorDiscordUserId,
          input.creatorV2UserId,
          JSON.stringify(input.payload),
          input.expiresAt.toISOString(),
        ],
      );
      return mapDraft(result.rows[0] as Record<string, unknown>);
    },

    async getDraft(id) {
      const result = await client.query(`SELECT * FROM activity_drafts WHERE id = $1`, [id]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapDraft(row);
    },

    async updateDraft(id, patch) {
      const result = await client.query(
        `UPDATE activity_drafts SET
           payload = COALESCE($2::jsonb, payload),
           expires_at = COALESCE($3, expires_at),
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.payload === undefined ? null : JSON.stringify(patch.payload),
          patch.expiresAt?.toISOString() ?? null,
        ],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Draft not found');
      }
      return mapDraft(row);
    },

    async deleteDraft(id) {
      await client.query(`DELETE FROM activity_drafts WHERE id = $1`, [id]);
    },

    async insertActivity(input) {
      const result = await client.query(
        `INSERT INTO activities (
           id, guild_id, organization_id, type_id, name, description, start_at, end_at, status,
           enrollment_open, participant_limit, organizer_discord_user_id, organizer_v2_user_id,
           co_organizer_discord_user_id, co_organizer_v2_user_id, publication_channel_id,
           timezone, location_text, cancel_reason, cancelled_at, version, scheduled_finish_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
         ) RETURNING *`,
        [
          input.id,
          input.guildId,
          input.organizationId,
          input.typeId,
          input.name,
          input.description,
          input.startAt.toISOString(),
          input.endAt?.toISOString() ?? null,
          input.status,
          input.enrollmentOpen,
          input.participantLimit,
          input.organizerDiscordUserId,
          input.organizerV2UserId,
          input.coOrganizerDiscordUserId,
          input.coOrganizerV2UserId,
          input.publicationChannelId,
          input.timezone,
          input.locationText,
          input.cancelReason,
          input.cancelledAt?.toISOString() ?? null,
          input.version ?? 1,
          input.scheduledFinishAt.toISOString(),
        ],
      );
      return mapActivity(result.rows[0] as Record<string, unknown>);
    },

    async updateActivity(activity) {
      const result = await client.query(
        `UPDATE activities SET
           name = $2, description = $3, start_at = $4, end_at = $5, status = $6,
           enrollment_open = $7, participant_limit = $8,
           co_organizer_discord_user_id = $9, co_organizer_v2_user_id = $10,
           publication_channel_id = $11, timezone = $12, location_text = $13,
           cancel_reason = $14, cancelled_at = $15, version = $16,
           scheduled_finish_at = $17, organizer_discord_user_id = $18,
           organizer_v2_user_id = $19, type_id = $20, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          activity.id,
          activity.name,
          activity.description,
          activity.startAt.toISOString(),
          activity.endAt?.toISOString() ?? null,
          activity.status,
          activity.enrollmentOpen,
          activity.participantLimit,
          activity.coOrganizerDiscordUserId,
          activity.coOrganizerV2UserId,
          activity.publicationChannelId,
          activity.timezone,
          activity.locationText,
          activity.cancelReason,
          activity.cancelledAt?.toISOString() ?? null,
          activity.version,
          activity.scheduledFinishAt.toISOString(),
          activity.organizerDiscordUserId,
          activity.organizerV2UserId,
          activity.typeId,
        ],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      return mapActivity(row);
    },

    async getActivity(id) {
      const result = await client.query(`SELECT * FROM activities WHERE id = $1`, [id]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapActivity(row);
    },

    async listActivities(guildId) {
      const result = await client.query(
        `SELECT * FROM activities WHERE guild_id = $1 AND status <> 'deleted' ORDER BY start_at`,
        [guildId],
      );
      return result.rows.map((row) => mapActivity(row as Record<string, unknown>));
    },

    async listMyActivities(input) {
      const result = await client.query(
        `SELECT DISTINCT a.* FROM activities a
         LEFT JOIN participations p ON p.activity_id = a.id
           AND p.resigned_at IS NULL AND p.removed_at IS NULL
         WHERE ($1::text IS NULL OR a.guild_id = $1)
           AND a.status <> 'deleted'
           AND (
             a.organizer_discord_user_id = $2
             OR a.co_organizer_discord_user_id = $2
             OR p.discord_user_id = $2
             OR ($3::text IS NOT NULL AND (
               a.organizer_v2_user_id = $3 OR a.co_organizer_v2_user_id = $3 OR p.v2_user_id = $3
             ))
           )
         ORDER BY a.start_at`,
        [input.guildId ?? null, input.discordUserId ?? null, input.v2UserId ?? null],
      );
      return result.rows.map((row) => mapActivity(row as Record<string, unknown>));
    },

    async listParticipations(activityId) {
      const result = await client.query(
        `SELECT p.*, s.occupies_slot, s.behavior AS status_behavior
         FROM participations p
         JOIN participation_status_defs s ON s.id = p.status_def_id
         WHERE p.activity_id = $1
         ORDER BY p.created_at`,
        [activityId],
      );
      return result.rows.map((row) => mapParticipation(row as Record<string, unknown>));
    },

    async getParticipation(activityId, discordUserId) {
      const result = await client.query(
        `SELECT p.*, s.occupies_slot, s.behavior AS status_behavior
         FROM participations p
         JOIN participation_status_defs s ON s.id = p.status_def_id
         WHERE p.activity_id = $1 AND p.discord_user_id = $2
           AND p.resigned_at IS NULL AND p.removed_at IS NULL
         LIMIT 1`,
        [activityId, discordUserId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapParticipation(row);
    },

    async upsertParticipation(input) {
      const existing = input.discordUserId
        ? await client.query(
            `SELECT id FROM participations
             WHERE activity_id = $1 AND discord_user_id = $2
               AND resigned_at IS NULL AND removed_at IS NULL
             LIMIT 1`,
            [input.activityId, input.discordUserId],
          )
        : { rows: [] as { id: string }[] };

      const existingId = (existing.rows[0] as { id: string } | undefined)?.id;
      if (existingId !== undefined) {
        const result = await client.query(
          `UPDATE participations SET
             status_def_id = $2, confirmation_state = $3, reconfirm_deadline = $4,
             waitlist_position = $5, updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [
            existingId,
            input.statusDefId,
            input.confirmationState,
            input.reconfirmDeadline?.toISOString() ?? null,
            input.waitlistPosition,
          ],
        );
        const id = String((result.rows[0] as { id: string }).id);
        const full = await client.query(
          `SELECT p.*, s.occupies_slot, s.behavior AS status_behavior
           FROM participations p
           JOIN participation_status_defs s ON s.id = p.status_def_id
           WHERE p.id = $1`,
          [id],
        );
        return mapParticipation(full.rows[0] as Record<string, unknown>);
      }

      const id = input.id || randomUUID();
      await client.query(
        `INSERT INTO participations (
           id, activity_id, discord_user_id, v2_user_id, status_def_id,
           confirmation_state, reconfirm_deadline, waitlist_position
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          input.activityId,
          input.discordUserId,
          input.v2UserId,
          input.statusDefId,
          input.confirmationState,
          input.reconfirmDeadline?.toISOString() ?? null,
          input.waitlistPosition,
        ],
      );
      const full = await client.query(
        `SELECT p.*, s.occupies_slot, s.behavior AS status_behavior
         FROM participations p
         JOIN participation_status_defs s ON s.id = p.status_def_id
         WHERE p.id = $1`,
        [id],
      );
      return mapParticipation(full.rows[0] as Record<string, unknown>);
    },

    async markParticipationResigned(id, at) {
      await client.query(
        `UPDATE participations SET resigned_at = $2, waitlist_position = NULL, updated_at = now()
         WHERE id = $1`,
        [id, at.toISOString()],
      );
    },

    async markParticipationRemoved(id, at, reason) {
      await client.query(
        `UPDATE participations SET removed_at = $2, remove_reason = $3, waitlist_position = NULL, updated_at = now()
         WHERE id = $1`,
        [id, at.toISOString(), reason],
      );
    },

    async clearWaitlistPosition(id) {
      await client.query(
        `UPDATE participations SET waitlist_position = NULL, updated_at = now() WHERE id = $1`,
        [id],
      );
    },

    async upsertPanel(input) {
      const existing = await client.query(
        `SELECT * FROM activity_hub_panels
         WHERE organization_id = $1 AND discord_guild_id = $2 AND panel_type = $3
         FOR UPDATE`,
        [input.organizationId, input.discordGuildId, input.panelType],
      );
      const row = existing.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        const inserted = await client.query(
          `INSERT INTO activity_hub_panels (
             organization_id, discord_guild_id, channel_id, message_id, panel_type,
             payload_version, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [
            input.organizationId,
            input.discordGuildId,
            input.channelId,
            input.messageId ?? null,
            input.panelType,
            input.payloadVersion ?? 1,
            input.status ?? 'unconfigured',
          ],
        );
        const created = inserted.rows[0] as Record<string, unknown>;
        return {
          panel: mapPanel(created),
          repaired: false,
        };
      }

      const previousMessageId = asNullableString(row.message_id);
      const nextMessageId = input.messageId === undefined ? previousMessageId : input.messageId;
      const repaired =
        previousMessageId !== null && nextMessageId !== null && previousMessageId !== nextMessageId;

      const updated = await client.query(
        `UPDATE activity_hub_panels SET
           channel_id = $2,
           message_id = $3,
           status = COALESCE($4, status),
           payload_version = COALESCE($5, payload_version),
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          asRequiredString(row.id, 'id'),
          input.channelId,
          nextMessageId,
          input.status ?? null,
          input.payloadVersion ?? null,
        ],
      );
      const u = updated.rows[0] as Record<string, unknown>;
      return {
        panel: mapPanel(u),
        repaired,
      };
    },

    async getPanel(id) {
      const result = await client.query(`SELECT * FROM activity_hub_panels WHERE id = $1`, [id]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      return mapPanel(row);
    },

    async listPanels(guildId) {
      const result = await client.query(
        `SELECT * FROM activity_hub_panels WHERE discord_guild_id = $1`,
        [guildId],
      );
      return result.rows.map((row) => mapPanel(row as Record<string, unknown>));
    },

    async insertPublishOccurrence(input) {
      await client.query(
        `INSERT INTO panel_publish_occurrences (
           panel_id, operation_id, nonce, payload_version, desired_channel_id, correlation_id
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (panel_id, operation_id) DO NOTHING`,
        [
          input.panelId,
          input.operationId,
          input.nonce,
          input.payloadVersion,
          input.desiredChannelId,
          input.correlationId ?? null,
        ],
      );
    },

    async insertOutbox(message: OutboxInsert) {
      await client.query(
        `INSERT INTO outbox_messages (
           event_type, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
        [
          message.eventType,
          message.aggregateType,
          message.aggregateId,
          message.aggregateVersion,
          JSON.stringify(message.payload),
          message.occurredAt.toISOString(),
        ],
      );
    },

    async claimOutbox(input) {
      const result = await client.query(
        `WITH picked AS (
           SELECT id FROM outbox_messages
           WHERE status = 'pending' AND available_at <= $1
           ORDER BY available_at
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE outbox_messages o SET
           status = 'claimed',
           claimed_at = $1,
           claim_owner = $3,
           claim_expires_at = $4,
           attempt_count = attempt_count + 1
         FROM picked
         WHERE o.id = picked.id
         RETURNING o.*`,
        [
          input.now.toISOString(),
          input.limit,
          input.owner,
          new Date(input.now.getTime() + input.leaseSeconds * 1000).toISOString(),
        ],
      );
      return result.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          eventType: String(r.event_type),
          aggregateType: String(r.aggregate_type),
          aggregateId: String(r.aggregate_id),
          aggregateVersion: Number(r.aggregate_version),
          payload: (r.payload ?? {}) as Record<string, unknown>,
          status: String(r.status),
          attemptCount: Number(r.attempt_count),
        } satisfies OutboxMessageRecord;
      });
    },

    async completeOutbox(id) {
      await client.query(
        `UPDATE outbox_messages SET status = 'delivered', claim_owner = NULL, claim_expires_at = NULL
         WHERE id = $1`,
        [id],
      );
    },

    async failOutbox(id, error, availableAt) {
      await client.query(
        `UPDATE outbox_messages SET
           status = 'pending', last_error = $2, available_at = $3,
           claim_owner = NULL, claim_expires_at = NULL, claimed_at = NULL
         WHERE id = $1`,
        [id, error, availableAt.toISOString()],
      );
    },

    async findIdempotency(input) {
      const result = await client.query(
        `SELECT response_status, response_body FROM idempotency_records
         WHERE scope = $1 AND actor_key = $2 AND operation = $3 AND idempotency_key = $4`,
        [input.scope, input.actorKey, input.operation, input.idempotencyKey],
      );
      const row = result.rows[0] as { response_status: number; response_body: unknown } | undefined;
      if (row === undefined) {
        return null;
      }
      return {
        responseStatus: row.response_status,
        responseBody: row.response_body,
      } satisfies IdempotencyHit;
    },

    async saveIdempotency(input) {
      try {
        await client.query(
          `INSERT INTO idempotency_records (
             scope, actor_key, operation, idempotency_key, response_status, response_body
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [
            input.scope,
            input.actorKey,
            input.operation,
            input.idempotencyKey,
            input.responseStatus,
            JSON.stringify(input.responseBody),
          ],
        );
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (asNullableString(error.code) ?? '')
            : '';
        if (code === '23505') {
          throw new ActivityError('IDEMPOTENCY_CONFLICT', 'Idempotency key conflict');
        }
        throw error;
      }
    },

    async insertAudit(input) {
      await client.query(
        `INSERT INTO activity_audit_entries (
           guild_id, activity_id, actor_discord_user_id, actor_v2_user_id, action, details, correlation_id
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [
          input.guildId ?? null,
          input.activityId ?? null,
          input.actorDiscordUserId ?? null,
          input.actorV2UserId ?? null,
          input.action,
          JSON.stringify(input.details ?? {}),
          input.correlationId ?? null,
        ],
      );
    },

    async ping() {
      await client.query('SELECT 1');
    },

    async listExpiredReconfirmations(now) {
      const result = await client.query(
        `SELECT activity_id, id AS participation_id, discord_user_id
         FROM participations
         WHERE confirmation_state = 'requires_reconfirmation'
           AND reconfirm_deadline IS NOT NULL
           AND reconfirm_deadline <= $1
           AND resigned_at IS NULL
           AND removed_at IS NULL`,
        [now.toISOString()],
      );
      return result.rows.map((row) => ({
        activityId: String((row as { activity_id: unknown }).activity_id),
        participationId: String((row as { participation_id: unknown }).participation_id),
        discordUserId:
          (row as { discord_user_id: unknown }).discord_user_id === null ||
          (row as { discord_user_id: unknown }).discord_user_id === undefined
            ? null
            : String((row as { discord_user_id: unknown }).discord_user_id),
      }));
    },

    async listActivitiesDueForFinish(now) {
      const result = await client.query(
        `SELECT * FROM activities
         WHERE status = 'in_progress'
           AND scheduled_finish_at <= $1`,
        [now.toISOString()],
      );
      return result.rows.map((row) => mapActivity(row as Record<string, unknown>));
    },
  };
}

export class ActivityRepository implements ActivityRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async withTransaction<T>(fn: (tx: ActivityTx) => Promise<T>): Promise<T> {
    return withTransaction(this.pool, async (client) => fn(createTx(client)));
  }

  public async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
}
