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
}

export interface PingsConfigDto {
  readonly roleIds: readonly string[];
  /** Product rule: organizers may ping ≤2 roles. */
  readonly maxOrganizerRoles?: number;
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
}

export interface AdminGuildListItem {
  readonly id: string;
  readonly name: string;
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
  const obj = asObject<ReadinessResponse & { readiness?: ReadinessState }>(payload);
  return {
    state: obj.state ?? obj.readiness ?? 'CONFIGURATION_REQUIRED',
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
  return asList(await apiRequest(adminGuild(guildId, '/fields')));
}

export async function createField(
  guildId: string,
  body: Omit<FieldDefDto, 'id'>,
): Promise<FieldDefDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/fields'), { method: 'POST', body, idempotent: true }),
  );
}

export async function updateField(
  guildId: string,
  fieldId: string,
  body: Partial<Omit<FieldDefDto, 'id'>>,
): Promise<FieldDefDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, `/fields/${encodeURIComponent(fieldId)}`), {
      method: 'PATCH',
      body,
      idempotent: true,
    }),
  );
}

export async function deleteField(guildId: string, fieldId: string): Promise<void> {
  await apiRequest(adminGuild(guildId, `/fields/${encodeURIComponent(fieldId)}`), {
    method: 'DELETE',
    idempotent: true,
  });
}

export async function getChannels(guildId: string): Promise<ChannelsConfigDto> {
  const payload = asObject<ChannelsConfigDto & { allowedPublishChannelIds?: string[] }>(
    await apiRequest(adminGuild(guildId, '/channels')),
  );
  return {
    channelIds: payload.channelIds ?? payload.allowedPublishChannelIds ?? [],
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
  const payload = asObject<PingsConfigDto>(await apiRequest(adminGuild(guildId, '/pings')));
  return {
    roleIds: payload.roleIds ?? [],
    maxOrganizerRoles: payload.maxOrganizerRoles ?? 2,
  };
}

export async function updatePings(
  guildId: string,
  roleIds: readonly string[],
): Promise<PingsConfigDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/pings'), {
      method: 'PUT',
      body: { roleIds },
      idempotent: true,
    }),
  );
}

export async function getLimits(guildId: string): Promise<LimitsConfigDto> {
  const payload = asObject<Partial<LimitsConfigDto>>(
    await apiRequest(adminGuild(guildId, '/limits')),
  );
  return {
    maxActivePerCreator: payload.maxActivePerCreator ?? 4,
    horizonDays: payload.horizonDays ?? 14,
    otherActivityEnabled: payload.otherActivityEnabled ?? true,
    retentionHours: payload.retentionHours ?? 24,
  };
}

export async function updateLimits(
  guildId: string,
  body: LimitsConfigDto,
): Promise<LimitsConfigDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/limits'), {
      method: 'PUT',
      body,
      idempotent: true,
    }),
  );
}

export async function getNotifications(guildId: string): Promise<NotificationsConfigDto> {
  const payload = asObject<Partial<NotificationsConfigDto>>(
    await apiRequest(adminGuild(guildId, '/notifications')),
  );
  return {
    dmEnabled: payload.dmEnabled ?? false,
    reminders: payload.reminders ?? [],
  };
}

export async function updateNotifications(
  guildId: string,
  body: NotificationsConfigDto,
): Promise<NotificationsConfigDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/notifications'), {
      method: 'PUT',
      body,
      idempotent: true,
    }),
  );
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
  return asObject(await apiRequest(adminGuild(guildId, `/events/${encodeURIComponent(eventId)}`)));
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
    await apiRequest(adminGuild(guildId, `/reports/${encodeURIComponent(reportId)}/resolve`), {
      method: 'POST',
      body: { resolution: resolution ?? 'resolved' },
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
  const payload = asObject<HubConfigDto>(await apiRequest(adminGuild(guildId, '/hub')));
  return {
    channelId: payload.channelId ?? null,
    ...(payload.panelId !== undefined ? { panelId: payload.panelId } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.messageId !== undefined ? { messageId: payload.messageId } : {}),
  };
}

export async function updateHub(
  guildId: string,
  body: { channelId: string },
): Promise<HubConfigDto> {
  return asObject(
    await apiRequest(adminGuild(guildId, '/hub'), {
      method: 'PUT',
      body,
      idempotent: true,
    }),
  );
}
