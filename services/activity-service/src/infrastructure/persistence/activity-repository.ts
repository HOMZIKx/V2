import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

import type {
  ActivityDraftRecord,
  ActivityProjectionRecord,
  ActivityPublicationTargetRecord,
  ActivityRecord,
  ActivityReportRecord,
  ActivityRepositoryPort,
  ActivitySeriesRecord,
  ActivityTx,
  ActivityTypeRecord,
  AttendanceRecord,
  AuditEntryRecord,
  GuildActivitySettingsRecord,
  HubPanelRecord,
  IdempotencyHit,
  InboxItemRecord,
  OutboxHealthSnapshot,
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
  const scheduleKindRaw = asNullableString(row.schedule_kind) ?? 'exact';
  const periodKeyRaw = asNullableString(row.period_key);
  return {
    id,
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    organizationId: asRequiredString(row.organization_id, 'organization_id'),
    typeId: asNullableString(row.type_id),
    name: asRequiredString(row.name, 'name'),
    description: asRequiredString(row.description, 'description'),
    startAt: asRequiredDate(row.start_at, 'start_at'),
    endAt: asNullableDate(row.end_at),
    scheduleKind: scheduleKindRaw as ActivityRecord['scheduleKind'],
    periodKey: (periodKeyRaw as ActivityRecord['periodKey']) ?? null,
    scheduleHasExplicitTime:
      row.schedule_has_explicit_time === undefined || row.schedule_has_explicit_time === null
        ? true
        : Boolean(row.schedule_has_explicit_time),
    status: asRequiredString(row.status, 'status') as ActivityStatus,
    enrollmentOpen: Boolean(row.enrollment_open),
    participantLimit:
      row.participant_limit === null || row.participant_limit === undefined
        ? null
        : Number(row.participant_limit),
    participantMode: asNullableString(row.participant_mode) === 'separate' ? 'separate' : 'shared',
    seriesId: asNullableString(row.series_id),
    seriesOccurrenceIndex:
      row.series_occurrence_index === null || row.series_occurrence_index === undefined
        ? null
        : Number(row.series_occurrence_index),
    visibility: asNullableString(row.visibility) === 'private' ? 'private' : 'public',
    privateInviteTokenHash: asNullableString(row.private_invite_token_hash),
    privateRoleIds: Array.isArray(row.private_role_ids)
      ? (row.private_role_ids as unknown[]).map((v) => String(v))
      : [],
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
    scopeGuildId: asNullableString(row.scope_guild_id),
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
    notificationClass: asNullableString(row.notification_class) ?? 'TRANSACTIONAL',
    title: asNullableString(row.title),
    body: asNullableString(row.body),
    deepLink: asNullableString(row.deep_link),
    fingerprint: asNullableString(row.fingerprint),
    interestKey: asNullableString(row.interest_key),
    activityId: asNullableString(row.activity_id),
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

function mapSeries(row: Record<string, unknown>): ActivitySeriesRecord {
  const weekdaysRaw = row.weekdays;
  const weekdays = Array.isArray(weekdaysRaw)
    ? weekdaysRaw.map((v) => Number(v)).filter((n) => Number.isInteger(n))
    : [];
  const recurrence = asNullableString(row.recurrence_kind) ?? 'weekly';
  return {
    id: asRequiredString(row.id, 'id'),
    organizationId: asRequiredString(row.organization_id, 'organization_id'),
    homeGuildId: asRequiredString(row.home_guild_id, 'home_guild_id'),
    creatorDiscordUserId: asNullableString(row.creator_discord_user_id),
    creatorV2UserId: asNullableString(row.creator_v2_user_id),
    recurrenceKind:
      recurrence === 'daily' || recurrence === 'weekdays' || recurrence === 'weekly'
        ? recurrence
        : 'weekly',
    weekdays,
    timezone: asRequiredString(row.timezone, 'timezone'),
    timeOfDay: asRequiredString(row.time_of_day, 'time_of_day'),
    horizonEndAt: asRequiredDate(row.horizon_end_at, 'horizon_end_at'),
    templatePayload: (row.template_payload ?? {}) as Record<string, unknown>,
    status: (asNullableString(row.status) ?? 'active') as ActivitySeriesRecord['status'],
    opaqueId: asRequiredString(row.opaque_id, 'opaque_id'),
    version: Number(row.version ?? 1),
    createdAt: asRequiredDate(row.created_at, 'created_at'),
    updatedAt: asRequiredDate(row.updated_at, 'updated_at'),
  };
}

function mapAttendance(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    activityId: asRequiredString(row.activity_id, 'activity_id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    subjectDiscordUserId: asRequiredString(row.subject_discord_user_id, 'subject_discord_user_id'),
    markedByDiscordUserId: asRequiredString(
      row.marked_by_discord_user_id,
      'marked_by_discord_user_id',
    ),
    status: asRequiredString(row.status, 'status') as AttendanceRecord['status'],
    markedAt: asRequiredDate(row.marked_at, 'marked_at'),
  };
}

function mapProjection(row: Record<string, unknown>): ActivityProjectionRecord {
  const activityId = asRequiredString(row.activity_id, 'activity_id');
  return {
    id: asNullableString(row.id) ?? activityId,
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

function mapPublicationTarget(row: Record<string, unknown>): ActivityPublicationTargetRecord {
  return {
    id: asRequiredString(row.id, 'id'),
    activityId: asRequiredString(row.activity_id, 'activity_id'),
    organizationId: asRequiredString(row.organization_id, 'organization_id'),
    guildId: asRequiredString(row.guild_id, 'guild_id'),
    channelId: asRequiredString(row.channel_id, 'channel_id'),
    participantLimit:
      row.participant_limit === null || row.participant_limit === undefined
        ? null
        : Number(row.participant_limit),
    sortOrder: Number(row.sort_order ?? 0),
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
           enrollment_open, participant_limit, participant_mode,
           organizer_discord_user_id, organizer_v2_user_id,
           co_organizer_discord_user_id, co_organizer_v2_user_id, publication_channel_id,
           timezone, location_text, cancel_reason, cancelled_at, version, scheduled_finish_at,
           opaque_id, schedule_kind, period_key, schedule_has_explicit_time,
           series_id, series_occurrence_index, visibility, private_invite_token_hash, private_role_ids
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
           $28,$29,$30,$31,$32
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
          input.participantMode ?? 'shared',
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
          input.scheduleKind,
          input.periodKey,
          input.scheduleHasExplicitTime,
          input.seriesId ?? null,
          input.seriesOccurrenceIndex ?? null,
          input.visibility ?? 'public',
          input.privateInviteTokenHash ?? null,
          input.privateRoleIds ?? [],
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
           organizer_v2_user_id = $19, type_id = $20,
           schedule_kind = $21, period_key = $22, schedule_has_explicit_time = $23,
           series_id = $24, series_occurrence_index = $25, visibility = $26,
           private_invite_token_hash = $27, private_role_ids = $28,
           updated_at = now()
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
          activity.scheduleKind,
          activity.periodKey,
          activity.scheduleHasExplicitTime,
          activity.seriesId,
          activity.seriesOccurrenceIndex,
          activity.visibility,
          activity.privateInviteTokenHash,
          [...activity.privateRoleIds],
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
        `SELECT * FROM activities WHERE guild_id = $1 AND status <> 'deleted' ORDER BY start_at LIMIT 200`,
        [guildId],
      );
      return result.rows.map((row) => mapActivity(row as Record<string, unknown>));
    },

    async listActivitiesBySeries(seriesId) {
      const result = await client.query(
        `SELECT * FROM activities
         WHERE series_id = $1 AND status <> 'deleted'
         ORDER BY series_occurrence_index NULLS LAST, start_at`,
        [seriesId],
      );
      return result.rows.map((row) => mapActivity(row as Record<string, unknown>));
    },

    async insertSeries(input) {
      const opaqueId = input.opaqueId ?? opaqueIdFromUuid(input.id);
      const result = await client.query(
        `INSERT INTO activity_series (
           id, organization_id, home_guild_id, creator_discord_user_id, creator_v2_user_id,
           recurrence_kind, weekdays, timezone, time_of_day, horizon_end_at,
           template_payload, status, opaque_id, version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7::smallint[],$8,$9,$10,$11::jsonb,$12,$13,$14
         ) RETURNING *`,
        [
          input.id,
          input.organizationId,
          input.homeGuildId,
          input.creatorDiscordUserId,
          input.creatorV2UserId,
          input.recurrenceKind,
          input.weekdays,
          input.timezone,
          input.timeOfDay,
          input.horizonEndAt.toISOString(),
          JSON.stringify(input.templatePayload),
          input.status,
          opaqueId,
          input.version ?? 1,
        ],
      );
      return mapSeries(result.rows[0] as Record<string, unknown>);
    },

    async getSeries(id) {
      const result = await client.query(`SELECT * FROM activity_series WHERE id = $1`, [id]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapSeries(row);
    },

    async updateSeries(series) {
      const result = await client.query(
        `UPDATE activity_series SET
           recurrence_kind = $2, weekdays = $3::smallint[], timezone = $4, time_of_day = $5,
           horizon_end_at = $6, template_payload = $7::jsonb, status = $8, version = $9,
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          series.id,
          series.recurrenceKind,
          series.weekdays,
          series.timezone,
          series.timeOfDay,
          series.horizonEndAt.toISOString(),
          JSON.stringify(series.templatePayload),
          series.status,
          series.version,
        ],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Series not found');
      }
      return mapSeries(row);
    },

    async upsertAttendance(input) {
      const markedAt = input.markedAt ?? new Date();
      const result = await client.query(
        `INSERT INTO activity_attendance_records (
           id, activity_id, guild_id, subject_discord_user_id, marked_by_discord_user_id,
           status, marked_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (activity_id, subject_discord_user_id) DO UPDATE SET
           status = EXCLUDED.status,
           marked_by_discord_user_id = EXCLUDED.marked_by_discord_user_id,
           marked_at = EXCLUDED.marked_at
         RETURNING *`,
        [
          input.id,
          input.activityId,
          input.guildId,
          input.subjectDiscordUserId,
          input.markedByDiscordUserId,
          input.status,
          markedAt.toISOString(),
        ],
      );
      return mapAttendance(result.rows[0] as Record<string, unknown>);
    },

    async listAttendance(activityId) {
      const result = await client.query(
        `SELECT * FROM activity_attendance_records WHERE activity_id = $1 ORDER BY marked_at`,
        [activityId],
      );
      return result.rows.map((row) => mapAttendance(row as Record<string, unknown>));
    },

    async listAttendanceForSubject(input) {
      const result = await client.query(
        `SELECT * FROM activity_attendance_records
         WHERE guild_id = $1 AND subject_discord_user_id = $2
         ORDER BY marked_at DESC
         LIMIT 500`,
        [input.guildId, input.subjectDiscordUserId],
      );
      return result.rows.map((row) => mapAttendance(row as Record<string, unknown>));
    },

    async listAttendanceForGuild(guildId) {
      const result = await client.query(
        `SELECT * FROM activity_attendance_records
         WHERE guild_id = $1
         ORDER BY marked_at DESC
         LIMIT 2000`,
        [guildId],
      );
      return result.rows.map((row) => mapAttendance(row as Record<string, unknown>));
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
         ORDER BY a.start_at
         LIMIT 200`,
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

    async listParticipationsForActivities(activityIds) {
      if (activityIds.length === 0) {
        return [];
      }
      const result = await client.query(
        `SELECT p.*, s.occupies_slot, s.behavior AS status_behavior
         FROM participations p
         JOIN participation_status_defs s ON s.id = p.status_def_id
         WHERE p.activity_id = ANY($1::uuid[])
         ORDER BY p.created_at`,
        [activityIds],
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
      const scopeGuildId = input.scopeGuildId ?? null;
      const existing = input.discordUserId
        ? await client.query(
            `SELECT id FROM participations
             WHERE activity_id = $1 AND discord_user_id = $2
               AND ((scope_guild_id IS NULL AND $3::text IS NULL)
                    OR scope_guild_id = $3)
               AND resigned_at IS NULL AND removed_at IS NULL
             LIMIT 1`,
            [input.activityId, input.discordUserId, scopeGuildId],
          )
        : { rows: [] as { id: string }[] };

      const existingId = (existing.rows[0] as { id: string } | undefined)?.id;
      if (existingId !== undefined) {
        const result = await client.query(
          `UPDATE participations SET
             status_def_id = $2, confirmation_state = $3, reconfirm_deadline = $4,
             waitlist_position = $5, scope_guild_id = $6, updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [
            existingId,
            input.statusDefId,
            input.confirmationState,
            input.reconfirmDeadline?.toISOString() ?? null,
            input.waitlistPosition,
            scopeGuildId,
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
           confirmation_state, reconfirm_deadline, waitlist_position, scope_guild_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          input.activityId,
          input.discordUserId,
          input.v2UserId,
          input.statusDefId,
          input.confirmationState,
          input.reconfirmDeadline?.toISOString() ?? null,
          input.waitlistPosition,
          scopeGuildId,
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

    async getLatestPendingPublishOccurrence(panelId) {
      const result = await client.query(
        `SELECT operation_id, nonce, payload_version, desired_channel_id, correlation_id
         FROM panel_publish_occurrences
         WHERE panel_id = $1 AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        [panelId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      return {
        operationId: asRequiredString(row.operation_id, 'operation_id'),
        nonce: asRequiredString(row.nonce, 'nonce'),
        payloadVersion: Number(row.payload_version),
        desiredChannelId: asRequiredString(row.desired_channel_id, 'desired_channel_id'),
        correlationId: asNullableString(row.correlation_id),
      };
    },

    async updatePublishOccurrenceStatus(input) {
      await client.query(
        `UPDATE panel_publish_occurrences
         SET status = $3
         WHERE panel_id = $1 AND operation_id = $2`,
        [input.panelId, input.operationId, input.status],
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
           WHERE (
             (status = 'pending' AND available_at <= $1)
             OR (
               status = 'claimed'
               AND claim_expires_at IS NOT NULL
               AND claim_expires_at <= $1
             )
           )
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
             id, guild_id, recipient_discord_user_id, kind, payload,
             notification_class, title, body, deep_link, fingerprint, interest_key, activity_id
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            id,
            input.guildId,
            input.recipientDiscordUserId,
            input.kind,
            JSON.stringify(payload),
            input.notificationClass ?? 'TRANSACTIONAL',
            input.title ?? null,
            input.body ?? null,
            input.deepLink ?? null,
            input.fingerprint ?? null,
            input.interestKey ?? null,
            input.activityId ?? null,
          ],
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

    async getNotificationPreference(guildId, recipientDiscordUserId) {
      const result = await client.query(
        `SELECT * FROM notification_preferences
         WHERE guild_id = $1 AND recipient_discord_user_id = $2`,
        [guildId, recipientDiscordUserId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      return {
        userDiscordId: asRequiredString(row.recipient_discord_user_id, 'recipient'),
        guildId: asRequiredString(row.guild_id, 'guild_id'),
        dmEnabled: row.dm_enabled === undefined ? true : Boolean(row.dm_enabled),
        mutedInterestKeys: Array.isArray(row.muted_interest_keys)
          ? row.muted_interest_keys.map(String)
          : [],
        mutedActivityTypeKeys: Array.isArray(row.muted_activity_type_keys)
          ? row.muted_activity_type_keys.map(String)
          : [],
        mutedActivityIds: Array.isArray(row.muted_activity_ids)
          ? row.muted_activity_ids.map(String)
          : [],
      };
    },

    async upsertNotificationPreference(input) {
      const current = await this.getNotificationPreference(
        input.guildId,
        input.recipientDiscordUserId,
      );
      const dmEnabled = input.dmEnabled ?? current?.dmEnabled ?? true;
      const mutedInterestKeys = input.mutedInterestKeys ?? current?.mutedInterestKeys ?? [];
      const mutedActivityTypeKeys =
        input.mutedActivityTypeKeys ?? current?.mutedActivityTypeKeys ?? [];
      const mutedActivityIds = input.mutedActivityIds ?? current?.mutedActivityIds ?? [];
      await client.query(
        `INSERT INTO notification_preferences (
           guild_id, recipient_discord_user_id, dm_enabled,
           muted_interest_keys, muted_activity_type_keys, muted_activity_ids, updated_at
         ) VALUES ($1,$2,$3,$4::text[],$5::text[],$6::uuid[], now())
         ON CONFLICT (guild_id, recipient_discord_user_id) DO UPDATE SET
           dm_enabled = EXCLUDED.dm_enabled,
           muted_interest_keys = EXCLUDED.muted_interest_keys,
           muted_activity_type_keys = EXCLUDED.muted_activity_type_keys,
           muted_activity_ids = EXCLUDED.muted_activity_ids,
           updated_at = now()`,
        [
          input.guildId,
          input.recipientDiscordUserId,
          dmEnabled,
          mutedInterestKeys,
          mutedActivityTypeKeys,
          mutedActivityIds,
        ],
      );
      return {
        userDiscordId: input.recipientDiscordUserId,
        guildId: input.guildId,
        dmEnabled,
        mutedInterestKeys,
        mutedActivityTypeKeys,
        mutedActivityIds,
      };
    },

    async getNotificationDedupeMemory(recipientDiscordUserId, dedupeKey) {
      const result = await client.query(
        `SELECT fingerprint, last_notified_at
         FROM notification_dedupe_memory
         WHERE recipient_discord_user_id = $1 AND dedupe_key = $2`,
        [recipientDiscordUserId, dedupeKey],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      return {
        fingerprint: asRequiredString(row.fingerprint, 'fingerprint'),
        lastNotifiedAt: asRequiredDate(row.last_notified_at, 'last_notified_at'),
      };
    },

    async upsertNotificationDedupeMemory(input) {
      await client.query(
        `INSERT INTO notification_dedupe_memory (
           recipient_discord_user_id, dedupe_key, fingerprint, last_notified_at
         ) VALUES ($1,$2,$3,$4)
         ON CONFLICT (recipient_discord_user_id, dedupe_key) DO UPDATE SET
           fingerprint = EXCLUDED.fingerprint,
           last_notified_at = EXCLUDED.last_notified_at`,
        [
          input.recipientDiscordUserId,
          input.dedupeKey,
          input.fingerprint,
          input.lastNotifiedAt.toISOString(),
        ],
      );
    },

    async recordNotificationDeliveryAttempt(input) {
      await client.query(
        `INSERT INTO notification_delivery_attempts (
           inbox_item_id, channel, status, attempt_number, error_detail
         ) VALUES ($1::uuid,$2,$3,$4,$5)`,
        [
          input.inboxItemId,
          input.channel,
          input.status,
          input.attemptNumber,
          input.errorDetail ?? null,
        ],
      );
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

    async replacePublicationTargets(activityId, targets) {
      await client.query(`DELETE FROM activity_publication_targets WHERE activity_id = $1`, [
        activityId,
      ]);
      const records: ActivityPublicationTargetRecord[] = [];
      for (const [index, target] of targets.entries()) {
        const id = randomUUID();
        const result = await client.query(
          `INSERT INTO activity_publication_targets (
             id, activity_id, organization_id, guild_id, channel_id,
             participant_limit, sort_order
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [
            id,
            activityId,
            target.organizationId,
            target.guildId,
            target.channelId,
            target.participantLimit ?? null,
            target.sortOrder ?? index,
          ],
        );
        records.push(mapPublicationTarget(result.rows[0] as Record<string, unknown>));
      }
      return records;
    },

    async listPublicationTargets(activityId) {
      const result = await client.query(
        `SELECT * FROM activity_publication_targets
         WHERE activity_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [activityId],
      );
      return result.rows.map((row) => mapPublicationTarget(row as Record<string, unknown>));
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
         ON CONFLICT (activity_id, guild_id) DO UPDATE SET
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
        `SELECT * FROM activity_projections WHERE activity_id = $1 ORDER BY updated_at DESC`,
        [activityId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : mapProjection(row);
    },

    async getActivityProjectionForGuild(activityId, guildId) {
      const result = await client.query(
        `SELECT * FROM activity_projections WHERE activity_id = $1 AND guild_id = $2 LIMIT 1`,
        [activityId, guildId],
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

    async listHubLegacyChannels(guildId) {
      const result = await client.query(
        `SELECT id::text, channel_id, label, related_module_key, status, notes
         FROM hub_legacy_channels
         WHERE guild_id = $1
         ORDER BY label ASC`,
        [guildId],
      );
      return result.rows.map((row) => ({
        id: String((row as { id: unknown }).id),
        channelId: String((row as { channel_id: unknown }).channel_id),
        label: String((row as { label: unknown }).label),
        relatedModuleKey:
          (row as { related_module_key: unknown }).related_module_key === null ||
          (row as { related_module_key: unknown }).related_module_key === undefined
            ? null
            : String((row as { related_module_key: unknown }).related_module_key),
        status: String((row as { status: unknown }).status) as
          'LEGACY_ACTIVE' | 'V2_READY' | 'OWNER_CAN_RETIRE',
        notes:
          (row as { notes: unknown }).notes === null ||
          (row as { notes: unknown }).notes === undefined
            ? null
            : String((row as { notes: unknown }).notes),
      }));
    },

    async upsertHubLegacyChannel(input) {
      const result = await client.query(
        `INSERT INTO hub_legacy_channels (
           guild_id, channel_id, label, related_module_key, status, notes
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (guild_id, channel_id) DO UPDATE SET
           label = EXCLUDED.label,
           related_module_key = EXCLUDED.related_module_key,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           updated_at = now()
         RETURNING id::text, channel_id, label, related_module_key, status, notes`,
        [
          input.guildId,
          input.channelId,
          input.label,
          input.relatedModuleKey ?? null,
          input.status,
          input.notes ?? null,
        ],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new ActivityError('VALIDATION_FAILED', 'Failed to upsert legacy channel');
      }
      return {
        id: String(row.id),
        channelId: String(row.channel_id),
        label: String(row.label),
        relatedModuleKey: asNullableString(row.related_module_key),
        status: String(row.status) as 'LEGACY_ACTIVE' | 'V2_READY' | 'OWNER_CAN_RETIRE',
        notes: asNullableString(row.notes),
      };
    },

    async getHubModuleOverrides(guildId) {
      const result = await client.query(
        `SELECT hub_module_overrides FROM guild_activity_settings WHERE guild_id = $1`,
        [guildId],
      );
      const row = result.rows[0] as { hub_module_overrides?: unknown } | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Guild settings not found');
      }
      const raw = row.hub_module_overrides;
      if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
      }
      const overrides: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'boolean') {
          overrides[key] = value;
        }
      }
      return overrides;
    },

    async setHubModuleOverrides(guildId, overrides) {
      const result = await client.query(
        `UPDATE guild_activity_settings
         SET hub_module_overrides = $2::jsonb,
             config_revision = config_revision + 1,
             updated_at = now()
         WHERE guild_id = $1
         RETURNING hub_module_overrides`,
        [guildId, JSON.stringify(overrides)],
      );
      const row = result.rows[0] as { hub_module_overrides?: unknown } | undefined;
      if (row === undefined) {
        throw new ActivityError('NOT_FOUND', 'Guild settings not found');
      }
      const raw = row.hub_module_overrides;
      if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
      }
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'boolean') {
          next[key] = value;
        }
      }
      return next;
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

  public async countOutboxByStatus(): Promise<OutboxHealthSnapshot> {
    const result = await this.pool.query<{ status: string; n: string; retrying: string }>(
      `SELECT
         status,
         COUNT(*)::text AS n,
         COUNT(*) FILTER (WHERE status = 'pending' AND attempt_count > 0)::text AS retrying
       FROM outbox_messages
       GROUP BY status`,
    );
    const counts = { pending: 0, claimed: 0, failed: 0, delivered: 0, retrying: 0 };
    for (const row of result.rows) {
      const n = Number(row.n);
      if (row.status === 'pending') {
        counts.pending = n;
        counts.retrying = Number(row.retrying);
      } else if (row.status === 'claimed') {
        counts.claimed = n;
      } else if (row.status === 'failed') {
        counts.failed = n;
      } else if (row.status === 'delivered') {
        counts.delivered = n;
      }
    }
    return { ...counts, state: classifyOutbox(counts) };
  }
}

function classifyOutbox(counts: {
  pending: number;
  claimed: number;
  failed: number;
  retrying: number;
}): OutboxHealthSnapshot['state'] {
  if (counts.failed > 0) {
    return 'stuck';
  }
  if (counts.retrying > 0) {
    return 'retrying';
  }
  if (counts.pending > 10) {
    return 'backlogged';
  }
  if (counts.pending > 0 || counts.claimed > 0) {
    return 'working';
  }
  return 'idle';
}
