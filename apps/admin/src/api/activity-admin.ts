import { apiRequest } from './http.js';

/** Admin paths under `/activity/v1/admin/guilds/:guildId/...` (gateway-compatible). */
function adminGuild(guildId: string, suffix = ''): string {
  return `/activity/v1/admin/guilds/${encodeURIComponent(guildId)}${suffix}`;
}

export type ReadinessState = 'READY' | 'CONFIGURATION_REQUIRED';

export interface ReadinessIssue {
  readonly code: string;
  readonly message: string;
}

export interface ReadinessResponse {
  readonly state: ReadinessState;
  readonly issues: readonly ReadinessIssue[];
  readonly counts?: Readonly<Record<string, number>>;
}

export interface ActivityTypeDto {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly isOther: boolean;
  readonly sortOrder: number;
}

export interface StatusDefDto {
  readonly id: string;
  readonly label: string;
  readonly occupiesSlot: boolean;
  readonly behavior: 'confirmed' | 'tentative' | 'declined' | 'custom';
  readonly selectableByMember: boolean;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly seedKey?: string | null;
}

export interface FieldDefDto {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly fieldType: string;
  readonly requiredDefault: boolean;
  readonly active: boolean;
}

export interface ChannelsConfigDto {
  readonly channelIds: readonly string[];
  readonly configRevision?: number;
}

export interface PingsConfigDto {
  readonly roleIds: readonly string[];
  readonly maxOrganizerRoles?: number;
  readonly configRevision?: number;
}

export interface LimitsConfigDto {
  readonly maxActivePerCreator: number;
  readonly horizonDays: number;
  readonly otherActivityEnabled: boolean;
  readonly retentionHours: number;
}

export interface NotificationsConfigDto {
  readonly dmEnabled: boolean;
  readonly reminders: unknown;
}

export interface ReportReasonDto {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly active: boolean;
  readonly sortOrder: number;
}

export interface ActivityEventDto {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly startAt: string;
  readonly endAt?: string | null;
  readonly organizerDiscordUserId?: string | null;
  readonly participantCount?: number;
  readonly publicationChannelId?: string | null;
  readonly typeLabel?: string | null;
  readonly typeId?: string | null;
}

export interface MemberDisplayDto {
  readonly id: string;
  readonly displayName: string;
}

export interface ActivityEventDetailDto {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly startAt: string;
  readonly endAt?: string | null;
  readonly organizerDiscordUserId?: string | null;
  readonly participantCount?: number;
  readonly publicationChannelId?: string | null;
  readonly description?: string;
  readonly typeId?: string | null;
  readonly enrollmentOpen?: boolean;
  readonly participantLimit?: number | null;
  readonly cancelReason?: string | null;
  readonly timezone?: string;
  readonly locationText?: string | null;
  readonly version?: number;
  readonly opaqueId?: string;
}

export interface ProjectionProblemDto {
  readonly activityId: string;
  readonly status: string;
  readonly channelId?: string | null;
  readonly messageId?: string | null;
  readonly lastError?: string | null;
  readonly retryCount?: number;
}

export interface ReportDto {
  readonly id: string;
  readonly activityId: string;
  readonly reporterDiscordUserId: string;
  readonly reasonCategory: string;
  readonly details?: string | null;
  readonly status: string;
  readonly createdAt: string;
}

export interface AuditEntryDto {
  readonly id: string;
  readonly action?: string;
  readonly actorDiscordUserId?: string | null;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly createdAt: string;
  readonly payload?: unknown;
}

export interface HubConfigDto {
  readonly channelId: string | null;
  readonly panelId?: string | null;
  readonly status?: string | null;
  readonly messageId?: string | null;
  readonly lastSyncedAt?: string | null;
  readonly configRevision?: number;
}

export interface DiscordChannelOption {
  readonly id: string;
  readonly name: string;
  readonly type: number;
  readonly usable: boolean;
  readonly reason?: string;
}

export interface DiscordRoleOption {
  readonly id: string;
  readonly name: string;
  readonly managed: boolean;
  readonly everyone: boolean;
}

export interface ReminderEntry {
  readonly offsetMinutes: number;
}

export interface AdminGuildListItem {
  readonly id: string;
  readonly name: string;
}

export interface GuildAdminConfigDto {
  readonly configRevision: number;
  readonly maxActivePerCreator: number;
  readonly maxCreateHorizonDays: number;
  readonly allowOtherActivity: boolean;
  readonly postRetentionHoursAfterFinish: number;
  readonly dmNotificationsEnabled: boolean;
  readonly reminders: unknown;
  readonly hubChannelId: string | null;
  readonly allowedPublishChannelIds?: readonly string[];
  readonly pingRoleIds?: readonly string[];
}

function asList<T>(payload: unknown, keys: readonly string[] = ['items', 'data']): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value as T[];
      }
    }
  }
  return [];
}

function asObject<T extends object>(payload: unknown): T {
  if (typeof payload === 'object' && payload !== null) {
    return payload as T;
  }
  return {} as T;
}

export async function listAdminGuilds(): Promise<AdminGuildListItem[]> {
  try {
    const payload = await apiRequest<unknown>('/activity/v1/admin/guilds');
    return asList<AdminGuildListItem>(payload, ['guilds', 'items', 'data']);
  } catch {
    return [];
  }
}

export async function getReadiness(guildId: string): Promise<ReadinessResponse> {
  const payload = await apiRequest<unknown>(adminGuild(guildId, '/readiness'));
  const obj = asObject<
    ReadinessResponse & {
      readiness?: ReadinessState;
      status?: string;
      ready?: boolean;
    }
  >(payload);
  const mappedFromStatus: ReadinessState | undefined =
    obj.status === 'READY' || obj.ready === true
      ? 'READY'
      : obj.status === 'NOT_READY' || obj.ready === false
        ? 'CONFIGURATION_REQUIRED'
        : undefined;
  return {
    state: obj.state ?? obj.readiness ?? mappedFromStatus ?? 'CONFIGURATION_REQUIRED',
    issues: Array.isArray(obj.issues) ? obj.issues : [],
    ...(obj.counts !== undefined ? { counts: obj.counts } : {}),
  };
}

export async function ensureGuildDefaults(guildId: string, orgId: string): Promise<unknown> {
  return apiRequest(`/activity/v1/guilds/${encodeURIComponent(guildId)}/ensure-defaults`, {
    method: 'POST',
    body: { orgId },
    idempotent: true,
  });
}

export async function listTypes(guildId: string): Promise<ActivityTypeDto[]> {
  return asList(await apiRequest(adminGuild(guildId, '/types')));
}

export async function createType(
  guildId: string,
  body: { key: string; label: string; enabled?: boolean; isOther?: boolean; sortOrder?: number },
): Promise<ActivityTypeDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/types'), { method: 'POST', body, idempotent: true }),
  );
}

export async function updateType(
  guildId: string,
  typeId: string,
  body: Partial<Pick<ActivityTypeDto, 'label' | 'enabled' | 'sortOrder' | 'isOther'>>,
): Promise<ActivityTypeDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, `/types/${encodeURIComponent(typeId)}`), {
      method: 'PATCH',
      body,
      idempotent: true,
    }),
  );
}

export async function reorderTypes(
  guildId: string,
  orderedIds: readonly string[],
): Promise<ActivityTypeDto[]> {
  return asList(
    await apiRequest(adminGuild(guildId, '/types/reorder'), {
      method: 'POST',
      body: { orderedIds },
      idempotent: true,
    }),
  );
}

export async function listStatuses(guildId: string): Promise<StatusDefDto[]> {
  return asList(await apiRequest(adminGuild(guildId, '/statuses')));
}

export async function createStatus(
  guildId: string,
  body: Omit<StatusDefDto, 'id' | 'seedKey'>,
): Promise<StatusDefDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/statuses'), { method: 'POST', body, idempotent: true }),
  );
}

export async function updateStatus(
  guildId: string,
  statusId: string,
  body: Partial<Omit<StatusDefDto, 'id' | 'seedKey'>>,
): Promise<StatusDefDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, `/statuses/${encodeURIComponent(statusId)}`), {
      method: 'PATCH',
      body,
      idempotent: true,
    }),
  );
}

export async function deleteStatus(guildId: string, statusId: string): Promise<void> {
  await apiRequest(adminGuild(guildId, `/statuses/${encodeURIComponent(statusId)}`), {
    method: 'DELETE',
    idempotent: true,
  });
}

export async function listFields(guildId: string): Promise<FieldDefDto[]> {
  return asList(await apiRequest(adminGuild(guildId, '/participant-fields')));
}

export async function createField(
  guildId: string,
  body: Omit<FieldDefDto, 'id'>,
): Promise<FieldDefDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/participant-fields'), {
      method: 'POST',
      body,
      idempotent: true,
    }),
  );
}

export async function updateField(
  guildId: string,
  fieldId: string,
  body: Partial<Omit<FieldDefDto, 'id'>>,
): Promise<FieldDefDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, `/participant-fields/${encodeURIComponent(fieldId)}`), {
      method: 'PATCH',
      body,
      idempotent: true,
    }),
  );
}

export async function deleteField(guildId: string, fieldId: string): Promise<void> {
  await apiRequest(adminGuild(guildId, `/participant-fields/${encodeURIComponent(fieldId)}`), {
    method: 'DELETE',
    idempotent: true,
  });
}

export async function getChannels(guildId: string): Promise<ChannelsConfigDto> {
  const payload = asObject<
    ChannelsConfigDto & { allowedPublishChannelIds?: string[]; configRevision?: number }
  >(await apiRequest(adminGuild(guildId, '/channels')));
  return {
    channelIds: payload.channelIds ?? payload.allowedPublishChannelIds ?? [],
    ...(payload.configRevision !== undefined ? { configRevision: payload.configRevision } : {}),
  };
}

export async function updateChannels(
  guildId: string,
  channelIds: readonly string[],
): Promise<ChannelsConfigDto> {
  const payload = asObject<ChannelsConfigDto>(
    await apiRequest(adminGuild(guildId, '/channels'), {
      method: 'PUT',
      body: { channelIds },
      idempotent: true,
    }),
  );
  return { channelIds: payload.channelIds ?? channelIds };
}

export async function getPings(guildId: string): Promise<PingsConfigDto> {
  const payload = asObject<PingsConfigDto & { pingRoleIds?: string[] }>(
    await apiRequest(adminGuild(guildId, '/ping-roles')),
  );
  return {
    roleIds: payload.roleIds ?? payload.pingRoleIds ?? [],
    maxOrganizerRoles: payload.maxOrganizerRoles ?? 2,
    ...(payload.configRevision !== undefined ? { configRevision: payload.configRevision } : {}),
  };
}

export async function updatePings(
  guildId: string,
  roleIds: readonly string[],
): Promise<PingsConfigDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/ping-roles'), {
      method: 'PUT',
      body: { roleIds },
      idempotent: true,
    }),
  );
}

export async function getAdminConfig(guildId: string): Promise<GuildAdminConfigDto> {
  const payload = asObject<Partial<GuildAdminConfigDto>>(
    await apiRequest(adminGuild(guildId, '/config')),
  );
  return {
    configRevision: payload.configRevision ?? 1,
    maxActivePerCreator: payload.maxActivePerCreator ?? 4,
    maxCreateHorizonDays: payload.maxCreateHorizonDays ?? 14,
    allowOtherActivity: payload.allowOtherActivity ?? true,
    postRetentionHoursAfterFinish: payload.postRetentionHoursAfterFinish ?? 24,
    dmNotificationsEnabled: payload.dmNotificationsEnabled ?? false,
    reminders: payload.reminders ?? [],
    hubChannelId: payload.hubChannelId ?? null,
    ...(payload.allowedPublishChannelIds !== undefined
      ? { allowedPublishChannelIds: payload.allowedPublishChannelIds }
      : {}),
    ...(payload.pingRoleIds !== undefined ? { pingRoleIds: payload.pingRoleIds } : {}),
  };
}

export async function getLimits(guildId: string): Promise<LimitsConfigDto> {
  const config = await getAdminConfig(guildId);
  return {
    maxActivePerCreator: config.maxActivePerCreator,
    horizonDays: config.maxCreateHorizonDays,
    otherActivityEnabled: config.allowOtherActivity,
    retentionHours: config.postRetentionHoursAfterFinish,
  };
}

export async function updateLimits(
  guildId: string,
  body: LimitsConfigDto,
): Promise<LimitsConfigDto> {
  const current = await getAdminConfig(guildId);
  await apiRequest(adminGuild(guildId, '/config'), {
    method: 'PUT',
    body: {
      expectedRevision: current.configRevision,
      maxActivePerCreator: body.maxActivePerCreator,
      maxCreateHorizonDays: body.horizonDays,
      allowOtherActivity: body.otherActivityEnabled,
      postRetentionHoursAfterFinish: body.retentionHours,
    },
    idempotent: true,
  });
  return body;
}

export async function getNotifications(guildId: string): Promise<NotificationsConfigDto> {
  const config = await getAdminConfig(guildId);
  return {
    dmEnabled: config.dmNotificationsEnabled,
    reminders: config.reminders,
  };
}

export async function updateNotifications(
  guildId: string,
  body: NotificationsConfigDto,
): Promise<NotificationsConfigDto> {
  const current = await getAdminConfig(guildId);
  await apiRequest(adminGuild(guildId, '/config'), {
    method: 'PUT',
    body: {
      expectedRevision: current.configRevision,
      dmNotificationsEnabled: body.dmEnabled,
      reminders: body.reminders,
    },
    idempotent: true,
  });
  return body;
}

export async function listReportReasons(guildId: string): Promise<ReportReasonDto[]> {
  return asList(await apiRequest(adminGuild(guildId, '/report-reasons')));
}

export async function createReportReason(
  guildId: string,
  body: Omit<ReportReasonDto, 'id'>,
): Promise<ReportReasonDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/report-reasons'), {
      method: 'POST',
      body,
      idempotent: true,
    }),
  );
}

export async function updateReportReason(
  guildId: string,
  reasonId: string,
  body: Partial<Omit<ReportReasonDto, 'id'>>,
): Promise<ReportReasonDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, `/report-reasons/${encodeURIComponent(reasonId)}`), {
      method: 'PATCH',
      body,
      idempotent: true,
    }),
  );
}

export async function deleteReportReason(guildId: string, reasonId: string): Promise<void> {
  await apiRequest(adminGuild(guildId, `/report-reasons/${encodeURIComponent(reasonId)}`), {
    method: 'DELETE',
    idempotent: true,
  });
}

export async function listEvents(
  guildId: string,
  filters?: { status?: string },
): Promise<ActivityEventDto[]> {
  return asList(
    await apiRequest(adminGuild(guildId, '/events'), {
      query: { status: filters?.status },
    }),
  );
}

export async function getEvent(guildId: string, eventId: string): Promise<ActivityEventDetailDto> {
  const payload = asObject<
    {
      activity?: ActivityEventDetailDto & { participantCount?: number };
      participations?: readonly unknown[];
    } & ActivityEventDetailDto
  >(await apiRequest(adminGuild(guildId, `/events/${encodeURIComponent(eventId)}`)));
  const activity = payload.activity ?? payload;
  const participantCount =
    activity.participantCount ??
    (Array.isArray(payload.participations) ? payload.participations.length : undefined);
  return {
    id: activity.id,
    name: activity.name,
    status: activity.status,
    startAt:
      typeof activity.startAt === 'string' ? activity.startAt : String(activity.startAt ?? ''),
    ...(activity.endAt !== undefined ? { endAt: activity.endAt } : {}),
    ...(activity.organizerDiscordUserId !== undefined
      ? { organizerDiscordUserId: activity.organizerDiscordUserId }
      : {}),
    ...(participantCount !== undefined ? { participantCount } : {}),
    ...(activity.publicationChannelId !== undefined
      ? { publicationChannelId: activity.publicationChannelId }
      : {}),
    ...(activity.description !== undefined ? { description: activity.description } : {}),
    ...(activity.typeId !== undefined ? { typeId: activity.typeId } : {}),
    ...(activity.enrollmentOpen !== undefined ? { enrollmentOpen: activity.enrollmentOpen } : {}),
    ...(activity.participantLimit !== undefined
      ? { participantLimit: activity.participantLimit }
      : {}),
    ...(activity.cancelReason !== undefined ? { cancelReason: activity.cancelReason } : {}),
    ...(activity.timezone !== undefined ? { timezone: activity.timezone } : {}),
    ...(activity.locationText !== undefined ? { locationText: activity.locationText } : {}),
    ...(activity.version !== undefined ? { version: activity.version } : {}),
    ...(activity.opaqueId !== undefined ? { opaqueId: activity.opaqueId } : {}),
  };
}

export async function cancelEvent(
  guildId: string,
  eventId: string,
  reason: string,
): Promise<ActivityEventDetailDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, `/events/${encodeURIComponent(eventId)}/cancel`), {
      method: 'POST',
      body: { reason },
      idempotent: true,
    }),
  );
}

export async function listProjectionProblems(guildId: string): Promise<ProjectionProblemDto[]> {
  return asList(await apiRequest(adminGuild(guildId, '/projections')), [
    'problems',
    'items',
    'data',
  ]);
}

export async function repairProjection(guildId: string, activityId: string): Promise<unknown> {
  return apiRequest(adminGuild(guildId, `/projections/${encodeURIComponent(activityId)}/repair`), {
    method: 'POST',
    idempotent: true,
  });
}

export async function listReports(guildId: string): Promise<ReportDto[]> {
  return asList(await apiRequest(adminGuild(guildId, '/reports')));
}

export async function resolveReport(
  guildId: string,
  reportId: string,
  resolution?: string,
): Promise<ReportDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, `/reports/${encodeURIComponent(reportId)}`), {
      method: 'PATCH',
      body: { status: resolution ?? 'resolved' },
      idempotent: true,
    }),
  );
}

export async function listAudit(
  guildId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{ items: AuditEntryDto[]; nextCursor: string | null }> {
  const payload = asObject<{
    items?: AuditEntryDto[];
    data?: AuditEntryDto[];
    nextCursor?: string | null;
    cursor?: string | null;
  }>(
    await apiRequest(adminGuild(guildId, '/audit'), {
      query: {
        cursor: options?.cursor,
        limit: options?.limit ?? 50,
      },
    }),
  );
  const items: AuditEntryDto[] =
    payload.items ?? payload.data ?? (Array.isArray(payload) ? payload : []);
  return {
    items,
    nextCursor: payload.nextCursor ?? payload.cursor ?? null,
  };
}

export async function getHub(guildId: string): Promise<HubConfigDto> {
  const payload = asObject<
    HubConfigDto & {
      hubChannelId?: string | null;
      panel?: {
        id?: string;
        status?: string;
        messageId?: string;
        updatedAt?: string;
        lastSyncedAt?: string;
      };
    }
  >(await apiRequest(adminGuild(guildId, '/hub')));
  const panel = payload.panel;
  const lastSyncedAt = payload.lastSyncedAt ?? panel?.lastSyncedAt ?? panel?.updatedAt;
  return {
    channelId: payload.channelId ?? payload.hubChannelId ?? null,
    ...(payload.panelId !== undefined
      ? { panelId: payload.panelId }
      : panel?.id !== undefined
        ? { panelId: panel.id }
        : {}),
    ...(payload.status !== undefined
      ? { status: payload.status }
      : panel?.status !== undefined
        ? { status: panel.status }
        : {}),
    ...(payload.messageId !== undefined
      ? { messageId: payload.messageId }
      : panel?.messageId !== undefined
        ? { messageId: panel.messageId }
        : {}),
    ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
    ...(payload.configRevision !== undefined ? { configRevision: payload.configRevision } : {}),
  };
}

export async function updateHub(
  guildId: string,
  body: { channelId: string },
): Promise<HubConfigDto> {
  const current = await getAdminConfig(guildId);
  await apiRequest(adminGuild(guildId, '/hub/publish-intent'), {
    method: 'POST',
    body: { channelId: body.channelId, expectedRevision: current.configRevision },
    idempotent: true,
  });
  return getHub(guildId);
}

export async function listDiscordChannels(guildId: string): Promise<DiscordChannelOption[]> {
  return asList(await apiRequest(adminGuild(guildId, '/discord/channels')), ['channels', 'items']);
}

export async function listDiscordRoles(guildId: string): Promise<DiscordRoleOption[]> {
  return asList(await apiRequest(adminGuild(guildId, '/discord/roles')), ['roles', 'items']);
}

export async function publishHubPanel(
  guildId: string,
): Promise<{ mode: string; messageId: string }> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/hub/publish'), { method: 'POST', idempotent: true }),
  );
}

export async function reconcileHubPanel(
  guildId: string,
): Promise<{ mode: string; messageId: string }> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/hub/reconcile'), { method: 'POST', idempotent: true }),
  );
}

export async function resolveMemberDisplays(
  guildId: string,
  userIds: readonly string[],
): Promise<MemberDisplayDto[]> {
  if (userIds.length === 0) {
    return [];
  }
  return asList(
    await apiRequest(adminGuild(guildId, '/discord/members/resolve'), {
      method: 'POST',
      body: { userIds },
      idempotent: true,
    }),
    ['members', 'items'],
  );
}
