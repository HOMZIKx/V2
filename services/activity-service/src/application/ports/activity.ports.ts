import type { Clock } from '../../domain/clock.js';
import type { ActivityStatus } from '../../domain/lifecycle.js';
import type { StatusBehavior } from '../../domain/status-def.js';
import type { DiscordChannelValidationPort } from './discord-channel-validation.port.js';
import type { DiscordGuildMetadataPort } from './discord-guild-metadata.port.js';

export interface ActorSubject {
  readonly discordUserId?: string;
  readonly v2UserId?: string;
}

export interface AuthorizeRequest {
  readonly subject: ActorSubject;
  readonly permissionId: string;
  readonly scope: { readonly type: 'guild' | 'organization'; readonly guildId?: string };
  readonly operationClass?: 'ordinary' | 'sensitive';
}

export interface AuthorizeResult {
  readonly allowed: boolean;
  readonly permissionId: string;
  readonly decision: 'allow' | 'deny';
}

export interface AuthorizePort {
  authorize(request: AuthorizeRequest): Promise<AuthorizeResult>;
}

export interface ParticipationStatusDefRecord {
  readonly id: string;
  readonly guildId: string;
  readonly label: string;
  readonly occupiesSlot: boolean;
  readonly behavior: StatusBehavior;
  readonly selectableByMember: boolean;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly seedKey: string | null;
}

export interface ReminderConfigEntry {
  readonly [key: string]: unknown;
}

export interface GuildActivitySettingsRecord {
  readonly guildId: string;
  readonly orgId: string;
  readonly organizerDefaultStatusId: string | null;
  readonly waitlistPromotionStatusId: string | null;
  readonly maxActivePerCreator: number;
  readonly registrationDefaultClosesAtStart: boolean;
  readonly allowedPublishChannelIds: readonly string[];
  readonly configRevision: number;
  readonly allowOtherActivity: boolean;
  readonly maxCreateHorizonDays: number;
  readonly postRetentionHoursAfterFinish: number;
  readonly reminders: readonly ReminderConfigEntry[];
  readonly dmNotificationsEnabled: boolean;
  readonly pingRoleIds: readonly string[];
  readonly hubChannelId: string | null;
}

export interface ActivityTypeRecord {
  readonly id: string;
  readonly guildId: string;
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly isOther: boolean;
  readonly sortOrder: number;
  readonly statusDefIds: readonly string[];
  readonly participantFields: readonly {
    readonly fieldDefId: string;
    readonly required: boolean;
  }[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ParticipantFieldDefRecord {
  readonly id: string;
  readonly guildId: string;
  readonly key: string;
  readonly label: string;
  readonly fieldType: string;
  readonly requiredDefault: boolean;
  readonly active: boolean;
  readonly optionsJson: readonly unknown[];
  readonly maxLength: number | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ReportReasonDefRecord {
  readonly id: string;
  readonly guildId: string;
  readonly key: string;
  readonly label: string;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly allowDetails: boolean;
  readonly requiresDetails: boolean;
  readonly createdAt: Date;
}

export interface AuditEntryRecord {
  readonly id: string;
  readonly guildId: string | null;
  readonly activityId: string | null;
  readonly actorDiscordUserId: string | null;
  readonly actorV2UserId: string | null;
  readonly action: string;
  readonly details: Record<string, unknown>;
  readonly correlationId: string | null;
  readonly createdAt: Date;
}

export interface AdminEventListFilters {
  readonly guildId: string;
  readonly status?: string;
  readonly organizerDiscordUserId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit: number;
  readonly offset: number;
}

export interface AdminAuditListFilters {
  readonly guildId: string;
  readonly actionPrefix?: string;
  readonly activityId?: string;
  readonly actorDiscordUserId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit: number;
  readonly offset: number;
}

export interface PutGuildAdminConfigInput {
  readonly expectedRevision: number;
  readonly organizerDefaultStatusId?: string | null | undefined;
  readonly waitlistPromotionStatusId?: string | null | undefined;
  readonly maxActivePerCreator?: number | undefined;
  readonly registrationDefaultClosesAtStart?: boolean | undefined;
  readonly allowOtherActivity?: boolean | undefined;
  readonly maxCreateHorizonDays?: number | undefined;
  readonly postRetentionHoursAfterFinish?: number | undefined;
  readonly reminders?: readonly ReminderConfigEntry[] | undefined;
  readonly dmNotificationsEnabled?: boolean | undefined;
  readonly allowedPublishChannelIds?: readonly string[] | undefined;
  readonly pingRoleIds?: readonly string[] | undefined;
  readonly hubChannelId?: string | null | undefined;
}

export interface ActivityDraftRecord {
  readonly id: string;
  readonly guildId: string;
  readonly creatorSubjectType: 'discord' | 'v2';
  readonly creatorDiscordUserId: string | null;
  readonly creatorV2UserId: string | null;
  readonly payload: Record<string, unknown>;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ActivityScheduleKind = 'exact' | 'range' | 'flexible_period';
export type ActivityPeriodKey = 'today' | 'tomorrow' | 'this_week' | 'weekend' | 'flexible';

export interface ActivityRecord {
  readonly id: string;
  readonly guildId: string;
  readonly organizationId: string;
  readonly typeId: string | null;
  readonly name: string;
  readonly description: string;
  readonly startAt: Date;
  readonly endAt: Date | null;
  /** exact (default) | range | flexible_period — resolved bounds stay in startAt/endAt. */
  readonly scheduleKind: ActivityScheduleKind;
  /** Required when scheduleKind = flexible_period; otherwise null. */
  readonly periodKey: ActivityPeriodKey | null;
  readonly scheduleHasExplicitTime: boolean;
  readonly status: ActivityStatus;
  readonly enrollmentOpen: boolean;
  readonly participantLimit: number | null;
  readonly organizerDiscordUserId: string | null;
  readonly organizerV2UserId: string | null;
  readonly coOrganizerDiscordUserId: string | null;
  readonly coOrganizerV2UserId: string | null;
  readonly publicationChannelId: string | null;
  readonly timezone: string;
  readonly locationText: string | null;
  readonly cancelReason: string | null;
  readonly cancelledAt: Date | null;
  readonly version: number;
  readonly scheduledFinishAt: Date;
  readonly opaqueId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ParticipationRecord {
  readonly id: string;
  readonly activityId: string;
  readonly discordUserId: string | null;
  readonly v2UserId: string | null;
  readonly statusDefId: string;
  readonly confirmationState: 'confirmed' | 'requires_reconfirmation';
  readonly reconfirmDeadline: Date | null;
  readonly waitlistPosition: number | null;
  readonly resignedAt: Date | null;
  readonly removedAt: Date | null;
  readonly removeReason: string | null;
  readonly occupiesSlot: boolean;
  readonly statusBehavior: StatusBehavior;
}

export interface HubPanelRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly discordGuildId: string;
  readonly channelId: string;
  readonly messageId: string | null;
  readonly panelType: string;
  readonly payloadVersion: number;
  readonly status: string;
  readonly opaqueId: string;
}

export interface InboxItemRecord {
  readonly id: string;
  readonly guildId: string;
  readonly recipientDiscordUserId: string | null;
  readonly recipientV2UserId: string | null;
  readonly kind: string;
  readonly payload: Record<string, unknown>;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface ActivityReportRecord {
  readonly id: string;
  readonly guildId: string;
  readonly activityId: string;
  readonly reporterDiscordUserId: string;
  readonly reasonCategory: string;
  readonly details: string | null;
  readonly status: string;
  readonly createdAt: Date;
}

export interface ActivityProjectionRecord {
  readonly activityId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string | null;
  readonly status: string;
  readonly opaqueId: string;
  readonly revision: number;
  readonly lastError: string | null;
  readonly retryCount: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly desiredPayloadVersion: number;
  readonly updatedAt: Date;
}

export interface UpsertActivityProjectionInput {
  readonly activityId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly opaqueId: string;
  readonly messageId?: string | null;
  readonly status?: string;
  readonly revision?: number;
  readonly lastError?: string | null;
  readonly retryCount?: number;
  readonly desiredPayloadVersion?: number;
  readonly leaseOwner?: string | null;
  readonly leaseExpiresAt?: Date | null;
}

export interface OutboxMessageRecord {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly payload: Record<string, unknown>;
  readonly status: string;
  readonly attemptCount: number;
}

export interface IdempotencyHit {
  readonly responseStatus: number;
  readonly responseBody: unknown;
}

export interface OutboxInsert {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface ActivityTx {
  lockCreatorAdvisory(guildId: string, creatorKey: string): Promise<void>;
  lockActivity(activityId: string): Promise<ActivityRecord>;
  ensureGuildDefaults(input: { guildId: string; orgId: string }): Promise<{
    settings: GuildActivitySettingsRecord;
    statuses: ParticipationStatusDefRecord[];
  }>;
  getSettings(guildId: string): Promise<GuildActivitySettingsRecord | null>;
  updateSettings(
    guildId: string,
    patch: Partial<
      Pick<
        GuildActivitySettingsRecord,
        | 'organizerDefaultStatusId'
        | 'waitlistPromotionStatusId'
        | 'maxActivePerCreator'
        | 'registrationDefaultClosesAtStart'
      >
    >,
  ): Promise<GuildActivitySettingsRecord>;
  listStatusDefs(guildId: string): Promise<ParticipationStatusDefRecord[]>;
  getStatusDef(id: string): Promise<ParticipationStatusDefRecord | null>;
  countActiveOwn(guildId: string, organizerDiscordUserId: string): Promise<number>;
  insertDraft(
    input: Omit<ActivityDraftRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<ActivityDraftRecord>;
  getDraft(id: string): Promise<ActivityDraftRecord | null>;
  getDraftByOpaque(opaqueId: string): Promise<ActivityDraftRecord | null>;
  updateDraft(
    id: string,
    patch: { payload?: Record<string, unknown>; expiresAt?: Date },
  ): Promise<ActivityDraftRecord>;
  deleteDraft(id: string): Promise<void>;
  insertActivity(
    input: Omit<ActivityRecord, 'createdAt' | 'updatedAt' | 'version' | 'opaqueId'> & {
      version?: number;
      opaqueId?: string;
    },
  ): Promise<ActivityRecord>;
  updateActivity(activity: ActivityRecord): Promise<ActivityRecord>;
  getActivity(id: string): Promise<ActivityRecord | null>;
  getActivityByOpaqueId(opaqueId: string): Promise<ActivityRecord | null>;
  listActivities(guildId: string): Promise<ActivityRecord[]>;
  listMyActivities(input: {
    guildId?: string;
    discordUserId?: string;
    v2UserId?: string;
  }): Promise<ActivityRecord[]>;
  listParticipations(activityId: string): Promise<ParticipationRecord[]>;
  listParticipationsForActivities(activityIds: readonly string[]): Promise<ParticipationRecord[]>;
  getParticipation(activityId: string, discordUserId: string): Promise<ParticipationRecord | null>;
  upsertParticipation(
    input: Omit<
      ParticipationRecord,
      'occupiesSlot' | 'statusBehavior' | 'resignedAt' | 'removedAt' | 'removeReason'
    > & {
      resignedAt?: Date | null;
      removedAt?: Date | null;
      removeReason?: string | null;
    },
  ): Promise<ParticipationRecord>;
  markParticipationResigned(id: string, at: Date): Promise<void>;
  markParticipationRemoved(id: string, at: Date, reason: string): Promise<void>;
  clearWaitlistPosition(id: string): Promise<void>;
  upsertPanel(input: {
    organizationId: string;
    discordGuildId: string;
    channelId: string;
    panelType: string;
    messageId?: string | null;
    status?: string;
    payloadVersion?: number;
    opaqueId?: string;
  }): Promise<{ panel: HubPanelRecord; repaired: boolean }>;
  getPanel(id: string): Promise<HubPanelRecord | null>;
  getPanelByOpaqueId(opaqueId: string): Promise<HubPanelRecord | null>;
  listPanels(guildId: string): Promise<HubPanelRecord[]>;
  insertPublishOccurrence(input: {
    panelId: string;
    operationId: string;
    nonce: string;
    payloadVersion: number;
    desiredChannelId: string;
    correlationId?: string;
  }): Promise<void>;
  getLatestPendingPublishOccurrence(panelId: string): Promise<{
    operationId: string;
    nonce: string;
    payloadVersion: number;
    desiredChannelId: string;
    correlationId: string | null;
  } | null>;
  updatePublishOccurrenceStatus(input: {
    panelId: string;
    operationId: string;
    status: 'sent' | 'adopted' | 'failed' | 'cancelled';
  }): Promise<void>;
  insertOutbox(message: OutboxInsert): Promise<void>;
  claimOutbox(input: {
    owner: string;
    limit: number;
    leaseSeconds: number;
    now: Date;
  }): Promise<OutboxMessageRecord[]>;
  completeOutbox(id: string): Promise<void>;
  failOutbox(id: string, error: string, availableAt: Date): Promise<void>;
  permanentFailOutbox(id: string, error: string): Promise<void>;
  listInbox(input: {
    discordUserId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: InboxItemRecord[]; nextCursor: string | null }>;
  markInboxRead(id: string, discordUserId: string): Promise<InboxItemRecord>;
  enqueueInbox(input: {
    guildId: string;
    recipientDiscordUserId: string;
    kind: string;
    payload: Record<string, unknown>;
    dedupeKey?: string;
  }): Promise<{ item: InboxItemRecord; created: boolean }>;
  createReport(input: {
    id: string;
    guildId: string;
    activityId: string;
    reporterDiscordUserId: string;
    reasonCategory: string;
    details?: string | null;
  }): Promise<ActivityReportRecord>;
  listReports(guildId: string): Promise<ActivityReportRecord[]>;
  upsertActivityProjection(input: UpsertActivityProjectionInput): Promise<ActivityProjectionRecord>;
  getActivityProjection(activityId: string): Promise<ActivityProjectionRecord | null>;
  claimProjectionRepair(input: {
    owner: string;
    limit: number;
    leaseSeconds: number;
    now: Date;
  }): Promise<ActivityProjectionRecord[]>;
  setAllowedPublishChannelIds(guildId: string, channelIds: readonly string[]): Promise<void>;
  putGuildAdminConfig(
    guildId: string,
    input: PutGuildAdminConfigInput,
  ): Promise<GuildActivitySettingsRecord>;
  setPingRoleIds(guildId: string, roleIds: readonly string[]): Promise<GuildActivitySettingsRecord>;
  setHubChannelId(guildId: string, channelId: string | null): Promise<GuildActivitySettingsRecord>;
  listActivityTypes(guildId: string): Promise<ActivityTypeRecord[]>;
  getActivityType(id: string): Promise<ActivityTypeRecord | null>;
  insertActivityType(input: {
    id: string;
    guildId: string;
    key: string;
    label: string;
    enabled?: boolean;
    isOther?: boolean;
    sortOrder?: number;
    statusDefIds?: readonly string[];
    participantFields?: readonly { fieldDefId: string; required: boolean }[];
  }): Promise<ActivityTypeRecord>;
  updateActivityType(
    id: string,
    patch: {
      label?: string | undefined;
      enabled?: boolean | undefined;
      isOther?: boolean | undefined;
      sortOrder?: number | undefined;
      statusDefIds?: readonly string[] | undefined;
      participantFields?: readonly { fieldDefId: string; required: boolean }[] | undefined;
    },
  ): Promise<ActivityTypeRecord>;
  countActivitiesUsingType(typeId: string): Promise<number>;
  deactivateActivityType(id: string): Promise<ActivityTypeRecord>;
  insertStatusDef(input: {
    id: string;
    guildId: string;
    label: string;
    occupiesSlot: boolean;
    behavior: StatusBehavior;
    selectableByMember: boolean;
    active?: boolean;
    sortOrder?: number;
    seedKey?: string | null;
  }): Promise<ParticipationStatusDefRecord>;
  updateStatusDef(
    id: string,
    patch: {
      label?: string | undefined;
      occupiesSlot?: boolean | undefined;
      behavior?: StatusBehavior | undefined;
      selectableByMember?: boolean | undefined;
      active?: boolean | undefined;
      sortOrder?: number | undefined;
    },
  ): Promise<ParticipationStatusDefRecord>;
  deactivateStatusDef(id: string): Promise<ParticipationStatusDefRecord>;
  countParticipationsUsingStatus(statusDefId: string): Promise<number>;
  listParticipantFieldDefs(guildId: string): Promise<ParticipantFieldDefRecord[]>;
  getParticipantFieldDef(id: string): Promise<ParticipantFieldDefRecord | null>;
  insertParticipantFieldDef(input: {
    id: string;
    guildId: string;
    key: string;
    label: string;
    fieldType: string;
    requiredDefault?: boolean;
    active?: boolean;
    optionsJson?: readonly unknown[];
    maxLength?: number | null;
    sortOrder?: number;
  }): Promise<ParticipantFieldDefRecord>;
  updateParticipantFieldDef(
    id: string,
    patch: {
      label?: string | undefined;
      fieldType?: string | undefined;
      requiredDefault?: boolean | undefined;
      active?: boolean | undefined;
      optionsJson?: readonly unknown[] | undefined;
      maxLength?: number | null | undefined;
      sortOrder?: number | undefined;
    },
  ): Promise<ParticipantFieldDefRecord>;
  deactivateParticipantFieldDef(id: string): Promise<ParticipantFieldDefRecord>;
  listReportReasonDefs(guildId: string): Promise<ReportReasonDefRecord[]>;
  getReportReasonDef(id: string): Promise<ReportReasonDefRecord | null>;
  insertReportReasonDef(input: {
    id: string;
    guildId: string;
    key: string;
    label: string;
    active?: boolean;
    sortOrder?: number;
    allowDetails?: boolean;
    requiresDetails?: boolean;
  }): Promise<ReportReasonDefRecord>;
  updateReportReasonDef(
    id: string,
    patch: {
      label?: string | undefined;
      active?: boolean | undefined;
      sortOrder?: number | undefined;
      allowDetails?: boolean | undefined;
      requiresDetails?: boolean | undefined;
    },
  ): Promise<ReportReasonDefRecord>;
  deactivateReportReasonDef(id: string): Promise<ReportReasonDefRecord>;
  listAdminEvents(filters: AdminEventListFilters): Promise<{
    items: ActivityRecord[];
    total: number;
  }>;
  listProjectionProblems(guildId: string): Promise<ActivityProjectionRecord[]>;
  updateReportStatus(
    id: string,
    guildId: string,
    status: 'open' | 'resolved',
  ): Promise<ActivityReportRecord>;
  getReport(id: string): Promise<ActivityReportRecord | null>;
  listAuditEntries(filters: AdminAuditListFilters): Promise<{
    items: AuditEntryRecord[];
    total: number;
  }>;
  findIdempotency(input: {
    scope: string;
    actorKey: string;
    operation: string;
    idempotencyKey: string;
  }): Promise<IdempotencyHit | null>;
  saveIdempotency(input: {
    scope: string;
    actorKey: string;
    operation: string;
    idempotencyKey: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void>;
  insertAudit(input: {
    guildId?: string;
    activityId?: string;
    actorDiscordUserId?: string;
    actorV2UserId?: string;
    action: string;
    details?: Record<string, unknown>;
    correlationId?: string;
  }): Promise<void>;
  ping(): Promise<void>;
  listExpiredReconfirmations(
    now: Date,
  ): Promise<
    readonly { activityId: string; participationId: string; discordUserId: string | null }[]
  >;
  listActivitiesDueForFinish(now: Date): Promise<readonly ActivityRecord[]>;
}

export interface ActivityRepositoryPort {
  withTransaction<T>(fn: (tx: ActivityTx) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  countOutboxByStatus?(): Promise<OutboxHealthSnapshot>;
}

export type OutboxHealthSnapshot = {
  readonly pending: number;
  readonly claimed: number;
  readonly failed: number;
  readonly delivered: number;
  readonly retrying: number;
  readonly state: 'idle' | 'working' | 'backlogged' | 'retrying' | 'stuck';
};

export interface ActivityUseCaseDeps {
  readonly repository: ActivityRepositoryPort;
  readonly authorize: AuthorizePort;
  readonly clock: Clock;
  readonly allowTestSeed?: boolean;
  readonly nodeEnv?: string;
  readonly discordChannelValidation?: DiscordChannelValidationPort | null;
  readonly discordGuildMetadata?: DiscordGuildMetadataPort | null;
}
