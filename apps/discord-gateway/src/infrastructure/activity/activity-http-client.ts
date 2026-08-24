import { randomUUID } from 'node:crypto';

import { LfgSearchResponseSchema } from '@v2/contracts';
import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';

export type ActivityClientMode = 'headers' | 'assertion';

export type ActivityHttpClientConfig = {
  readonly baseUrl: string;
  readonly mode: ActivityClientMode;
  readonly organizationId: string;
  readonly clientId?: string;
  readonly privateKeyPem?: string;
  readonly activeKid?: string;
  readonly audience?: string;
  readonly ttlSeconds?: number;
};

export type ActivityActorContext = {
  readonly discordUserId: string;
  readonly v2UserId?: string;
  readonly idempotencyKey?: string;
};

export class ActivityHttpError extends Error {
  public constructor(
    message: string,
    public readonly code: 'NETWORK' | 'HTTP' | 'VALIDATION' | 'RATE_LIMITED' | 'UNAVAILABLE',
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'ActivityHttpError';
  }
}

const draftSchema = z
  .object({
    id: z.string().min(1),
    guildId: z.string().min(1).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    expiresAt: z.string().optional(),
  })
  .passthrough();

const activitySchema = z
  .object({
    id: z.string().min(1),
    opaqueId: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    guildId: z.string().optional(),
  })
  .passthrough();

const panelSchema = z
  .object({
    id: z.string().min(1),
    opaqueId: z.string().optional(),
    channelId: z.string().optional(),
    messageId: z.string().nullable().optional(),
    status: z.string().optional(),
    discordGuildId: z.string().optional(),
  })
  .passthrough();

const pendingOccurrenceSchema = z
  .object({
    operationId: z.string().min(1),
    nonce: z.string().min(1),
    payloadVersion: z.number().optional(),
    desiredChannelId: z.string().optional(),
    correlationId: z.string().nullable().optional(),
  })
  .nullable();

const panelListSchema = z
  .union([z.array(panelSchema), z.object({ items: z.array(panelSchema).optional() }).passthrough()])
  .transform((value): Array<z.infer<typeof panelSchema>> =>
    Array.isArray(value) ? value : (value.items ?? []),
  );

const activityListSchema = z
  .union([
    z.array(activitySchema),
    z.object({ items: z.array(activitySchema).optional() }).passthrough(),
  ])
  .transform((value): Array<z.infer<typeof activitySchema>> =>
    Array.isArray(value) ? value : (value.items ?? []),
  );

const participantSchema = z
  .object({
    discordUserId: z.string().optional(),
    waitlistPosition: z.number().nullable().optional(),
  })
  .passthrough();

const participantListSchema = z
  .union([
    z.array(participantSchema),
    z.object({ items: z.array(participantSchema).optional() }).passthrough(),
  ])
  .transform((value): Array<z.infer<typeof participantSchema>> =>
    Array.isArray(value) ? value : (value.items ?? []),
  );

const statusDefSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().optional(),
    occupiesSlot: z.boolean().optional(),
    opaqueId: z.string().optional(),
  })
  .passthrough();

const guildConfigSchema = z
  .object({
    statuses: z.array(statusDefSchema).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const projectionSchema = z
  .object({
    activityId: z.string().optional(),
    channelId: z.string().optional(),
    messageId: z.string().nullable().optional(),
    status: z.string().optional(),
    opaqueId: z.string().optional(),
    revision: z.number().optional(),
  })
  .passthrough();

const inboxSchema = z
  .object({
    items: z.array(z.unknown()).default([]),
    nextCursor: z.string().nullable().optional(),
  })
  .passthrough();

const rsvpResultSchema = z
  .object({
    waitlistPosition: z.number().nullable().optional(),
  })
  .passthrough();

const lfgSearchResultSchema = LfgSearchResponseSchema.extend({
  similarGroupsWarning: z.string().nullable().optional(),
}).passthrough();

const lfgWatchSchema = z
  .object({
    id: z.string().min(1),
    activityTypeKey: z.string().optional(),
    sessionRoles: z.array(z.string()).optional(),
    windowStartAt: z.string().optional(),
    windowEndAt: z.string().optional(),
    expiresAt: z.string().optional(),
    cancelledAt: z.string().nullable().optional(),
    pausedAt: z.string().nullable().optional(),
    fulfilledAt: z.string().nullable().optional(),
    characterId: z.string().optional(),
    classSpecKey: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

const lfgWatchListSchema = z
  .union([
    z.array(lfgWatchSchema),
    z
      .object({
        items: z.array(lfgWatchSchema).optional(),
        watches: z.array(lfgWatchSchema).optional(),
      })
      .passthrough(),
  ])
  .transform((value): Array<z.infer<typeof lfgWatchSchema>> => {
    if (Array.isArray(value)) {
      return value;
    }
    return value.items ?? value.watches ?? [];
  });

const lfgWatchMutationSchema = z
  .object({
    id: z.string().optional(),
    intentId: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

const lfgJoinResultSchema = z
  .object({
    joined: z.boolean().optional(),
    waitlistPosition: z.number().nullable().optional(),
    partyRoleKey: z.string().optional(),
  })
  .passthrough();

const ASSERTION_HEADER = 'Activity-Client-Assertion';

export type ActivityHttpClientDeps = {
  readonly config: ActivityHttpClientConfig;
  readonly fetchImpl?: typeof fetch;
};

/**
 * Fail-closed HTTP client for discord-gateway → activity-service.
 * No business RSVP/waitlist logic — transport + light Zod validation only.
 */
export class ActivityHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  public constructor(private readonly deps: ActivityHttpClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.baseUrl = deps.config.baseUrl.replace(/\/$/, '');
  }

  public async createDraft(
    body: { guildId: string; payload?: Record<string, unknown> },
    actor: ActivityActorContext,
  ): Promise<z.infer<typeof draftSchema>> {
    return this.request('POST', '/activity/v1/drafts', draftSchema, { body, actor });
  }

  public async getDraft(id: string, actor: ActivityActorContext) {
    return this.request('GET', `/activity/v1/drafts/${encodeURIComponent(id)}`, draftSchema, {
      actor,
    });
  }

  public async updateDraft(
    id: string,
    body: { payload: Record<string, unknown> },
    actor: ActivityActorContext,
  ) {
    return this.request('PATCH', `/activity/v1/drafts/${encodeURIComponent(id)}`, draftSchema, {
      body,
      actor,
    });
  }

  public async discardDraft(id: string, actor: ActivityActorContext) {
    return this.request('DELETE', `/activity/v1/drafts/${encodeURIComponent(id)}`, draftSchema, {
      actor,
    });
  }

  public async publishDraft(
    id: string,
    body: Record<string, unknown>,
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      `/activity/v1/drafts/${encodeURIComponent(id)}/publish`,
      activitySchema,
      { body, actor },
    );
  }

  public async publishSeriesDraft(
    id: string,
    body: Record<string, unknown>,
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      `/activity/v1/drafts/${encodeURIComponent(id)}/publish-series`,
      z
        .object({
          series: z.object({ id: z.string() }).passthrough(),
          activities: z.array(activitySchema),
        })
        .passthrough(),
      { body, actor },
    );
  }

  public async markAttendance(
    activityId: string,
    body: { subjectDiscordUserId: string; status: 'present' | 'absent' },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(activityId)}/attendance`,
      z
        .object({
          id: z.string(),
          status: z.enum(['present', 'absent']),
        })
        .passthrough(),
      { body, actor },
    );
  }

  public async getSelfStats(guildId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/guilds/${encodeURIComponent(guildId)}/stats/self`,
      z
        .object({
          guildId: z.string(),
          present: z.number(),
          absent: z.number(),
          total: z.number(),
        })
        .passthrough(),
      { actor },
    );
  }

  public async listActivities(guildId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/activities?guildId=${encodeURIComponent(guildId)}`,
      activityListSchema,
      { actor },
    );
  }

  public async getActivity(id: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/activities/${encodeURIComponent(id)}`,
      activitySchema,
      { actor },
    );
  }

  public async editActivity(
    id: string,
    body: Record<string, unknown>,
    actor: ActivityActorContext,
  ) {
    return this.request(
      'PATCH',
      `/activity/v1/activities/${encodeURIComponent(id)}`,
      activitySchema,
      { body, actor },
    );
  }

  public async cancelActivity(id: string, body: { reason: string }, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/cancel`,
      activitySchema,
      { body, actor },
    );
  }

  public async rsvp(
    id: string,
    body: { statusDefId: string; guildId?: string },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/rsvp`,
      rsvpResultSchema,
      { body, actor },
    );
  }

  public async resign(id: string, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/resign`,
      z.record(z.string(), z.unknown()),
      { actor },
    );
  }

  public async listParticipants(id: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/activities/${encodeURIComponent(id)}/participants`,
      participantListSchema,
      { actor },
    );
  }

  public async reschedule(id: string, body: Record<string, unknown>, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/reschedule`,
      activitySchema,
      { body, actor },
    );
  }

  public async reconfirm(id: string, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/reconfirm`,
      z.record(z.string(), z.unknown()),
      { actor },
    );
  }

  public async getMoreData(id: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/activities/${encodeURIComponent(id)}/more`,
      z.record(z.string(), z.unknown()),
      { actor },
    );
  }

  public async getGuildConfig(guildId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/guilds/${encodeURIComponent(guildId)}/config`,
      guildConfigSchema,
      { actor },
    );
  }

  public async ensureDefaults(
    guildId: string,
    body: { orgId: string },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      `/activity/v1/guilds/${encodeURIComponent(guildId)}/ensure-defaults`,
      guildConfigSchema,
      { body, actor },
    );
  }

  public async upsertPanel(body: Record<string, unknown>, actor: ActivityActorContext) {
    return this.request('POST', '/activity/v1/panels', panelSchema, { body, actor });
  }

  public async getPanel(id: string, actor: ActivityActorContext) {
    return this.request('GET', `/activity/v1/panels/${encodeURIComponent(id)}`, panelSchema, {
      actor,
    });
  }

  public async getPanelPendingOccurrence(panelId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/panels/${encodeURIComponent(panelId)}/pending-occurrence`,
      pendingOccurrenceSchema,
      { actor },
    );
  }

  public async listPanels(guildId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/panels?guildId=${encodeURIComponent(guildId)}`,
      panelListSchema,
      { actor },
    );
  }

  public async listInbox(actor: ActivityActorContext, query?: { limit?: number; cursor?: string }) {
    const params = new URLSearchParams();
    if (query?.limit !== undefined) {
      params.set('limit', String(query.limit));
    }
    if (query?.cursor !== undefined) {
      params.set('cursor', query.cursor);
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return this.request('GET', `/activity/v1/inbox${suffix}`, inboxSchema, { actor });
  }

  public async createReport(
    activityId: string,
    body: { reasonCategory: string; details?: string },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(activityId)}/reports`,
      z.record(z.string(), z.unknown()),
      { body, actor },
    );
  }

  public async seedTestData(body: Record<string, unknown>, actor: ActivityActorContext) {
    return this.request('POST', '/activity/v1/test/seed-guild', z.record(z.string(), z.unknown()), {
      body,
      actor,
    });
  }

  public async getProjection(activityId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/activities/${encodeURIComponent(activityId)}/projection`,
      projectionSchema,
      { actor },
    );
  }

  public async putProjection(
    activityId: string,
    body: Record<string, unknown>,
    actor: ActivityActorContext,
  ) {
    return this.request(
      'PUT',
      `/activity/v1/activities/${encodeURIComponent(activityId)}/projection`,
      projectionSchema,
      { body, actor },
    );
  }

  public async lookupActivityByOpaque(opaqueId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/activities/by-opaque/${encodeURIComponent(opaqueId)}`,
      activitySchema,
      { actor },
    );
  }

  public async lookupPanelByOpaque(opaqueId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/panels/by-opaque/${encodeURIComponent(opaqueId)}`,
      panelSchema,
      { actor },
    );
  }

  /** Resolve draft UUID from signed 12-hex opaque prefix used in custom_id. */
  public async lookupDraftByOpaque(opaqueId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/drafts/by-opaque/${encodeURIComponent(opaqueId)}`,
      draftSchema,
      { actor },
    );
  }

  public async listMyActivities(guildId: string | undefined, actor: ActivityActorContext) {
    const suffix = guildId !== undefined ? `?guildId=${encodeURIComponent(guildId)}` : '';
    return this.request('GET', `/activity/v1/me/activities${suffix}`, activityListSchema, {
      actor,
    });
  }

  public async openEnrollment(id: string, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/enrollment/open`,
      activitySchema,
      { actor },
    );
  }

  public async closeEnrollment(id: string, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/enrollment/close`,
      activitySchema,
      { actor },
    );
  }

  public async takeover(id: string, body: Record<string, unknown>, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/takeover`,
      activitySchema,
      { body, actor },
    );
  }

  public async removeParticipant(
    id: string,
    body: { discordUserId: string; reason: string },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      `/activity/v1/activities/${encodeURIComponent(id)}/participants/remove`,
      z.record(z.string(), z.unknown()),
      { body, actor },
    );
  }

  public async searchLfg(
    body: {
      guildId: string;
      organizationId: string;
      activityTypeKey: string;
      characterId: string;
      sessionRoles: readonly string[];
      windowStartAt: string;
      windowEndAt: string;
    },
    actor: ActivityActorContext,
    query?: { memberRoleIds?: readonly string[] },
  ) {
    const params = new URLSearchParams();
    if (query?.memberRoleIds !== undefined && query.memberRoleIds.length > 0) {
      params.set('memberRoleIds', query.memberRoleIds.join(','));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return this.request('POST', `/activity/v1/lfg/search${suffix}`, lfgSearchResultSchema, {
      body,
      actor,
    });
  }

  public async createLfgWatch(
    body: {
      guildId: string;
      organizationId: string;
      characterId: string;
      activityTypeKey: string;
      sessionRoles: readonly string[];
      windowStartAt: string;
      windowEndAt: string;
      classSpecKey?: string;
    },
    actor: ActivityActorContext,
  ) {
    return this.request('POST', '/activity/v1/lfg/watches', lfgWatchMutationSchema, {
      body,
      actor,
    });
  }

  public async listLfgWatches(guildId: string, actor: ActivityActorContext) {
    return this.request(
      'GET',
      `/activity/v1/lfg/watches?guildId=${encodeURIComponent(guildId)}`,
      lfgWatchListSchema,
      { actor },
    );
  }

  public async cancelLfgWatch(intentId: string, guildId: string, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/lfg/watches/${encodeURIComponent(intentId)}/cancel?guildId=${encodeURIComponent(guildId)}`,
      lfgWatchMutationSchema,
      { actor },
    );
  }

  public async pauseLfgWatch(intentId: string, guildId: string, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/lfg/watches/${encodeURIComponent(intentId)}/pause?guildId=${encodeURIComponent(guildId)}`,
      lfgWatchMutationSchema,
      { actor },
    );
  }

  public async resumeLfgWatch(intentId: string, guildId: string, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/lfg/watches/${encodeURIComponent(intentId)}/resume?guildId=${encodeURIComponent(guildId)}`,
      lfgWatchMutationSchema,
      { actor },
    );
  }

  public async joinLfg(
    body: {
      activityId: string;
      statusDefId: string;
      partyRoleKey: string;
      guildId?: string;
      intentId?: string;
      characterId?: string;
    },
    actor: ActivityActorContext,
  ) {
    return this.request('POST', '/activity/v1/lfg/join', lfgJoinResultSchema, { body, actor });
  }

  public async suppressLfgMatch(
    activityId: string,
    body: {
      guildId: string;
      organizationId: string;
      fingerprint?: string;
      intentId?: string;
    },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      `/activity/v1/lfg/matches/${encodeURIComponent(activityId)}/suppress`,
      z.object({ suppressed: z.boolean().optional() }).passthrough(),
      { body, actor },
    );
  }

  public async updateLfgWatch(
    intentId: string,
    body: {
      guildId: string;
      sessionRoles: readonly string[];
      windowStartAt: string;
      windowEndAt: string;
      classSpecKey?: string;
    },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'PATCH',
      `/activity/v1/lfg/watches/${encodeURIComponent(intentId)}`,
      lfgWatchMutationSchema,
      { body, actor },
    );
  }

  public async createFullGroupWatch(
    body: {
      guildId: string;
      organizationId: string;
      activityId: string;
      characterId: string;
      sessionRoles: readonly string[];
      classSpecKey?: string;
    },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'POST',
      '/activity/v1/lfg/full-group-watches',
      z.object({ watchId: z.string().optional(), id: z.string().optional() }).passthrough(),
      { body, actor },
    );
  }

  public async cancelFullGroupWatch(watchId: string, guildId: string, actor: ActivityActorContext) {
    return this.request(
      'POST',
      `/activity/v1/lfg/full-group-watches/${encodeURIComponent(watchId)}/cancel?guildId=${encodeURIComponent(guildId)}`,
      z.object({ cancelled: z.boolean().optional() }).passthrough(),
      { actor },
    );
  }

  public async resolveActivityByOpaque(opaqueId: string, actor: ActivityActorContext) {
    return this.lookupActivityByOpaque(opaqueId, actor);
  }

  public async updateNotificationPreferences(
    body: {
      guildId: string;
      dmEnabled?: boolean;
      mutedInterestKeys?: readonly string[];
      mutedActivityTypeKeys?: readonly string[];
      mutedActivityIds?: readonly string[];
    },
    actor: ActivityActorContext,
  ) {
    return this.request(
      'PUT',
      '/activity/v1/notifications/preferences',
      z.record(z.string(), z.unknown()),
      { body, actor },
    );
  }

  private async request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    options: {
      body?: unknown;
      actor: ActivityActorContext;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-correlation-id': randomUUID(),
    };
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const idempotencyKey = options.actor.idempotencyKey ?? randomUUID();
    if (method !== 'GET') {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    if (this.deps.config.mode === 'headers') {
      headers['X-Actor-Discord-User-Id'] = options.actor.discordUserId;
      if (options.actor.v2UserId !== undefined) {
        headers['X-Actor-V2-User-Id'] = options.actor.v2UserId;
      }
    } else {
      headers[ASSERTION_HEADER] = await this.buildAssertion(options.actor);
    }

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(10_000),
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (error) {
      throw new ActivityHttpError(
        error instanceof Error ? error.message : 'Activity service network failure',
        'NETWORK',
      );
    }

    const text = await response.text().catch(() => '');
    if (response.status === 429) {
      throw new ActivityHttpError('Activity service rate limited', 'RATE_LIMITED', 429, text);
    }
    if (response.status >= 500) {
      throw new ActivityHttpError(
        'Activity service unavailable',
        'UNAVAILABLE',
        response.status,
        text,
      );
    }
    if (!response.ok) {
      throw new ActivityHttpError(
        `Activity service rejected request (${String(response.status)})`,
        'HTTP',
        response.status,
        text,
      );
    }

    let json: unknown = {};
    if (text.length > 0) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        throw new ActivityHttpError(
          'Activity service returned non-JSON',
          'VALIDATION',
          response.status,
          text,
        );
      }
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ActivityHttpError(
        'Activity response validation failed',
        'VALIDATION',
        response.status,
        text,
      );
    }
    return parsed.data;
  }

  private async buildAssertion(actor: ActivityActorContext): Promise<string> {
    const { clientId, privateKeyPem, activeKid, audience, ttlSeconds = 60 } = this.deps.config;
    if (
      clientId === undefined ||
      privateKeyPem === undefined ||
      activeKid === undefined ||
      audience === undefined
    ) {
      throw new ActivityHttpError(
        'Activity assertion mode is incompletely configured',
        'VALIDATION',
      );
    }
    const ttl = Math.min(Math.max(1, ttlSeconds), 60);
    const key = await importPKCS8(privateKeyPem, 'EdDSA');
    return new SignJWT({
      jti: randomUUID(),
      actor_discord_user_id: actor.discordUserId,
      ...(actor.v2UserId !== undefined ? { actor_v2_user_id: actor.v2UserId } : {}),
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: activeKid })
      .setIssuer(clientId)
      .setSubject(clientId)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(key);
  }
}

export function createActivityHttpClientOrNull(
  config: {
    DISCORD_ACTIVITY_ENABLED: boolean;
    ACTIVITY_SERVICE_BASE_URL: string;
    ACTIVITY_CLIENT_MODE: ActivityClientMode;
    ACTIVITY_ORGANIZATION_ID: string;
    DISCORD_TO_ACTIVITY_CLIENT_ID?: string | undefined;
    DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM?: string | undefined;
    DISCORD_TO_ACTIVITY_ACTIVE_KID?: string | undefined;
    ACTIVITY_ASSERTION_AUD?: string | undefined;
    DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS?: number | undefined;
  },
  fetchImpl?: typeof fetch,
): ActivityHttpClient | null {
  if (!config.DISCORD_ACTIVITY_ENABLED) {
    return null;
  }
  const clientConfig: ActivityHttpClientConfig = {
    baseUrl: config.ACTIVITY_SERVICE_BASE_URL,
    mode: config.ACTIVITY_CLIENT_MODE,
    organizationId: config.ACTIVITY_ORGANIZATION_ID,
  };
  if (config.DISCORD_TO_ACTIVITY_CLIENT_ID !== undefined) {
    (clientConfig as { clientId?: string }).clientId = config.DISCORD_TO_ACTIVITY_CLIENT_ID;
  }
  if (config.DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM !== undefined) {
    (clientConfig as { privateKeyPem?: string }).privateKeyPem =
      config.DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM;
  }
  if (config.DISCORD_TO_ACTIVITY_ACTIVE_KID !== undefined) {
    (clientConfig as { activeKid?: string }).activeKid = config.DISCORD_TO_ACTIVITY_ACTIVE_KID;
  }
  if (config.ACTIVITY_ASSERTION_AUD !== undefined) {
    (clientConfig as { audience?: string }).audience = config.ACTIVITY_ASSERTION_AUD;
  }
  if (config.DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS !== undefined) {
    (clientConfig as { ttlSeconds?: number }).ttlSeconds =
      config.DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS;
  }

  return new ActivityHttpClient({
    config: clientConfig,
    ...(fetchImpl !== undefined ? { fetchImpl } : {}),
  });
}
