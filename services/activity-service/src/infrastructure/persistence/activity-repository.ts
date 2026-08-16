import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import type {
  ActivityDraftRecord,
  ActivityProjectionRecord,
  ActivityRecord,
  ActivityReportRecord,
  ActivityRepositoryPort,
  ActivityTx,
  ActivityTypeRecord,
  AuditEntryRecord,
  GuildActivitySettingsRecord,
  HubPanelRecord,
  IdempotencyHit,
  InboxItemRecord,
  OutboxInsert,
  OutboxMessageRecord,
  ParticipantFieldDefRecord,
  ParticipationRecord,
  ParticipationStatusDefRecord,
  ReminderConfigEntry,
  ReportReasonDefRecord,
} from '../../application/ports/activity.ports.js';
import { ActivityError } from '../../domain/errors.js';
import type { ActivityStatus } from '../../domain/lifecycle.js';
import { opaqueIdFromUuid } from '../../domain/opaque-id.js';
import { DEFAULT_STATUS_SEED, type StatusBehavior } from '../../domain/status-def.js';
import { asNullableDate } from './pg-value-mappers.js';

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

function asRequiredDate(value: unknown, field: string): Date {
  const result = asNullableDate(value);
  if (result === null) {
    throw new Error(`Expected non-null date for ${field}`);
  }
  return result;
}

function asReminderList(value: unknown): ReminderConfigEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is ReminderConfigEntry =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry),
  );
}

function mapSettings(row: Record<string, unknown>): GuildActivitySettingsRecord {
  const channels = row.allowed_publish_channel_ids;
  const pingRoles = row.ping_role_ids;
  return {
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    orgId: asRequiredString(row.org_id, 'org_id'),
    organizerDefaultStatusId: asNullableString(row.organizer_default_status_id),
    waitlistPromotionStatusId: asNullableString(row.waitlist_promotion_status_id),
    maxActivePerCreator: Number(row.max_active_per_creator),
    registrationDefaultClosesAtStart: Boolean(row.registration_default_closes_at_start),
    allowedPublishChannelIds: Array.isArray(channels) ? channels.map((value) => String(value)) : [],
    configRevision: Number(row.config_revision ?? 1),
    allowOtherActivity:
      row.allow_other_activity === undefined ? true : Boolean(row.allow_other_activity),
    maxCreateHorizonDays: Number(row.max_create_horizon_days ?? 14),
    postRetentionHoursAfterFinish: Number(row.post_retention_hours_after_finish ?? 72),
    reminders: asReminderList(row.reminders_json),
    dmNotificationsEnabled:
      row.dm_notifications_enabled === undefined ? true : Boolean(row.dm_notifications_enabled),
    pingRoleIds: Array.isArray(pingRoles) ? pingRoles.map((value) => String(value)) : [],
    hubChannelId: asNullableString(row.hub_channel_id),
  };
}

function mapActivityType(
  row: Record<string, unknown>,
  statusDefIds: readonly string[],
  participantFields: readonly { fieldDefId: string; required: boolean }[],
): ActivityTypeRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    key: asRequiredString(row.key, 'key'),
    label: asRequiredString(row.label, 'label'),
    enabled: Boolean(row.enabled),
    isOther: Boolean(row.is_other),
    sortOrder: Number(row.sort_order),
    statusDefIds,
    participantFields,
    createdAt: asRequiredDate(row.created_at, 'created_at'),
    updatedAt: asRequiredDate(row.updated_at, 'updated_at'),
  };
}

function mapParticipantField(row: Record<string, unknown>): ParticipantFieldDefRecord {
  const options = row.options_json;
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    key: asRequiredString(row.key, 'key'),
    label: asRequiredString(row.label, 'label'),
    fieldType: asRequiredString(row.field_type, 'field_type'),
    requiredDefault: Boolean(row.required_default),
    active: Boolean(row.active),
    optionsJson: Array.isArray(options) ? options : [],
    maxLength:
      row.max_length === null || row.max_length === undefined ? null : Number(row.max_length),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: asRequiredDate(row.created_at, 'created_at'),
    updatedAt: asRequiredDate(row.updated_at, 'updated_at'),
  };
}

function mapReportReason(row: Record<string, unknown>): ReportReasonDefRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    key: asRequiredString(row.key, 'key'),
    label: asRequiredString(row.label, 'label'),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
    allowDetails: row.allow_details === undefined ? true : Boolean(row.allow_details),
    requiresDetails: Boolean(row.requires_details ?? false),
    createdAt: asRequiredDate(row.created_at, 'created_at'),
  };
}

function mapAudit(row: Record<string, unknown>): AuditEntryRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asNullableString(row.guild_id),
    activityId: asNullableString(row.activity_id),
    actorDiscordUserId: asNullableString(row.actor_discord_user_id),
    actorV2UserId: asNullableString(row.actor_v2_user_id),
    action: asRequiredString(row.action, 'action'),
    details: (row.details ?? {}) as Record<string, unknown>,
    correlationId: asNullableString(row.correlation_id),
    createdAt: asRequiredDate(row.created_at, 'created_at'),
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
  const id = asRequiredString(row.id, 'id');
  return {
    id,
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
    opaqueId: asNullableString(row.opaque_id) ?? opaqueIdFromUuid(id),
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
  const id = asRequiredString(row.id, 'id');
  return {
    id,
    organizationId: asRequiredString(row.organization_id, 'organization_id'),
    discordGuildId: asRequiredString(row.discord_guild_id, 'discord_guild_id'),
    channelId: asRequiredString(row.channel_id, 'channel_id'),
    messageId: asNullableString(row.message_id),
    panelType: asRequiredString(row.panel_type, 'panel_type'),
    payloadVersion: Number(row.payload_version),
    status: asRequiredString(row.status, 'status'),
    opaqueId: asNullableString(row.opaque_id) ?? opaqueIdFromUuid(id),
  };
}

function mapInbox(row: Record<string, unknown>): InboxItemRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    recipientDiscordUserId: asNullableString(row.recipient_discord_user_id),
    recipientV2UserId: asNullableString(row.recipient_v2_user_id),
    kind: asRequiredString(row.kind, 'kind'),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    readAt: asNullableDate(row.read_at),
    createdAt: asRequiredDate(row.created_at, 'created_at'),
  };
}

function mapReport(row: Record<string, unknown>): ActivityReportRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    activityId: asRequiredString(row.activity_id, 'activity_id'),
    reporterDiscordUserId: asRequiredString(
      row.reporter_discord_user_id,
      'reporter_discord_user_id',
    ),
    reasonCategory: asRequiredString(row.reason_category, 'reason_category'),
    details: asNullableString(row.details),
    status: asRequiredString(row.status, 'status'),
    createdAt: asRequiredDate(row.created_at, 'created_at'),
  };
}

function mapProjection(row: Record<string, unknown>): ActivityProjectionRecord {
  const activityId = asRequiredString(row.activity_id, 'activity_id');
  return {
    activityId,
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    channelId: asRequiredString(row.channel_id, 'channel_id'),
    messageId: asNullableString(row.message_id),
    status: asRequiredString(row.status, 'status'),
    opaqueId: asNullableString(row.opaque_id) ?? opaqueIdFromUuid(activityId),
    revision: Number(row.revision ?? 1),
    lastError: asNullableString(row.last_error),
    retryCount: Number(row.retry_count ?? 0),
    leaseOwner: asNullableString(row.lease_owner),
    leaseExpiresAt: asNullableDate(row.lease_expires_at),
    desiredPayloadVersion: Number(row.desired_payload_version ?? 1),
    updatedAt: asRequiredDate(row.updated_at, 'updated_at'),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    asNullableString(error.code) === '23505'
  );
}

async function loadActivityType(
  client: PoolClient,
  row: Record<string, unknown>,
): Promise<ActivityTypeRecord> {
  const typeId = asRequiredString(row.id, 'id');
  const statusResult = await client.query(
    `SELECT status_def_id FROM activity_type_status_defs WHERE type_id = $1`,
    [typeId],
  );
  const fieldResult = await client.query(
    `SELECT field_def_id, required FROM activity_type_participant_fields WHERE type_id = $1`,
    [typeId],
  );
  return mapActivityType(
    row,
    statusResult.rows.map((r) => String((r as { status_def_id: unknown }).status_def_id)),
    fieldResult.rows.map((r) => ({
      fieldDefId: String((r as { field_def_id: unknown }).field_def_id),
      required: Boolean((r as { required: unknown }).required),
    })),
  );
}

async function replaceTypeAssociations(
  client: PoolClient,
  typeId: string,
  associations: {
    statusDefIds: readonly string[];
    participantFields: readonly { fieldDefId: string; required: boolean }[];
  },
): Promise<void> {
  await client.query(`DELETE FROM activity_type_status_defs WHERE type_id = $1`, [typeId]);
  await client.query(`DELETE FROM activity_type_participant_fields WHERE type_id = $1`, [typeId]);
  for (const statusDefId of associations.statusDefIds) {
    await client.query(
      `INSERT INTO activity_type_status_defs (type_id, status_def_id) VALUES ($1, $2)`,
      [typeId, statusDefId],
    );
  }
  for (const field of associations.participantFields) {
    await client.query(
      `INSERT INTO activity_type_participant_fields (type_id, field_def_id, required)
       VALUES ($1, $2, $3)`,
      [typeId, field.fieldDefId, field.required],
    );
  }
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

    async getDraftByOpaque(opaqueId) {
      const result = await client.query(
        `SELECT * FROM activity_drafts
         WHERE LEFT(REPLACE(id::text, '-', ''), 12) = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [opaqueId],
      );
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
      const opaqueId = input.opaqueId ?? opaqueIdFromUuid(input.id);
      const result = await client.query(
        `INSERT INTO activities (
           id, guild_id, organization_id, type_id, name, description, start_at, end_at, status,
           enrollment_open, participant_limit, organizer_discord_user_id, organizer_v2_user_id,
           co_organizer_discord_user_id, co_organizer_v2_user_id, publication_channel_id,
           timezone, location_text, cancel_reason, cancelled_at, version, scheduled_finish_at,
           opaque_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
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
          opaqueId,
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

    async getActivityByOpaqueId(opaqueId) {
      const result = await client.query(`SELECT * FROM activities WHERE opaque_id = $1`, [
        opaqueId,
      ]);
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
        const id = randomUUID();
        const opaqueId = input.opaqueId ?? opaqueIdFromUuid(id);
        const inserted = await client.query(
          `INSERT INTO activity_hub_panels (
             id, organization_id, discord_guild_id, channel_id, message_id, panel_type,
             payload_version, status, opaque_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [
            id,
            input.organizationId,
            input.discordGuildId,
            input.channelId,
            input.messageId ?? null,
            input.panelType,
            input.payloadVersion ?? 1,
            input.status ?? 'unconfigured',
            opaqueId,
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

    async getPanelByOpaqueId(opaqueId) {
      const result = await client.query(`SELECT * FROM activity_hub_panels WHERE opaque_id = $1`, [
        opaqueId,
      ]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapPanel(row);
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

    async permanentFailOutbox(id, error) {
      await client.query(
        `UPDATE outbox_messages SET
           status = 'failed', last_error = $2,
           claim_owner = NULL, claim_expires_at = NULL, claimed_at = NULL
         WHERE id = $1`,
        [id, error],
      );
    },

    async listInbox(input) {
      const limit = Math.min(Math.max(input.limit, 1), 100);
      const cursorCreatedAt =
        input.cursor !== undefined && input.cursor.includes('|')
          ? input.cursor.split('|')[0]
          : null;
      const cursorId =
        input.cursor !== undefined && input.cursor.includes('|')
          ? input.cursor.split('|').slice(1).join('|')
          : null;

      const result = await client.query(
        `SELECT * FROM notification_inbox_items
         WHERE recipient_discord_user_id = $1
           AND (
             $2::timestamptz IS NULL
             OR created_at < $2::timestamptz
             OR (created_at = $2::timestamptz AND id < $3::uuid)
           )
         ORDER BY created_at DESC, id DESC
         LIMIT $4`,
        [input.discordUserId, cursorCreatedAt, cursorId, limit + 1],
      );
      const rows = result.rows.map((row) => mapInbox(row as Record<string, unknown>));
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const last = items[items.length - 1];
      return {
        items,
        nextCursor:
          hasMore && last !== undefined ? `${last.createdAt.toISOString()}|${last.id}` : null,
      };
    },

    async markInboxRead(id, discordUserId) {
      const result = await client.query(
        `UPDATE notification_inbox_items
         SET read_at = COALESCE(read_at, now())
         WHERE id = $1 AND recipient_discord_user_id = $2
         RETURNING *`,
        [id, discordUserId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Inbox item not found');
      }
      return mapInbox(row);
    },

    async enqueueInbox(input) {
      const id = randomUUID();
      const payload =
        input.dedupeKey !== undefined
          ? { ...input.payload, dedupeKey: input.dedupeKey }
          : input.payload;

      try {
        const result = await client.query(
          `INSERT INTO notification_inbox_items (
             id, guild_id, recipient_discord_user_id, kind, payload
           ) VALUES ($1,$2,$3,$4,$5::jsonb)
           RETURNING *`,
          [id, input.guildId, input.recipientDiscordUserId, input.kind, JSON.stringify(payload)],
        );
        return {
          item: mapInbox(result.rows[0] as Record<string, unknown>),
          created: true,
        };
      } catch (error) {
        if (!isUniqueViolation(error) || input.dedupeKey === undefined) {
          throw error;
        }
        const existing = await client.query(
          `SELECT * FROM notification_inbox_items
           WHERE recipient_discord_user_id = $1
             AND kind = $2
             AND payload->>'dedupeKey' = $3
           LIMIT 1`,
          [input.recipientDiscordUserId, input.kind, input.dedupeKey],
        );
        const row = existing.rows[0] as Record<string, unknown> | undefined;
        if (row === undefined) {
          throw error;
        }
        return { item: mapInbox(row), created: false };
      }
    },

    async createReport(input) {
      const result = await client.query(
        `INSERT INTO activity_reports (
           id, guild_id, activity_id, reporter_discord_user_id, reason_category, details
         ) VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [
          input.id,
          input.guildId,
          input.activityId,
          input.reporterDiscordUserId,
          input.reasonCategory,
          input.details ?? null,
        ],
      );
      return mapReport(result.rows[0] as Record<string, unknown>);
    },

    async listReports(guildId) {
      const result = await client.query(
        `SELECT * FROM activity_reports WHERE guild_id = $1 ORDER BY created_at DESC`,
        [guildId],
      );
      return result.rows.map((row) => mapReport(row as Record<string, unknown>));
    },

    async upsertActivityProjection(input) {
      const result = await client.query(
        `INSERT INTO activity_projections (
           activity_id, guild_id, channel_id, message_id, status, opaque_id,
           revision, last_error, retry_count, lease_owner, lease_expires_at,
           desired_payload_version, updated_at
         ) VALUES (
           $1,$2,$3,$4,COALESCE($5, 'pending'),$6,COALESCE($7, 1),$8,COALESCE($9, 0),$10,$11,COALESCE($12, 1), now()
         )
         ON CONFLICT (activity_id) DO UPDATE SET
           guild_id = EXCLUDED.guild_id,
           channel_id = EXCLUDED.channel_id,
           message_id = COALESCE($4, activity_projections.message_id),
           status = COALESCE($5, activity_projections.status),
           opaque_id = EXCLUDED.opaque_id,
           revision = CASE
             WHEN $7::integer IS NULL THEN activity_projections.revision + 1
             ELSE $7::integer
           END,
           last_error = $8,
           retry_count = COALESCE($9, activity_projections.retry_count),
           lease_owner = $10,
           lease_expires_at = $11,
           desired_payload_version = COALESCE($12, activity_projections.desired_payload_version),
           updated_at = now()
         RETURNING *`,
        [
          input.activityId,
          input.guildId,
          input.channelId,
          input.messageId === undefined ? null : input.messageId,
          input.status ?? null,
          input.opaqueId,
          input.revision ?? null,
          input.lastError === undefined ? null : input.lastError,
          input.retryCount ?? null,
          input.leaseOwner === undefined ? null : input.leaseOwner,
          input.leaseExpiresAt === undefined ? null : (input.leaseExpiresAt?.toISOString() ?? null),
          input.desiredPayloadVersion ?? null,
        ],
      );
      return mapProjection(result.rows[0] as Record<string, unknown>);
    },

    async getActivityProjection(activityId) {
      const result = await client.query(
        `SELECT * FROM activity_projections WHERE activity_id = $1`,
        [activityId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapProjection(row);
    },

    async claimProjectionRepair(input) {
      const result = await client.query(
        `WITH picked AS (
           SELECT activity_id FROM activity_projections
           WHERE status IN ('pending', 'failed', 'degraded', 'missing')
             AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
           ORDER BY updated_at
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE activity_projections p SET
           lease_owner = $3,
           lease_expires_at = $4,
           retry_count = retry_count + 1,
           status = 'pending',
           updated_at = $1
         FROM picked
         WHERE p.activity_id = picked.activity_id
         RETURNING p.*`,
        [
          input.now.toISOString(),
          input.limit,
          input.owner,
          new Date(input.now.getTime() + input.leaseSeconds * 1000).toISOString(),
        ],
      );
      return result.rows.map((row) => mapProjection(row as Record<string, unknown>));
    },

    async setAllowedPublishChannelIds(guildId, channelIds) {
      await client.query(
        `UPDATE guild_activity_settings
         SET allowed_publish_channel_ids = $2::text[],
             config_revision = config_revision + 1,
             updated_at = now()
         WHERE guild_id = $1`,
        [guildId, [...channelIds]],
      );
    },

    async putGuildAdminConfig(guildId, input) {
      const locked = await client.query(
        `SELECT * FROM guild_activity_settings WHERE guild_id = $1 FOR UPDATE`,
        [guildId],
      );
      const currentRow = locked.rows[0] as Record<string, unknown> | undefined;
      if (currentRow === undefined) {
        throw new ActivityError('NOT_FOUND', 'Guild settings not found');
      }
      const current = mapSettings(currentRow);
      if (current.configRevision !== input.expectedRevision) {
        throw new ActivityError(
          'CONFLICT',
          `Config revision mismatch: expected ${input.expectedRevision}, actual ${current.configRevision}`,
        );
      }

      const nextOrganizer =
        input.organizerDefaultStatusId !== undefined
          ? input.organizerDefaultStatusId
          : current.organizerDefaultStatusId;
      const nextWaitlist =
        input.waitlistPromotionStatusId !== undefined
          ? input.waitlistPromotionStatusId
          : current.waitlistPromotionStatusId;
      const nextChannels =
        input.allowedPublishChannelIds !== undefined
          ? input.allowedPublishChannelIds
          : current.allowedPublishChannelIds;
      const nextPingRoles =
        input.pingRoleIds !== undefined ? input.pingRoleIds : current.pingRoleIds;
      const nextReminders = input.reminders !== undefined ? input.reminders : current.reminders;

      const result = await client.query(
        `UPDATE guild_activity_settings SET
           organizer_default_status_id = $2,
           waitlist_promotion_status_id = $3,
           max_active_per_creator = $4,
           registration_default_closes_at_start = $5,
           allow_other_activity = $6,
           max_create_horizon_days = $7,
           post_retention_hours_after_finish = $8,
           reminders_json = $9::jsonb,
           dm_notifications_enabled = $10,
           allowed_publish_channel_ids = $11::text[],
           ping_role_ids = $12::text[],
           hub_channel_id = $13,
           config_revision = config_revision + 1,
           updated_at = now()
         WHERE guild_id = $1
         RETURNING *`,
        [
          guildId,
          nextOrganizer,
          nextWaitlist,
          input.maxActivePerCreator ?? current.maxActivePerCreator,
          input.registrationDefaultClosesAtStart ?? current.registrationDefaultClosesAtStart,
          input.allowOtherActivity ?? current.allowOtherActivity,
          input.maxCreateHorizonDays ?? current.maxCreateHorizonDays,
          input.postRetentionHoursAfterFinish ?? current.postRetentionHoursAfterFinish,
          JSON.stringify(nextReminders),
          input.dmNotificationsEnabled ?? current.dmNotificationsEnabled,
          [...nextChannels],
          [...nextPingRoles],
          input.hubChannelId !== undefined ? input.hubChannelId : current.hubChannelId,
        ],
      );
      return mapSettings(result.rows[0] as Record<string, unknown>);
    },

    async setPingRoleIds(guildId, roleIds) {
      const result = await client.query(
        `UPDATE guild_activity_settings
         SET ping_role_ids = $2::text[],
             config_revision = config_revision + 1,
             updated_at = now()
         WHERE guild_id = $1
         RETURNING *`,
        [guildId, [...roleIds]],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Guild settings not found');
      }
      return mapSettings(row);
    },

    async setHubChannelId(guildId, channelId) {
      const result = await client.query(
        `UPDATE guild_activity_settings
         SET hub_channel_id = $2,
             config_revision = config_revision + 1,
             updated_at = now()
         WHERE guild_id = $1
         RETURNING *`,
        [guildId, channelId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Guild settings not found');
      }
      return mapSettings(row);
    },

    async listActivityTypes(guildId) {
      const result = await client.query(
        `SELECT * FROM activity_types WHERE guild_id = $1 ORDER BY sort_order, key`,
        [guildId],
      );
      const types: ActivityTypeRecord[] = [];
      for (const row of result.rows) {
        types.push(await loadActivityType(client, row as Record<string, unknown>));
      }
      return types;
    },

    async getActivityType(id) {
      const result = await client.query(`SELECT * FROM activity_types WHERE id = $1`, [id]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      return loadActivityType(client, row);
    },

    async insertActivityType(input) {
      const result = await client.query(
        `INSERT INTO activity_types (
           id, guild_id, key, label, enabled, is_other, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          input.id,
          input.guildId,
          input.key,
          input.label,
          input.enabled ?? true,
          input.isOther ?? false,
          input.sortOrder ?? 0,
        ],
      );
      await replaceTypeAssociations(client, input.id, {
        statusDefIds: input.statusDefIds ?? [],
        participantFields: input.participantFields ?? [],
      });
      return loadActivityType(client, result.rows[0] as Record<string, unknown>);
    },

    async updateActivityType(id, patch) {
      const existing = await client.query(`SELECT * FROM activity_types WHERE id = $1`, [id]);
      const existingRow = existing.rows[0] as Record<string, unknown> | undefined;
      if (existingRow === undefined) {
        throw new ActivityError('NOT_FOUND', 'Activity type not found');
      }
      const result = await client.query(
        `UPDATE activity_types SET
           label = COALESCE($2, label),
           enabled = COALESCE($3, enabled),
           is_other = COALESCE($4, is_other),
           sort_order = COALESCE($5, sort_order),
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.label ?? null,
          patch.enabled ?? null,
          patch.isOther ?? null,
          patch.sortOrder ?? null,
        ],
      );
      if (patch.statusDefIds !== undefined || patch.participantFields !== undefined) {
        const current = await loadActivityType(client, existingRow);
        await replaceTypeAssociations(client, id, {
          statusDefIds: patch.statusDefIds ?? current.statusDefIds,
          participantFields: patch.participantFields ?? current.participantFields,
        });
      }
      return loadActivityType(client, result.rows[0] as Record<string, unknown>);
    },

    async countActivitiesUsingType(typeId) {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM activities WHERE type_id = $1`,
        [typeId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },

    async deactivateActivityType(id) {
      const result = await client.query(
        `UPDATE activity_types SET enabled = FALSE, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Activity type not found');
      }
      return loadActivityType(client, row);
    },

    async insertStatusDef(input) {
      const result = await client.query(
        `INSERT INTO participation_status_defs (
           id, guild_id, label, occupies_slot, behavior, selectable_by_member, active, sort_order, seed_key
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          input.id,
          input.guildId,
          input.label,
          input.occupiesSlot,
          input.behavior,
          input.selectableByMember,
          input.active ?? true,
          input.sortOrder ?? 0,
          input.seedKey ?? null,
        ],
      );
      return mapStatus(result.rows[0] as Record<string, unknown>);
    },

    async updateStatusDef(id, patch) {
      const result = await client.query(
        `UPDATE participation_status_defs SET
           label = COALESCE($2, label),
           occupies_slot = COALESCE($3, occupies_slot),
           behavior = COALESCE($4, behavior),
           selectable_by_member = COALESCE($5, selectable_by_member),
           active = COALESCE($6, active),
           sort_order = COALESCE($7, sort_order),
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.label ?? null,
          patch.occupiesSlot ?? null,
          patch.behavior ?? null,
          patch.selectableByMember ?? null,
          patch.active ?? null,
          patch.sortOrder ?? null,
        ],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Status definition not found');
      }
      return mapStatus(row);
    },

    async deactivateStatusDef(id) {
      return this.updateStatusDef(id, { active: false });
    },

    async countParticipationsUsingStatus(statusDefId) {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM participations
         WHERE status_def_id = $1 AND resigned_at IS NULL AND removed_at IS NULL`,
        [statusDefId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },

    async listParticipantFieldDefs(guildId) {
      const result = await client.query(
        `SELECT * FROM participant_field_defs WHERE guild_id = $1 ORDER BY sort_order, key`,
        [guildId],
      );
      return result.rows.map((row) => mapParticipantField(row as Record<string, unknown>));
    },

    async getParticipantFieldDef(id) {
      const result = await client.query(`SELECT * FROM participant_field_defs WHERE id = $1`, [id]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapParticipantField(row);
    },

    async insertParticipantFieldDef(input) {
      const result = await client.query(
        `INSERT INTO participant_field_defs (
           id, guild_id, key, label, field_type, required_default, active, options_json, max_length, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
         RETURNING *`,
        [
          input.id,
          input.guildId,
          input.key,
          input.label,
          input.fieldType,
          input.requiredDefault ?? false,
          input.active ?? true,
          JSON.stringify(input.optionsJson ?? []),
          input.maxLength ?? null,
          input.sortOrder ?? 0,
        ],
      );
      return mapParticipantField(result.rows[0] as Record<string, unknown>);
    },

    async updateParticipantFieldDef(id, patch) {
      const existing = await this.getParticipantFieldDef(id);
      if (existing === null) {
        throw new ActivityError('NOT_FOUND', 'Participant field not found');
      }
      const result = await client.query(
        `UPDATE participant_field_defs SET
           label = COALESCE($2, label),
           field_type = COALESCE($3, field_type),
           required_default = COALESCE($4, required_default),
           active = COALESCE($5, active),
           options_json = COALESCE($6::jsonb, options_json),
           max_length = CASE WHEN $7::boolean THEN $8 ELSE max_length END,
           sort_order = COALESCE($9, sort_order),
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.label ?? null,
          patch.fieldType ?? null,
          patch.requiredDefault ?? null,
          patch.active ?? null,
          patch.optionsJson !== undefined ? JSON.stringify(patch.optionsJson) : null,
          patch.maxLength !== undefined,
          patch.maxLength ?? null,
          patch.sortOrder ?? null,
        ],
      );
      return mapParticipantField(result.rows[0] as Record<string, unknown>);
    },

    async deactivateParticipantFieldDef(id) {
      return this.updateParticipantFieldDef(id, { active: false });
    },

    async listReportReasonDefs(guildId) {
      const result = await client.query(
        `SELECT * FROM activity_report_reason_defs WHERE guild_id = $1 ORDER BY sort_order, key`,
        [guildId],
      );
      return result.rows.map((row) => mapReportReason(row as Record<string, unknown>));
    },

    async getReportReasonDef(id) {
      const result = await client.query(`SELECT * FROM activity_report_reason_defs WHERE id = $1`, [
        id,
      ]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapReportReason(row);
    },

    async insertReportReasonDef(input) {
      const result = await client.query(
        `INSERT INTO activity_report_reason_defs (
           id, guild_id, key, label, active, sort_order, allow_details, requires_details
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          input.id,
          input.guildId,
          input.key,
          input.label,
          input.active ?? true,
          input.sortOrder ?? 0,
          input.allowDetails ?? true,
          input.requiresDetails ?? false,
        ],
      );
      return mapReportReason(result.rows[0] as Record<string, unknown>);
    },

    async updateReportReasonDef(id, patch) {
      const result = await client.query(
        `UPDATE activity_report_reason_defs SET
           label = COALESCE($2, label),
           active = COALESCE($3, active),
           sort_order = COALESCE($4, sort_order),
           allow_details = COALESCE($5, allow_details),
           requires_details = COALESCE($6, requires_details),
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          patch.label ?? null,
          patch.active ?? null,
          patch.sortOrder ?? null,
          patch.allowDetails ?? null,
          patch.requiresDetails ?? null,
        ],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Report reason not found');
      }
      return mapReportReason(row);
    },

    async deactivateReportReasonDef(id) {
      return this.updateReportReasonDef(id, { active: false });
    },

    async listAdminEvents(filters) {
      const params: unknown[] = [filters.guildId];
      const where: string[] = [`guild_id = $1`, `status <> 'deleted'`];
      if (filters.status !== undefined) {
        params.push(filters.status);
        where.push(`status = $${params.length}::activity_status`);
      }
      if (filters.organizerDiscordUserId !== undefined) {
        params.push(filters.organizerDiscordUserId);
        where.push(`organizer_discord_user_id = $${params.length}`);
      }
      if (filters.from !== undefined) {
        params.push(filters.from.toISOString());
        where.push(`start_at >= $${params.length}`);
      }
      if (filters.to !== undefined) {
        params.push(filters.to.toISOString());
        where.push(`start_at <= $${params.length}`);
      }
      const whereSql = where.join(' AND ');
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM activities WHERE ${whereSql}`,
        params,
      );
      params.push(filters.limit);
      params.push(filters.offset);
      const result = await client.query(
        `SELECT * FROM activities
         WHERE ${whereSql}
         ORDER BY start_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return {
        items: result.rows.map((row) => mapActivity(row as Record<string, unknown>)),
        total: Number(countResult.rows[0]?.count ?? 0),
      };
    },

    async listProjectionProblems(guildId) {
      const result = await client.query(
        `SELECT * FROM activity_projections
         WHERE guild_id = $1
           AND status = ANY($2::text[])
         ORDER BY updated_at DESC`,
        [guildId, ['pending', 'failed', 'degraded', 'missing']],
      );
      return result.rows.map((row) => mapProjection(row as Record<string, unknown>));
    },

    async updateReportStatus(id, guildId, status) {
      const result = await client.query(
        `UPDATE activity_reports SET status = $3
         WHERE id = $1 AND guild_id = $2
         RETURNING *`,
        [id, guildId, status],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Report not found');
      }
      return mapReport(row);
    },

    async getReport(id) {
      const result = await client.query(`SELECT * FROM activity_reports WHERE id = $1`, [id]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapReport(row);
    },

    async listAuditEntries(filters) {
      const params: unknown[] = [filters.guildId];
      const where: string[] = [`guild_id = $1`];
      if (filters.actionPrefix !== undefined) {
        params.push(`${filters.actionPrefix}%`);
        where.push(`action LIKE $${params.length}`);
      }
      if (filters.activityId !== undefined) {
        params.push(filters.activityId);
        where.push(`activity_id = $${params.length}`);
      }
      if (filters.actorDiscordUserId !== undefined) {
        params.push(filters.actorDiscordUserId);
        where.push(`actor_discord_user_id = $${params.length}`);
      }
      if (filters.from !== undefined) {
        params.push(filters.from.toISOString());
        where.push(`created_at >= $${params.length}`);
      }
      if (filters.to !== undefined) {
        params.push(filters.to.toISOString());
        where.push(`created_at <= $${params.length}`);
      }
      const whereSql = where.join(' AND ');
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM activity_audit_entries WHERE ${whereSql}`,
        params,
      );
      params.push(filters.limit);
      params.push(filters.offset);
      const result = await client.query(
        `SELECT * FROM activity_audit_entries
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return {
        items: result.rows.map((row) => mapAudit(row as Record<string, unknown>)),
        total: Number(countResult.rows[0]?.count ?? 0),
      };
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
