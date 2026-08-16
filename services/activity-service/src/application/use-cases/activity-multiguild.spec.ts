import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/require-await -- in-memory repository fake */

import { FixedClock } from '../../domain/clock.js';
import { ActivityError } from '../../domain/errors.js';
import type {
  ActivityRecord,
  ActivityRepositoryPort,
  ActivityTx,
  ActivityTypeRecord,
  AuthorizePort,
  AuthorizeRequest,
  AuthorizeResult,
  GuildActivitySettingsRecord,
  HubPanelRecord,
  InboxItemRecord,
} from '../ports/activity.ports.js';
import { ActivityAdminUseCases } from './activity-admin.use-cases.js';
import { ActivityUseCases } from './activity.use-cases.js';

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';

class GuildScopedAuthz implements AuthorizePort {
  public constructor(private readonly allowedGuildIds: ReadonlySet<string>) {}

  public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    const guildId = request.scope.guildId;
    const allowed = guildId !== undefined && this.allowedGuildIds.has(guildId);
    return Promise.resolve({
      allowed,
      permissionId: request.permissionId,
      decision: allowed ? 'allow' : 'deny',
    });
  }
}

class AllowAuthz implements AuthorizePort {
  public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    return Promise.resolve({
      allowed: true,
      permissionId: request.permissionId,
      decision: 'allow',
    });
  }
}

/** Multi-guild-aware in-memory repository (adapted from activity.use-cases.spec.ts). */
function createMemoryRepo(): ActivityRepositoryPort & {
  activities: Map<string, ActivityRecord>;
  outbox: unknown[];
  inbox: Map<string, InboxItemRecord>;
  reports: { id: string; guildId: string; activityId: string }[];
  panels: Map<string, HubPanelRecord>;
  types: Map<string, ActivityTypeRecord>;
} {
  const activities = new Map<string, ActivityRecord>();
  const drafts = new Map<
    string,
    {
      id: string;
      guildId: string;
      creatorSubjectType: 'discord' | 'v2';
      creatorDiscordUserId: string | null;
      creatorV2UserId: string | null;
      payload: Record<string, unknown>;
      expiresAt: Date;
      createdAt: Date;
      updatedAt: Date;
    }
  >();
  const statuses = new Map<
    string,
    {
      id: string;
      guildId: string;
      label: string;
      occupiesSlot: boolean;
      behavior: 'confirmed' | 'tentative' | 'declined' | 'custom';
      selectableByMember: boolean;
      active: boolean;
      sortOrder: number;
      seedKey: string | null;
    }
  >();
  const settingsByGuild = new Map<string, GuildActivitySettingsRecord>();
  const types = new Map<string, ActivityTypeRecord>();
  const panels = new Map<string, HubPanelRecord>();
  const participations = new Map<
    string,
    {
      id: string;
      activityId: string;
      discordUserId: string | null;
      v2UserId: string | null;
      statusDefId: string;
      confirmationState: 'confirmed' | 'requires_reconfirmation';
      reconfirmDeadline: Date | null;
      waitlistPosition: number | null;
      resignedAt: Date | null;
      removedAt: Date | null;
      removeReason: string | null;
      occupiesSlot: boolean;
      statusBehavior: 'confirmed' | 'tentative' | 'declined' | 'custom';
    }
  >();
  const outbox: unknown[] = [];
  const inbox = new Map<string, InboxItemRecord>();
  const reports: {
    id: string;
    guildId: string;
    activityId: string;
    reporterDiscordUserId: string;
    reasonCategory: string;
    details: string | null;
    status: string;
    createdAt: Date;
  }[] = [];
  const projections = new Map<string, { activityId: string; guildId: string }>();
  const idempotency = new Map<string, { responseStatus: number; responseBody: unknown }>();
  let inboxSeq = 0;
  let panelSeq = 0;

  function defaultSettings(
    guildId: string,
    orgId: string,
    confirmedId: string,
  ): GuildActivitySettingsRecord {
    return {
      guildId,
      orgId,
      organizerDefaultStatusId: confirmedId,
      waitlistPromotionStatusId: confirmedId,
      maxActivePerCreator: 4,
      registrationDefaultClosesAtStart: true,
      allowedPublishChannelIds: [],
      configRevision: 1,
      allowOtherActivity: true,
      maxCreateHorizonDays: 14,
      postRetentionHoursAfterFinish: 72,
      reminders: [],
      dmNotificationsEnabled: true,
      pingRoleIds: [],
      hubChannelId: null,
    };
  }

  const tx: ActivityTx = {
    async lockCreatorAdvisory() {},
    async lockActivity(id) {
      const a = activities.get(id);
      if (a === undefined) throw new ActivityError('NOT_FOUND', 'missing');
      return a;
    },
    async ensureGuildDefaults({ guildId, orgId }) {
      const confirmedId = `${guildId}:status-confirmed`;
      const tentativeId = `${guildId}:status-tentative`;
      if (!statuses.has(confirmedId)) {
        statuses.set(confirmedId, {
          id: confirmedId,
          guildId,
          label: `Będę-${guildId.slice(-4)}`,
          occupiesSlot: true,
          behavior: 'confirmed',
          selectableByMember: true,
          active: true,
          sortOrder: 10,
          seedKey: 'confirmed',
        });
        statuses.set(tentativeId, {
          id: tentativeId,
          guildId,
          label: `Może-${guildId.slice(-4)}`,
          occupiesSlot: false,
          behavior: 'tentative',
          selectableByMember: true,
          active: true,
          sortOrder: 20,
          seedKey: 'tentative',
        });
      }
      if (!settingsByGuild.has(guildId)) {
        settingsByGuild.set(guildId, defaultSettings(guildId, orgId, confirmedId));
      }
      const otherTypeId = `${guildId}:type-other`;
      if (!types.has(otherTypeId)) {
        const now = new Date();
        types.set(otherTypeId, {
          id: otherTypeId,
          guildId,
          key: 'other',
          label: `Inna-${guildId.slice(-4)}`,
          enabled: true,
          isOther: true,
          sortOrder: 1000,
          statusDefIds: [],
          participantFields: [],
          createdAt: now,
          updatedAt: now,
        });
      }
      return {
        settings: settingsByGuild.get(guildId)!,
        statuses: [...statuses.values()].filter((s) => s.guildId === guildId),
      };
    },
    async getSettings(guildId) {
      return settingsByGuild.get(guildId) ?? null;
    },
    async updateSettings(guildId, patch) {
      const current = settingsByGuild.get(guildId);
      if (current === undefined) throw new ActivityError('NOT_FOUND', 'settings');
      const next = {
        ...current,
        organizerDefaultStatusId:
          patch.organizerDefaultStatusId ?? current.organizerDefaultStatusId,
        waitlistPromotionStatusId:
          patch.waitlistPromotionStatusId ?? current.waitlistPromotionStatusId,
        maxActivePerCreator: patch.maxActivePerCreator ?? current.maxActivePerCreator,
        registrationDefaultClosesAtStart:
          patch.registrationDefaultClosesAtStart ?? current.registrationDefaultClosesAtStart,
      };
      settingsByGuild.set(guildId, next);
      return next;
    },
    async listStatusDefs(guildId) {
      return [...statuses.values()].filter((s) => s.guildId === guildId);
    },
    async getStatusDef(id) {
      return statuses.get(id) ?? null;
    },
    async countActiveOwn(guildId, organizerDiscordUserId) {
      return [...activities.values()].filter(
        (a) =>
          a.guildId === guildId &&
          a.organizerDiscordUserId === organizerDiscordUserId &&
          ['published', 'registrations_open', 'registrations_closed', 'in_progress'].includes(
            a.status,
          ),
      ).length;
    },
    async insertDraft(input) {
      const now = new Date();
      const draft = { ...input, createdAt: now, updatedAt: now };
      drafts.set(draft.id, draft);
      return draft;
    },
    async getDraft(id) {
      return drafts.get(id) ?? null;
    },
    async getDraftByOpaque(opaqueId) {
      for (const draft of drafts.values()) {
        if (draft.id.replace(/-/g, '').slice(0, 12) === opaqueId) {
          return draft;
        }
      }
      return null;
    },
    async updateDraft(id, patch) {
      const draft = drafts.get(id);
      if (draft === undefined) throw new ActivityError('NOT_FOUND', 'draft');
      const next = {
        ...draft,
        payload: patch.payload ?? draft.payload,
        expiresAt: patch.expiresAt ?? draft.expiresAt,
        updatedAt: new Date(),
      };
      drafts.set(id, next);
      return next;
    },
    async deleteDraft(id) {
      drafts.delete(id);
    },
    async insertActivity(input) {
      const now = new Date();
      const activity: ActivityRecord = {
        ...input,
        opaqueId: input.opaqueId ?? input.id.replace(/-/g, '').slice(0, 12),
        version: input.version ?? 1,
        createdAt: now,
        updatedAt: now,
      };
      activities.set(activity.id, activity);
      return activity;
    },
    async getActivityByOpaqueId(opaqueId) {
      return [...activities.values()].find((a) => a.opaqueId === opaqueId) ?? null;
    },
    async updateActivity(activity) {
      activities.set(activity.id, { ...activity, updatedAt: new Date() });
      return activities.get(activity.id)!;
    },
    async getActivity(id) {
      return activities.get(id) ?? null;
    },
    async listActivities(guildId) {
      return [...activities.values()].filter(
        (a) => a.guildId === guildId && a.status !== 'deleted',
      );
    },
    async listMyActivities(input) {
      return [...activities.values()].filter((a) => {
        if (input.guildId !== undefined && a.guildId !== input.guildId) return false;
        return a.organizerDiscordUserId === input.discordUserId;
      });
    },
    async listParticipations(activityId) {
      return [...participations.values()].filter((p) => p.activityId === activityId);
    },
    async getParticipation(activityId, discordUserId) {
      return (
        [...participations.values()].find(
          (p) =>
            p.activityId === activityId &&
            p.discordUserId === discordUserId &&
            p.resignedAt === null &&
            p.removedAt === null,
        ) ?? null
      );
    },
    async upsertParticipation(input) {
      const status = statuses.get(input.statusDefId);
      const record = {
        ...input,
        resignedAt: input.resignedAt ?? null,
        removedAt: input.removedAt ?? null,
        removeReason: input.removeReason ?? null,
        occupiesSlot: status?.occupiesSlot ?? false,
        statusBehavior: status?.behavior ?? 'custom',
      };
      participations.set(record.id, record);
      return record;
    },
    async markParticipationResigned(id, at) {
      const p = participations.get(id);
      if (p) participations.set(id, { ...p, resignedAt: at, waitlistPosition: null });
    },
    async markParticipationRemoved(id, at, reason) {
      const p = participations.get(id);
      if (p)
        participations.set(id, {
          ...p,
          removedAt: at,
          removeReason: reason,
          waitlistPosition: null,
        });
    },
    async clearWaitlistPosition(id) {
      const p = participations.get(id);
      if (p) participations.set(id, { ...p, waitlistPosition: null });
    },
    async upsertPanel(input) {
      const key = `${input.organizationId}:${input.discordGuildId}:${input.panelType}`;
      const existing = panels.get(key);
      if (existing === undefined) {
        panelSeq += 1;
        const id = `panel-${panelSeq}`;
        const panel: HubPanelRecord = {
          id,
          organizationId: input.organizationId,
          discordGuildId: input.discordGuildId,
          channelId: input.channelId,
          messageId: input.messageId ?? null,
          panelType: input.panelType,
          payloadVersion: input.payloadVersion ?? 1,
          status: input.status ?? 'unconfigured',
          opaqueId: input.opaqueId ?? `panelopaque${panelSeq}`.padEnd(12, '0').slice(0, 12),
        };
        panels.set(key, panel);
        return { panel, repaired: false };
      }
      const next: HubPanelRecord = {
        ...existing,
        channelId: input.channelId,
        messageId: input.messageId === undefined ? existing.messageId : input.messageId,
        status: input.status ?? existing.status,
        payloadVersion: input.payloadVersion ?? existing.payloadVersion,
      };
      panels.set(key, next);
      return { panel: next, repaired: false };
    },
    async getPanel(id) {
      return [...panels.values()].find((p) => p.id === id) ?? null;
    },
    async getPanelByOpaqueId(opaqueId) {
      return [...panels.values()].find((p) => p.opaqueId === opaqueId) ?? null;
    },
    async listPanels(guildId) {
      return [...panels.values()].filter((p) => p.discordGuildId === guildId);
    },
    async insertPublishOccurrence() {},
    async insertOutbox(message) {
      outbox.push(message);
    },
    async claimOutbox() {
      return [];
    },
    async completeOutbox() {},
    async failOutbox() {},
    async permanentFailOutbox() {},
    async listInbox(input) {
      const items = [...inbox.values()]
        .filter((item) => item.recipientDiscordUserId === input.discordUserId)
        .filter((item) => input.guildId === undefined || item.guildId === input.guildId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, input.limit);
      return { items, nextCursor: null };
    },
    async markInboxRead() {
      throw new ActivityError('NOT_FOUND', 'Inbox item not found');
    },
    async enqueueInbox(input) {
      const dedupe =
        input.dedupeKey !== undefined
          ? `${input.recipientDiscordUserId}:${input.kind}:${input.dedupeKey}`
          : null;
      if (dedupe !== null) {
        const existing = inbox.get(dedupe);
        if (existing !== undefined) {
          return { item: existing, created: false };
        }
      }
      inboxSeq += 1;
      const item: InboxItemRecord = {
        id: `inbox-${inboxSeq}`,
        guildId: input.guildId,
        recipientDiscordUserId: input.recipientDiscordUserId,
        recipientV2UserId: null,
        kind: input.kind,
        payload:
          input.dedupeKey !== undefined
            ? { ...input.payload, dedupeKey: input.dedupeKey }
            : input.payload,
        readAt: null,
        createdAt: new Date(),
      };
      inbox.set(dedupe ?? item.id, item);
      return { item, created: true };
    },
    async createReport(input) {
      const report = {
        id: input.id,
        guildId: input.guildId,
        activityId: input.activityId,
        reporterDiscordUserId: input.reporterDiscordUserId,
        reasonCategory: input.reasonCategory,
        details: input.details ?? null,
        status: 'open',
        createdAt: new Date(),
      };
      reports.push(report);
      return report;
    },
    async listReports(guildId) {
      return reports.filter((r) => r.guildId === guildId);
    },
    async upsertActivityProjection(input) {
      projections.set(input.activityId, {
        activityId: input.activityId,
        guildId: input.guildId,
      });
      return {
        activityId: input.activityId,
        guildId: input.guildId,
        channelId: input.channelId,
        messageId: input.messageId ?? null,
        status: input.status ?? 'pending',
        opaqueId: input.opaqueId,
        revision: 1,
        lastError: null,
        retryCount: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        desiredPayloadVersion: 1,
        updatedAt: new Date(),
      };
    },
    async getActivityProjection(activityId) {
      const row = projections.get(activityId);
      if (row === undefined) return null;
      return {
        activityId: row.activityId,
        guildId: row.guildId,
        channelId: '',
        messageId: null,
        status: 'pending',
        opaqueId: '',
        revision: 1,
        lastError: null,
        retryCount: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        desiredPayloadVersion: 1,
        updatedAt: new Date(),
      };
    },
    async claimProjectionRepair() {
      return [];
    },
    async setAllowedPublishChannelIds() {},
    async putGuildAdminConfig() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async setPingRoleIds() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async setHubChannelId() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async listActivityTypes(guildId) {
      return [...types.values()].filter((t) => t.guildId === guildId);
    },
    async getActivityType(id) {
      return types.get(id) ?? null;
    },
    async insertActivityType(input) {
      const now = new Date();
      const record: ActivityTypeRecord = {
        id: input.id,
        guildId: input.guildId,
        key: input.key,
        label: input.label,
        enabled: input.enabled ?? true,
        isOther: input.isOther ?? false,
        sortOrder: input.sortOrder ?? 0,
        statusDefIds: input.statusDefIds ?? [],
        participantFields: input.participantFields ?? [],
        createdAt: now,
        updatedAt: now,
      };
      types.set(record.id, record);
      return record;
    },
    async updateActivityType() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async countActivitiesUsingType() {
      return 0;
    },
    async deactivateActivityType() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async insertStatusDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async updateStatusDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async deactivateStatusDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async countParticipationsUsingStatus() {
      return 0;
    },
    async listParticipantFieldDefs() {
      return [];
    },
    async getParticipantFieldDef() {
      return null;
    },
    async insertParticipantFieldDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async updateParticipantFieldDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async deactivateParticipantFieldDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async listReportReasonDefs() {
      return [];
    },
    async getReportReasonDef() {
      return null;
    },
    async insertReportReasonDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async updateReportReasonDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async deactivateReportReasonDef() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async listAdminEvents() {
      return { items: [], total: 0 };
    },
    async listProjectionProblems() {
      return [];
    },
    async updateReportStatus() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
    },
    async getReport() {
      return null;
    },
    async listAuditEntries() {
      return { items: [], total: 0 };
    },
    async findIdempotency(input) {
      return (
        idempotency.get(
          `${input.scope}:${input.actorKey}:${input.operation}:${input.idempotencyKey}`,
        ) ?? null
      );
    },
    async saveIdempotency(input) {
      idempotency.set(
        `${input.scope}:${input.actorKey}:${input.operation}:${input.idempotencyKey}`,
        { responseStatus: input.responseStatus, responseBody: input.responseBody },
      );
    },
    async insertAudit() {},
    async ping() {},
    async listExpiredReconfirmations() {
      return [];
    },
    async listActivitiesDueForFinish() {
      return [];
    },
  };

  return {
    activities,
    outbox,
    inbox,
    reports,
    panels,
    types,
    async withTransaction<T>(fn: (inner: ActivityTx) => Promise<T>): Promise<T> {
      return fn(tx);
    },
    async ping() {},
  };
}

async function publishForGuild(
  useCases: ActivityUseCases,
  guildId: string,
  actor: { discordUserId: string },
  name: string,
) {
  const draft = await useCases.createDraft({ guildId }, { actor });
  return useCases.publishDraft(
    draft.id,
    {
      organizationId: 'org-1',
      name,
      startAt: new Date('2026-08-20T18:00:00.000Z'),
      participantLimit: 4,
    },
    { actor, idempotencyKey: `pub-${guildId}-${name}` },
  );
}

describe('Activity multi-guild isolation', () => {
  const clock = new FixedClock(new Date('2026-08-16T12:00:00.000Z'));
  const actorBoth = { discordUserId: 'user-both' };
  const actorBOnly = { discordUserId: 'user-b-only' };

  it('isolates config, types, statuses, activities, inbox, reports, panels, and outbox guildId', async () => {
    const repo = createMemoryRepo();
    const allow = new AllowAuthz();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: allow,
      clock,
    });
    const admin = new ActivityAdminUseCases({
      repository: repo,
      authorize: allow,
      clock,
    });

    await useCases.ensureGuildDefaults(GUILD_A, 'org-1', { actor: actorBoth });
    await useCases.ensureGuildDefaults(GUILD_B, 'org-1', { actor: actorBoth });

    const configA = await useCases.getGuildConfig(GUILD_A, actorBoth);
    const configB = await useCases.getGuildConfig(GUILD_B, actorBoth);
    expect(configA.statuses.every((s) => s.guildId === GUILD_A)).toBe(true);
    expect(configB.statuses.every((s) => s.guildId === GUILD_B)).toBe(true);
    expect(configA.statuses.map((s) => s.id)).not.toEqual(configB.statuses.map((s) => s.id));

    const typesA = await admin.listTypes(GUILD_A, actorBoth);
    const typesB = await admin.listTypes(GUILD_B, actorBoth);
    expect(typesA.every((t) => t.guildId === GUILD_A)).toBe(true);
    expect(typesB.every((t) => t.guildId === GUILD_B)).toBe(true);
    expect(typesA.map((t) => t.id)).not.toEqual(typesB.map((t) => t.id));

    const activityA = await publishForGuild(useCases, GUILD_A, actorBoth, 'Raid A');
    const activityB = await publishForGuild(useCases, GUILD_B, actorBoth, 'Raid B');

    const listedA = await useCases.listActivities(GUILD_A, actorBoth);
    const listedB = await useCases.listActivities(GUILD_B, actorBoth);
    expect(listedA.map((a) => a.id)).toEqual([activityA.id]);
    expect(listedB.map((a) => a.id)).toEqual([activityB.id]);

    const bOnlyAuthz = new GuildScopedAuthz(new Set([GUILD_B]));
    const useCasesBOnly = new ActivityUseCases({
      repository: repo,
      authorize: bOnlyAuthz,
      clock,
    });
    await expect(useCasesBOnly.getActivity(activityA.id, actorBOnly)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(useCasesBOnly.getActivity(activityB.id, actorBOnly)).resolves.toMatchObject({
      id: activityB.id,
      guildId: GUILD_B,
    });

    await useCases.enqueueInbox(
      {
        guildId: GUILD_A,
        recipientDiscordUserId: actorBoth.discordUserId,
        kind: 'activity.reminder',
        payload: { activityId: activityA.id },
        dedupeKey: 'a-1',
      },
      { actor: actorBoth },
    );
    await useCases.enqueueInbox(
      {
        guildId: GUILD_B,
        recipientDiscordUserId: actorBoth.discordUserId,
        kind: 'activity.reminder',
        payload: { activityId: activityB.id },
        dedupeKey: 'b-1',
      },
      { actor: actorBoth },
    );
    const inboxB = await useCases.listInbox(actorBoth, { guildId: GUILD_B });
    expect(inboxB.items).toHaveLength(1);
    expect(inboxB.items[0]?.guildId).toBe(GUILD_B);

    await useCases.createReport(
      activityA.id,
      { reasonCategory: 'spam', details: 'bad' },
      { actor: actorBoth, idempotencyKey: 'rep-a' },
    );
    await useCases.createReport(
      activityB.id,
      { reasonCategory: 'spam', details: 'also bad' },
      { actor: actorBoth, idempotencyKey: 'rep-b' },
    );
    const reportsA = await useCases.listReports(GUILD_A, actorBoth);
    const reportsB = await useCases.listReports(GUILD_B, actorBoth);
    expect(reportsA).toHaveLength(1);
    expect(reportsA[0]?.activityId).toBe(activityA.id);
    expect(reportsB).toHaveLength(1);
    expect(reportsB[0]?.activityId).toBe(activityB.id);

    const panelA = await useCases.upsertPanel(
      {
        organizationId: 'org-1',
        discordGuildId: GUILD_A,
        channelId: 'channel-a',
        panelType: 'hub',
      },
      { actor: actorBoth, idempotencyKey: 'panel-a' },
    );
    const panelB = await useCases.upsertPanel(
      {
        organizationId: 'org-1',
        discordGuildId: GUILD_B,
        channelId: 'channel-b',
        panelType: 'hub',
      },
      { actor: actorBoth, idempotencyKey: 'panel-b' },
    );
    expect(panelA.id).not.toBe(panelB.id);
    expect(panelA.discordGuildId).toBe(GUILD_A);
    expect(panelB.discordGuildId).toBe(GUILD_B);
    const panelsA = await useCases.listPanels(GUILD_A, actorBoth);
    const panelsB = await useCases.listPanels(GUILD_B, actorBoth);
    expect(panelsA.map((p) => p.id)).toEqual([panelA.id]);
    expect(panelsB.map((p) => p.id)).toEqual([panelB.id]);

    const outboxForA = repo.outbox.filter((entry) => {
      const payload = (entry as { payload?: { guildId?: string; activityId?: string } }).payload;
      return payload?.activityId === activityA.id || payload?.guildId === GUILD_A;
    });
    const outboxForB = repo.outbox.filter((entry) => {
      const payload = (entry as { payload?: { guildId?: string; activityId?: string } }).payload;
      return payload?.activityId === activityB.id || payload?.guildId === GUILD_B;
    });
    expect(outboxForA.length).toBeGreaterThan(0);
    expect(outboxForB.length).toBeGreaterThan(0);
    for (const entry of outboxForA) {
      const payload = (entry as { payload: Record<string, unknown> }).payload;
      if (typeof payload.guildId === 'string') {
        expect(payload.guildId).toBe(GUILD_A);
      }
      if (typeof payload.activityId === 'string' && payload.activityId === activityA.id) {
        expect(payload.guildId).toBe(GUILD_A);
      }
    }
    for (const entry of outboxForB) {
      const payload = (entry as { payload: Record<string, unknown> }).payload;
      if (typeof payload.guildId === 'string') {
        expect(payload.guildId).toBe(GUILD_B);
      }
      if (typeof payload.activityId === 'string' && payload.activityId === activityB.id) {
        expect(payload.guildId).toBe(GUILD_B);
      }
    }

    const projectionOutbox = repo.outbox.filter(
      (e) => (e as { eventType: string }).eventType === 'activity.activity.projection_requested.v1',
    ) as Array<{ payload: { activityId: string; guildId: string } }>;
    expect(projectionOutbox.some((e) => e.payload.activityId === activityA.id)).toBe(true);
    expect(projectionOutbox.some((e) => e.payload.activityId === activityB.id)).toBe(true);
    for (const entry of projectionOutbox) {
      if (entry.payload.activityId === activityA.id) {
        expect(entry.payload.guildId).toBe(GUILD_A);
      }
      if (entry.payload.activityId === activityB.id) {
        expect(entry.payload.guildId).toBe(GUILD_B);
      }
    }
  });

  it('keeps RSVP participants guild-scoped and denies cross-guild participant reads', async () => {
    const repo = createMemoryRepo();
    const allow = new AllowAuthz();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: allow,
      clock,
    });

    await useCases.ensureGuildDefaults(GUILD_A, 'org-1', { actor: actorBoth });
    await useCases.ensureGuildDefaults(GUILD_B, 'org-1', { actor: actorBoth });

    const activityA = await publishForGuild(useCases, GUILD_A, actorBoth, 'Raid A RSVP');
    const activityB = await publishForGuild(useCases, GUILD_B, actorBoth, 'Raid B RSVP');

    const configA = await useCases.getGuildConfig(GUILD_A, actorBoth);
    const configB = await useCases.getGuildConfig(GUILD_B, actorBoth);
    const statusA = configA.statuses.find((s) => s.occupiesSlot && s.selectableByMember);
    const statusB = configB.statuses.find((s) => s.occupiesSlot && s.selectableByMember);
    expect(statusA).toBeDefined();
    expect(statusB).toBeDefined();
    expect(statusA!.id).not.toBe(statusB!.id);

    await useCases.rsvp(
      activityA.id,
      { statusDefId: statusA!.id },
      { actor: { discordUserId: 'member-a' }, idempotencyKey: 'rsvp-a' },
    );
    await useCases.rsvp(
      activityB.id,
      { statusDefId: statusB!.id },
      { actor: { discordUserId: 'member-b' }, idempotencyKey: 'rsvp-b' },
    );

    const participantsA = await useCases.listParticipants(activityA.id, actorBoth);
    const participantsB = await useCases.listParticipants(activityB.id, actorBoth);
    const memberA = participantsA.find((p) => p.discordUserId === 'member-a');
    const memberB = participantsB.find((p) => p.discordUserId === 'member-b');
    expect(memberA?.statusDefId).toBe(statusA!.id);
    expect(memberB?.statusDefId).toBe(statusB!.id);
    expect(participantsA.some((p) => p.discordUserId === 'member-b')).toBe(false);
    expect(participantsB.some((p) => p.discordUserId === 'member-a')).toBe(false);

    await expect(
      useCases.rsvp(
        activityA.id,
        { statusDefId: statusB!.id },
        { actor: { discordUserId: 'member-cross' }, idempotencyKey: 'rsvp-cross-status' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const bOnlyAuthz = new GuildScopedAuthz(new Set([GUILD_B]));
    const useCasesBOnly = new ActivityUseCases({
      repository: repo,
      authorize: bOnlyAuthz,
      clock,
    });
    await expect(useCasesBOnly.listParticipants(activityA.id, actorBOnly)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const bParticipants = await useCasesBOnly.listParticipants(activityB.id, actorBOnly);
    expect(bParticipants.some((p) => p.discordUserId === 'member-b')).toBe(true);
    expect(bParticipants.every((p) => p.activityId === activityB.id)).toBe(true);
  });
});
