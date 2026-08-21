import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/require-await -- in-memory repository fake */

import { FixedClock } from '../../domain/clock.js';
import { ActivityError } from '../../domain/errors.js';
import { ACTIVITY_PERMISSIONS } from '../../domain/permissions.js';
import type {
  ActivityRecord,
  ActivityRepositoryPort,
  ActivityTx,
  AuthorizePort,
  AuthorizeRequest,
  AuthorizeResult,
} from '../ports/activity.ports.js';
import { ActivityUseCases } from './activity.use-cases.js';

class AllowAuthz implements AuthorizePort {
  public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    return Promise.resolve({
      allowed: true,
      permissionId: request.permissionId,
      decision: 'allow',
    });
  }
}

class DenyHorizonAuthz implements AuthorizePort {
  public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    const extended =
      request.permissionId === ACTIVITY_PERMISSIONS.MANAGE_GUILD ||
      request.permissionId === ACTIVITY_PERMISSIONS.CREATE_RECURRING;
    return Promise.resolve({
      allowed: !extended,
      permissionId: request.permissionId,
      decision: extended ? 'deny' : 'allow',
    });
  }
}

/** Minimal in-memory repository covering publish + RSVP flows for unit tests. */
function createMemoryRepo(): ActivityRepositoryPort & {
  activities: Map<string, ActivityRecord>;
  outbox: unknown[];
  inbox: Map<string, unknown>;
  reports: unknown[];
  projections: Map<string, unknown>;
} {
  const activities = new Map<string, ActivityRecord>();
  const seriesMap = new Map<string, import('../ports/activity.ports.js').ActivitySeriesRecord>();
  const attendanceMap = new Map<string, import('../ports/activity.ports.js').AttendanceRecord>();
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
      scopeGuildId: string | null;
      resignedAt: Date | null;
      removedAt: Date | null;
      removeReason: string | null;
      occupiesSlot: boolean;
      statusBehavior: 'confirmed' | 'tentative' | 'declined' | 'custom';
    }
  >();
  const outbox: unknown[] = [];
  const inbox = new Map<
    string,
    {
      id: string;
      guildId: string;
      recipientDiscordUserId: string | null;
      recipientV2UserId: string | null;
      kind: string;
      payload: Record<string, unknown>;
      readAt: Date | null;
      createdAt: Date;
    }
  >();
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
  const projections = new Map<
    string,
    {
      id: string;
      activityId: string;
      guildId: string;
      channelId: string;
      messageId: string | null;
      status: string;
      opaqueId: string;
      revision: number;
      lastError: string | null;
      retryCount: number;
      leaseOwner: string | null;
      leaseExpiresAt: Date | null;
      desiredPayloadVersion: number;
      updatedAt: Date;
    }
  >();
  const publicationTargets = new Map<
    string,
    {
      id: string;
      activityId: string;
      organizationId: string;
      guildId: string;
      channelId: string;
      participantLimit: number | null;
      sortOrder: number;
    }[]
  >();
  const idempotency = new Map<string, { responseStatus: number; responseBody: unknown }>();
  let confirmedId = '';
  let inboxSeq = 0;
  const tx: ActivityTx = {
    async lockCreatorAdvisory() {},
    async lockActivity(id) {
      const a = activities.get(id);
      if (a === undefined) throw new ActivityError('NOT_FOUND', 'missing');
      return a;
    },
    async ensureGuildDefaults({ guildId, orgId }) {
      confirmedId = confirmedId || 'status-confirmed';
      statuses.set(confirmedId, {
        id: confirmedId,
        guildId,
        label: 'Będę',
        occupiesSlot: true,
        behavior: 'confirmed',
        selectableByMember: true,
        active: true,
        sortOrder: 10,
        seedKey: 'confirmed',
      });
      statuses.set('status-tentative', {
        id: 'status-tentative',
        guildId,
        label: 'Może będę',
        occupiesSlot: false,
        behavior: 'tentative',
        selectableByMember: true,
        active: true,
        sortOrder: 20,
        seedKey: 'tentative',
      });
      return {
        settings: {
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
        },
        statuses: [...statuses.values()].filter((s) => s.guildId === guildId),
      };
    },
    async getSettings(guildId) {
      return {
        guildId,
        orgId: 'org',
        organizerDefaultStatusId: confirmedId || 'status-confirmed',
        waitlistPromotionStatusId: confirmedId || 'status-confirmed',
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
    },
    async updateSettings(guildId, patch) {
      return {
        guildId,
        orgId: 'org',
        organizerDefaultStatusId: patch.organizerDefaultStatusId ?? confirmedId,
        waitlistPromotionStatusId: patch.waitlistPromotionStatusId ?? confirmedId,
        maxActivePerCreator: patch.maxActivePerCreator ?? 4,
        registrationDefaultClosesAtStart: patch.registrationDefaultClosesAtStart ?? true,
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
        participantMode: input.participantMode ?? 'shared',
        seriesId: input.seriesId ?? null,
        seriesOccurrenceIndex: input.seriesOccurrenceIndex ?? null,
        visibility: input.visibility ?? 'public',
        privateInviteTokenHash: input.privateInviteTokenHash ?? null,
        privateRoleIds: input.privateRoleIds ?? [],
        opaqueId: input.opaqueId ?? input.id.replace(/-/g, '').slice(0, 12),
        version: input.version ?? 1,
        createdAt: now,
        updatedAt: now,
      };
      activities.set(activity.id, activity);
      return activity;
    },
    async listActivitiesBySeries(seriesId) {
      return [...activities.values()]
        .filter((a) => a.seriesId === seriesId && a.status !== 'deleted')
        .sort((a, b) => (a.seriesOccurrenceIndex ?? 0) - (b.seriesOccurrenceIndex ?? 0));
    },
    async insertSeries(input) {
      const now = new Date();
      const series = {
        ...input,
        opaqueId: input.opaqueId ?? input.id.replace(/-/g, '').slice(0, 12),
        version: input.version ?? 1,
        createdAt: now,
        updatedAt: now,
      };
      seriesMap.set(series.id, series);
      return series;
    },
    async getSeries(id) {
      return seriesMap.get(id) ?? null;
    },
    async updateSeries(series) {
      const next = { ...series, updatedAt: new Date() };
      seriesMap.set(series.id, next);
      return next;
    },
    async upsertAttendance(input) {
      const key = `${input.activityId}:${input.subjectDiscordUserId}`;
      const record = {
        ...input,
        markedAt: input.markedAt ?? new Date(),
      };
      attendanceMap.set(key, record);
      return record;
    },
    async listAttendance(activityId) {
      return [...attendanceMap.values()].filter((r) => r.activityId === activityId);
    },
    async listAttendanceForSubject(input) {
      return [...attendanceMap.values()].filter(
        (r) => r.guildId === input.guildId && r.subjectDiscordUserId === input.subjectDiscordUserId,
      );
    },
    async listAttendanceForGuild(guildId) {
      return [...attendanceMap.values()].filter((r) => r.guildId === guildId);
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
    async listMyActivities() {
      return [...activities.values()];
    },
    async listParticipations(activityId) {
      return [...participations.values()].filter((p) => p.activityId === activityId);
    },
    async listParticipationsForActivities(activityIds) {
      const ids = new Set(activityIds);
      return [...participations.values()].filter((p) => ids.has(p.activityId));
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
        scopeGuildId: input.scopeGuildId ?? null,
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
    async upsertPanel() {
      return {
        panel: {
          id: 'panel-1',
          organizationId: 'org',
          discordGuildId: 'g',
          channelId: 'c',
          messageId: null,
          panelType: 'hub',
          payloadVersion: 1,
          status: 'unconfigured',
          opaqueId: 'panelopaque1',
        },
        repaired: false,
      };
    },
    async getPanel() {
      return null;
    },
    async getPanelByOpaqueId() {
      return null;
    },
    async listPanels() {
      return [];
    },
    async insertPublishOccurrence() {},
    async getLatestPendingPublishOccurrence() {
      return null;
    },
    async updatePublishOccurrenceStatus() {},
    async insertOutbox(message) {
      outbox.push(message);
    },
    async claimOutbox() {
      return [];
    },
    async completeOutbox() {},
    async failOutbox() {},
    async permanentFailOutbox() {},
    async listInbox() {
      return { items: [], nextCursor: null };
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
      const item = {
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
    async replacePublicationTargets(activityId, targets) {
      const records = targets.map((target, index) => ({
        id: `pt-${activityId}-${target.guildId}`,
        activityId,
        organizationId: target.organizationId,
        guildId: target.guildId,
        channelId: target.channelId,
        participantLimit: target.participantLimit ?? null,
        sortOrder: target.sortOrder ?? index,
      }));
      publicationTargets.set(activityId, records);
      return records;
    },
    async listPublicationTargets(activityId) {
      return publicationTargets.get(activityId) ?? [];
    },
    async upsertActivityProjection(input) {
      const key = `${input.activityId}:${input.guildId}`;
      const existing = projections.get(key);
      const next = {
        id: existing?.id ?? `proj-${key}`,
        activityId: input.activityId,
        guildId: input.guildId,
        channelId: input.channelId,
        messageId: input.messageId ?? existing?.messageId ?? null,
        status: input.status ?? existing?.status ?? 'pending',
        opaqueId: input.opaqueId,
        revision: input.revision ?? (existing ? existing.revision + 1 : 1),
        lastError: input.lastError ?? null,
        retryCount: input.retryCount ?? existing?.retryCount ?? 0,
        leaseOwner: input.leaseOwner ?? null,
        leaseExpiresAt: input.leaseExpiresAt ?? null,
        desiredPayloadVersion: input.desiredPayloadVersion ?? 1,
        updatedAt: new Date(),
      };
      projections.set(key, next);
      return next;
    },
    async getActivityProjection(activityId) {
      return [...projections.values()].find((p) => p.activityId === activityId) ?? null;
    },
    async getActivityProjectionForGuild(activityId, guildId) {
      return projections.get(`${activityId}:${guildId}`) ?? null;
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
    async listActivityTypes() {
      return [];
    },
    async getActivityType() {
      return null;
    },
    async insertActivityType() {
      throw new ActivityError('NOT_FOUND', 'not implemented in memory fixture');
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
    async listExpiredReconfirmations(now: Date) {
      return [...participations.values()]
        .filter(
          (p) =>
            p.confirmationState === 'requires_reconfirmation' &&
            p.reconfirmDeadline !== null &&
            p.reconfirmDeadline.getTime() <= now.getTime() &&
            p.resignedAt === null &&
            p.removedAt === null,
        )
        .map((p) => ({
          activityId: p.activityId,
          participationId: p.id,
          discordUserId: p.discordUserId,
        }));
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
    projections,
    async withTransaction<T>(fn: (inner: ActivityTx) => Promise<T>): Promise<T> {
      return fn(tx);
    },
    async ping() {},
  };
}

describe('ActivityUseCases (in-memory)', () => {
  const clock = new FixedClock(new Date('2026-08-16T12:00:00.000Z'));
  const actor = { discordUserId: 'creator-1' };

  it('publishes a draft and emits created outbox event', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Raid',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
        participantLimit: 2,
      },
      { actor, idempotencyKey: 'pub-1' },
    );
    expect(activity.status).toBe('registrations_open');
    expect(
      repo.outbox.some(
        (e) => (e as { eventType: string }).eventType === 'activity.activity.created.v1',
      ),
    ).toBe(true);
  });

  it('rejects ordinary horizon beyond 14 days', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new DenyHorizonAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    await expect(
      useCases.publishDraft(
        draft.id,
        {
          organizationId: 'org-1',
          name: 'Far',
          startAt: new Date('2026-09-20T18:00:00.000Z'),
        },
        { actor },
      ),
    ).rejects.toMatchObject({ code: 'HORIZON_EXCEEDED' });
  });

  it('returns cached idempotent publish response', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const first = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Raid',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
      },
      { actor, idempotencyKey: 'same' },
    );
    const second = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Raid',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
      },
      { actor, idempotencyKey: 'same' },
    );
    expect(second).toEqual(first);
  });

  it('does not reuse an idempotency key across actors', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const other = { discordUserId: 'creator-2' };
    const draftA = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const draftB = await useCases.createDraft({ guildId: 'guild-1' }, { actor: other });
    const first = await useCases.publishDraft(
      draftA.id,
      {
        organizationId: 'org-1',
        name: 'Raid A',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
      },
      { actor, idempotencyKey: 'shared-key' },
    );
    const second = await useCases.publishDraft(
      draftB.id,
      {
        organizationId: 'org-1',
        name: 'Raid B',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
      },
      { actor: other, idempotencyKey: 'shared-key' },
    );
    expect(second.id).not.toBe(first.id);
    expect(second.name).toBe('Raid B');
  });

  it('forbids reading and RSVP for a guild the actor cannot access', async () => {
    const repo = createMemoryRepo();
    class GuildScopedAuthz implements AuthorizePort {
      public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
        const allowed = request.scope.guildId === 'guild-1';
        return Promise.resolve({
          allowed,
          permissionId: request.permissionId,
          decision: allowed ? 'allow' : 'deny',
        });
      }
    }
    const seeder = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const attacker = new ActivityUseCases({
      repository: repo,
      authorize: new GuildScopedAuthz(),
      clock,
    });
    const organizer = { discordUserId: 'organizer-b' };
    const awayDraft = await seeder.createDraft({ guildId: 'guild-2' }, { actor: organizer });
    const away = await seeder.publishDraft(
      awayDraft.id,
      {
        organizationId: 'org-1',
        name: 'Away',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
      },
      { actor: organizer, idempotencyKey: 'away-pub' },
    );
    await expect(attacker.listActivities('guild-2', actor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(attacker.getActivity(away.id, actor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      attacker.rsvp(away.id, { statusDefId: 'status-confirmed' }, { actor }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('waitlists when capacity is full and promotes on resign', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Raid',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
        participantLimit: 1,
      },
      { actor, idempotencyKey: 'cap-1' },
    );
    // Organizer already occupies the only seat via default confirmed status.
    const waitlisted = await useCases.rsvp(
      activity.id,
      { statusDefId: 'status-confirmed' },
      { actor: { discordUserId: 'member-2' } },
    );
    expect(waitlisted.waitlistPosition).toBe(1);

    await useCases.resign(activity.id, { actor });
    const after = await useCases.listParticipants(activity.id, actor);
    const promoted = after.find((p) => p.discordUserId === 'member-2');
    expect(promoted?.waitlistPosition).toBeNull();
    expect(promoted?.occupiesSlot).toBe(true);
    expect(
      repo.outbox.some(
        (e) => (e as { eventType: string }).eventType === 'activity.activity.waitlist_promoted.v1',
      ),
    ).toBe(true);
  });

  it('member list includes occupancy, my status and organizer display without N+1 contract', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
      discordGuildMetadata: {
        listGuilds: async () => [],
        getGuild: async () => null,
        listChannels: async () => [],
        listRoles: async () => [],
        resolveMembers: async () => [{ id: 'creator-1', displayName: 'KuzynPasek' }],
        publishHub: async () => ({ mode: 'adopt', messageId: 'm' }),
        reconcileHub: async () => ({ mode: 'adopt', messageId: 'm' }),
      },
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Azrael',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
        participantLimit: 8,
      },
      { actor, idempotencyKey: 'list-1' },
    );
    const listed = await useCases.listActivities('guild-1', actor);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.occupiedSlots).toBe(1);
    expect(listed[0]?.participantLimit).toBe(8);
    expect(listed[0]?.organizerDisplay).toBe('KuzynPasek');
    expect(listed[0]?.myParticipationStatus?.statusLabel).toBe('Będę');
    expect(listed[0]?.myParticipationStatus?.confirmationState).toBe('confirmed');
    expect(listed[0]).not.toHaveProperty('version');
    const other = await useCases.listActivities('guild-1', { discordUserId: 'member-2' });
    expect(other[0]?.myParticipationStatus).toBeNull();
    expect(other[0]?.occupiedSlots).toBe(1);
    const unlimitedDraft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    await useCases.publishDraft(
      unlimitedDraft.id,
      {
        organizationId: 'org-1',
        name: 'Open',
        startAt: new Date('2026-08-21T18:00:00.000Z'),
        participantLimit: null,
      },
      { actor, idempotencyKey: 'list-2' },
    );
    const all = await useCases.listActivities('guild-1', actor);
    const open = all.find((item) => item.name === 'Open');
    expect(open?.participantLimit).toBeNull();
    expect(open?.occupiedSlots).toBe(1);
    expect(activity.id).toBe(listed[0]?.id);
  });

  it('keeps seats reserved on reschedule until reconfirm deadline expiry', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Raid',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
        participantLimit: 1,
      },
      { actor, idempotencyKey: 'reconfirm-1' },
    );
    const waitlisted = await useCases.rsvp(
      activity.id,
      { statusDefId: 'status-confirmed' },
      { actor: { discordUserId: 'member-2' } },
    );
    expect(waitlisted.waitlistPosition).toBe(1);

    const deadline = new Date('2026-08-16T12:30:00.000Z');
    await useCases.reschedule(
      activity.id,
      {
        startAt: new Date('2026-08-22T18:00:00.000Z'),
        reconfirmDeadline: deadline,
      },
      { actor },
    );

    const afterReschedule = await useCases.listParticipants(activity.id, actor);
    const organizer = afterReschedule.find((p) => p.discordUserId === 'creator-1');
    const stillWaitlisted = afterReschedule.find((p) => p.discordUserId === 'member-2');
    expect(organizer?.confirmationState).toBe('requires_reconfirmation');
    expect(organizer?.occupiesSlot).toBe(true);
    expect(stillWaitlisted?.waitlistPosition).toBe(1);
    expect(
      repo.outbox.some(
        (e) => (e as { eventType: string }).eventType === 'activity.activity.reconfirm_required.v1',
      ),
    ).toBe(true);

    await useCases.reconfirm(activity.id, { actor });
    const afterReconfirm = await useCases.listParticipants(activity.id, actor);
    expect(afterReconfirm.find((p) => p.discordUserId === 'creator-1')?.confirmationState).toBe(
      'confirmed',
    );

    await useCases.reschedule(
      activity.id,
      {
        startAt: new Date('2026-08-23T18:00:00.000Z'),
        reconfirmDeadline: new Date('2026-08-16T12:45:00.000Z'),
      },
      { actor },
    );
    const laterClock = new FixedClock(new Date('2026-08-16T13:00:00.000Z'));
    const expireCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock: laterClock,
    });
    const expired = await expireCases.expireReconfirmations({
      actor: { discordUserId: 'system' },
    });
    expect(expired.expired).toBeGreaterThanOrEqual(1);
    const afterExpire = await expireCases.listParticipants(activity.id, actor);
    const promoted = afterExpire.find((p) => p.discordUserId === 'member-2');
    expect(promoted?.waitlistPosition).toBeNull();
    expect(promoted?.occupiesSlot).toBe(true);
  });

  it('denies forbidden actors via Authorization port', async () => {
    const repo = createMemoryRepo();
    const denyAll: AuthorizePort = {
      authorize(request) {
        return Promise.resolve({
          allowed: false,
          permissionId: request.permissionId,
          decision: 'deny',
        });
      },
    };
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: denyAll,
      clock,
    });
    await expect(useCases.createDraft({ guildId: 'guild-1' }, { actor })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('dedupes inbox enqueue by recipient+kind+dedupeKey', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const first = await useCases.enqueueInbox(
      {
        guildId: 'guild-1',
        recipientDiscordUserId: 'user-1',
        kind: 'activity.cancelled',
        payload: { activityId: 'a1' },
        dedupeKey: 'cancel:a1:user-1:2',
      },
      { actor },
    );
    const second = await useCases.enqueueInbox(
      {
        guildId: 'guild-1',
        recipientDiscordUserId: 'user-1',
        kind: 'activity.cancelled',
        payload: { activityId: 'a1' },
        dedupeKey: 'cancel:a1:user-1:2',
      },
      { actor },
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.item.id).toBe(first.item.id);
    expect(repo.inbox.size).toBe(1);
  });

  it('creates a report against an activity', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Raid',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
      },
      { actor, idempotencyKey: 'report-pub' },
    );
    const report = await useCases.createReport(
      activity.id,
      { reasonCategory: 'spam', details: 'bad event' },
      { actor: { discordUserId: 'reporter-1' } },
    );
    expect(report.status).toBe('open');
    expect(report.reasonCategory).toBe('spam');
    expect(report.activityId).toBe(activity.id);
    const listed = await useCases.listReports('guild-1', actor);
    expect(listed).toHaveLength(1);
  });

  it('looks up activity by opaque id and emits projection_requested on publish', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Raid',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
        publicationChannelId: 'channel-1',
      },
      { actor, idempotencyKey: 'opaque-pub' },
    );
    expect(activity.opaqueId).toMatch(/^[0-9a-f]{12}$/);
    const byOpaque = await useCases.getActivityByOpaqueId(activity.opaqueId, actor);
    expect(byOpaque.id).toBe(activity.id);
    expect(
      repo.outbox.some(
        (e) =>
          (e as { eventType: string }).eventType === 'activity.activity.projection_requested.v1',
      ),
    ).toBe(true);
  });

  it('forbids seedTestGuild when nodeEnv is production', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
      nodeEnv: 'production',
      allowTestSeed: true,
    });
    await expect(
      useCases.seedTestGuild(
        { guildId: 'guild-1', orgId: 'org-1', channelId: 'chan-1' },
        { actor },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('forbids seedTestGuild when allowTestSeed is not enabled', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
      nodeEnv: 'development',
      allowTestSeed: false,
    });
    await expect(
      useCases.seedTestGuild(
        { guildId: 'guild-1', orgId: 'org-1', channelId: 'chan-1' },
        { actor },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('P4.5 multi-guild publish fans out projections and SEPARATE pools isolate capacity', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Multi',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
        publicationChannelId: 'ch-home',
        participantMode: 'separate',
        participantLimit: 1,
        targets: [
          { guildId: 'guild-1', channelId: 'ch-home', participantLimit: 1 },
          { guildId: 'guild-2', channelId: 'ch-away', participantLimit: 1 },
        ],
      },
      { actor, idempotencyKey: 'multi-pub' },
    );
    expect(activity.participantMode).toBe('separate');
    const projectionEvents = repo.outbox.filter(
      (e) => (e as { eventType: string }).eventType === 'activity.activity.projection_requested.v1',
    );
    expect(projectionEvents).toHaveLength(2);

    const homeFull = await useCases.rsvp(
      activity.id,
      { statusDefId: 'status-confirmed', guildId: 'guild-1' },
      { actor: { discordUserId: 'member-home' } },
    );
    expect(homeFull.waitlistPosition).toBe(1);
    expect(homeFull.scopeGuildId).toBe('guild-1');

    const awaySeat = await useCases.rsvp(
      activity.id,
      { statusDefId: 'status-confirmed', guildId: 'guild-2' },
      { actor: { discordUserId: 'member-away' } },
    );
    expect(awaySeat.waitlistPosition).toBeNull();
    expect(awaySeat.scopeGuildId).toBe('guild-2');

    await expect(
      useCases.rsvp(
        activity.id,
        { statusDefId: 'status-confirmed', guildId: 'guild-unknown' },
        { actor: { discordUserId: 'intruder' } },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('P4.6: publishes weekly series occurrences', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const result = await useCases.publishSeriesDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Weekly raid',
        firstStartAt: new Date('2026-08-21T18:00:00.000Z'),
        recurrenceKind: 'weekly',
        horizonEndAt: new Date('2026-09-11T18:00:00.000Z'),
      },
      { actor, idempotencyKey: 'series-1' },
    );
    expect(result.activities.length).toBe(4);
    expect(result.activities.every((row) => row.seriesId === result.series.id)).toBe(true);
  });

  it('P4.6: private activity requires role or invite for non-organizer', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const published = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Private',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
        visibility: 'private',
        privateRoleIds: ['role-vip'],
      },
      { actor, idempotencyKey: 'priv-1' },
    );
    const activityId = published.id;
    await expect(
      useCases.getActivity(activityId, { discordUserId: 'outsider-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      useCases.getActivity(
        activityId,
        { discordUserId: 'outsider-1' },
        {
          memberRoleIds: ['role-vip'],
        },
      ),
    ).resolves.toMatchObject({ id: activityId });
  });

  it('P4.6: organizer marks attendance within 24h and self stats aggregate', async () => {
    const repo = createMemoryRepo();
    const useCases = new ActivityUseCases({
      repository: repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const draft = await useCases.createDraft({ guildId: 'guild-1' }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Finished',
        startAt: new Date('2026-08-20T18:00:00.000Z'),
        endAt: new Date('2026-08-20T20:00:00.000Z'),
      },
      { actor, idempotencyKey: 'att-1' },
    );
    const stored = repo.activities.get(activity.id);
    expect(stored).toBeDefined();
    repo.activities.set(activity.id, {
      ...stored!,
      scheduledFinishAt: new Date('2026-08-16T10:00:00.000Z'),
      status: 'completed',
    });
    const record = await useCases.markAttendance(
      activity.id,
      { subjectDiscordUserId: 'member-9', status: 'present' },
      { actor },
    );
    expect(record.status).toBe('present');
    const stats = await useCases.getSelfStats('guild-1', { discordUserId: 'member-9' });
    expect(stats).toMatchObject({ present: 1, absent: 0, total: 1 });
  });
});
