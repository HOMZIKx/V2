import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/require-await -- in-memory repository fake */

import { FixedClock } from '../../domain/clock.js';
import { ActivityError } from '../../domain/errors.js';
import { ACTIVITY_PERMISSIONS } from '../../domain/permissions.js';
import type {
  ActivityRecord,
  ActivityRepositoryPort,
  ActivityTx,
  ActivityTypeRecord,
  AuthorizePort,
  AuthorizeRequest,
  AuthorizeResult,
  GuildActivitySettingsRecord,
  ParticipationStatusDefRecord,
} from '../ports/activity.ports.js';
import { ActivityAdminUseCases } from './activity-admin.use-cases.js';

class AllowAuthz implements AuthorizePort {
  public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    return Promise.resolve({
      allowed: true,
      permissionId: request.permissionId,
      decision: 'allow',
    });
  }
}

function baseSettings(
  overrides: Partial<GuildActivitySettingsRecord> = {},
): GuildActivitySettingsRecord {
  return {
    guildId: 'guild-1',
    orgId: 'org-1',
    organizerDefaultStatusId: 'status-confirmed',
    waitlistPromotionStatusId: 'status-confirmed',
    maxActivePerCreator: 4,
    registrationDefaultClosesAtStart: true,
    allowedPublishChannelIds: ['chan-1'],
    configRevision: 1,
    allowOtherActivity: true,
    maxCreateHorizonDays: 14,
    postRetentionHoursAfterFinish: 72,
    reminders: [],
    dmNotificationsEnabled: true,
    pingRoleIds: [],
    hubChannelId: 'hub-1',
    ...overrides,
  };
}

function createAdminMemoryRepo(): {
  repo: ActivityRepositoryPort;
  settings: { current: GuildActivitySettingsRecord };
  statuses: Map<string, ParticipationStatusDefRecord>;
  types: Map<string, ActivityTypeRecord>;
  activities: Map<string, ActivityRecord>;
  audit: string[];
} {
  const settings = { current: baseSettings() };
  const statuses = new Map<string, ParticipationStatusDefRecord>();
  const types = new Map<string, ActivityTypeRecord>();
  const activities = new Map<string, ActivityRecord>();
  const audit: string[] = [];

  statuses.set('status-confirmed', {
    id: 'status-confirmed',
    guildId: 'guild-1',
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
    guildId: 'guild-1',
    label: 'Może',
    occupiesSlot: false,
    behavior: 'tentative',
    selectableByMember: true,
    active: true,
    sortOrder: 20,
    seedKey: 'tentative',
  });

  types.set('type-raid', {
    id: 'type-raid',
    guildId: 'guild-1',
    key: 'raid',
    label: 'Raid',
    enabled: true,
    isOther: false,
    sortOrder: 1,
    statusDefIds: [],
    participantFields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const notImpl = async (): Promise<never> => {
    throw new ActivityError('NOT_FOUND', 'not implemented');
  };

  const tx: ActivityTx = {
    async lockCreatorAdvisory() {},
    async lockActivity(id) {
      const a = activities.get(id);
      if (a === undefined) throw new ActivityError('NOT_FOUND', 'missing');
      return a;
    },
    async ensureGuildDefaults() {
      return { settings: settings.current, statuses: [...statuses.values()] };
    },
    async getSettings() {
      return settings.current;
    },
    async updateSettings(_guildId, patch) {
      settings.current = { ...settings.current, ...patch };
      return settings.current;
    },
    async putGuildAdminConfig(_guildId, input) {
      if (settings.current.configRevision !== input.expectedRevision) {
        throw new ActivityError('CONFLICT', 'Config revision mismatch');
      }
      settings.current = {
        ...settings.current,
        organizerDefaultStatusId:
          input.organizerDefaultStatusId !== undefined
            ? input.organizerDefaultStatusId
            : settings.current.organizerDefaultStatusId,
        waitlistPromotionStatusId:
          input.waitlistPromotionStatusId !== undefined
            ? input.waitlistPromotionStatusId
            : settings.current.waitlistPromotionStatusId,
        maxActivePerCreator: input.maxActivePerCreator ?? settings.current.maxActivePerCreator,
        registrationDefaultClosesAtStart:
          input.registrationDefaultClosesAtStart ??
          settings.current.registrationDefaultClosesAtStart,
        allowOtherActivity: input.allowOtherActivity ?? settings.current.allowOtherActivity,
        maxCreateHorizonDays: input.maxCreateHorizonDays ?? settings.current.maxCreateHorizonDays,
        postRetentionHoursAfterFinish:
          input.postRetentionHoursAfterFinish ?? settings.current.postRetentionHoursAfterFinish,
        reminders: input.reminders ?? settings.current.reminders,
        dmNotificationsEnabled:
          input.dmNotificationsEnabled ?? settings.current.dmNotificationsEnabled,
        allowedPublishChannelIds:
          input.allowedPublishChannelIds ?? settings.current.allowedPublishChannelIds,
        pingRoleIds: input.pingRoleIds ?? settings.current.pingRoleIds,
        hubChannelId:
          input.hubChannelId !== undefined ? input.hubChannelId : settings.current.hubChannelId,
        configRevision: settings.current.configRevision + 1,
      };
      return settings.current;
    },
    async listStatusDefs(guildId) {
      return [...statuses.values()].filter((s) => s.guildId === guildId);
    },
    async getStatusDef(id) {
      return statuses.get(id) ?? null;
    },
    async listActivityTypes(guildId) {
      return [...types.values()].filter((t) => t.guildId === guildId);
    },
    async getActivityType(id) {
      return types.get(id) ?? null;
    },
    async deactivateActivityType(id) {
      const existing = types.get(id);
      if (existing === undefined) throw new ActivityError('NOT_FOUND', 'type');
      const next = { ...existing, enabled: false, updatedAt: new Date() };
      types.set(id, next);
      return next;
    },
    async countActivitiesUsingType(typeId) {
      return [...activities.values()].filter((a) => a.typeId === typeId).length;
    },
    async updateStatusDef(id, patch) {
      const existing = statuses.get(id);
      if (existing === undefined) throw new ActivityError('NOT_FOUND', 'status');
      const next = {
        ...existing,
        label: patch.label ?? existing.label,
        occupiesSlot: patch.occupiesSlot ?? existing.occupiesSlot,
        behavior: patch.behavior ?? existing.behavior,
        selectableByMember: patch.selectableByMember ?? existing.selectableByMember,
        active: patch.active ?? existing.active,
        sortOrder: patch.sortOrder ?? existing.sortOrder,
      };
      statuses.set(id, next);
      return next;
    },
    async deactivateStatusDef(id) {
      return this.updateStatusDef(id, { active: false });
    },
    async insertAudit(input) {
      audit.push(input.action);
    },
    async findIdempotency() {
      return null;
    },
    async saveIdempotency() {},
    async countActiveOwn() {
      return 0;
    },
    async insertDraft() {
      return notImpl();
    },
    async getDraft() {
      return null;
    },
    async getDraftByOpaque() {
      return null;
    },
    async updateDraft() {
      return notImpl();
    },
    async deleteDraft() {},
    async insertActivity() {
      return notImpl();
    },
    async updateActivity() {
      return notImpl();
    },
    async getActivity(id) {
      return activities.get(id) ?? null;
    },
    async getActivityByOpaqueId() {
      return null;
    },
    async listActivities() {
      return [...activities.values()];
    },
    async listMyActivities() {
      return [];
    },
    async listParticipations() {
      return [];
    },
    async listParticipationsForActivities() {
      return [];
    },
    async getParticipation() {
      return null;
    },
    async upsertParticipation() {
      return notImpl();
    },
    async markParticipationResigned() {},
    async markParticipationRemoved() {},
    async clearWaitlistPosition() {},
    async upsertPanel() {
      return notImpl();
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
    async insertOutbox() {},
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
      return notImpl();
    },
    async enqueueInbox() {
      return notImpl();
    },
    async createReport() {
      return notImpl();
    },
    async listReports() {
      return [];
    },
    async upsertActivityProjection() {
      return notImpl();
    },
    async getActivityProjection() {
      return null;
    },
    async claimProjectionRepair() {
      return [];
    },
    async setAllowedPublishChannelIds() {},
    async setPingRoleIds() {
      return notImpl();
    },
    async setHubChannelId() {
      return notImpl();
    },
    async insertActivityType() {
      return notImpl();
    },
    async updateActivityType() {
      return notImpl();
    },
    async insertStatusDef(input) {
      const created: ParticipationStatusDefRecord = {
        id: input.id,
        guildId: input.guildId,
        label: input.label,
        occupiesSlot: input.occupiesSlot,
        behavior: input.behavior,
        selectableByMember: input.selectableByMember,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 0,
        seedKey: input.seedKey ?? null,
      };
      statuses.set(created.id, created);
      return created;
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
      return notImpl();
    },
    async updateParticipantFieldDef() {
      return notImpl();
    },
    async deactivateParticipantFieldDef() {
      return notImpl();
    },
    async listReportReasonDefs() {
      return [];
    },
    async getReportReasonDef() {
      return null;
    },
    async insertReportReasonDef() {
      return notImpl();
    },
    async updateReportReasonDef() {
      return notImpl();
    },
    async deactivateReportReasonDef() {
      return notImpl();
    },
    async listAdminEvents() {
      return { items: [...activities.values()], total: activities.size };
    },
    async listProjectionProblems() {
      return [];
    },
    async updateReportStatus() {
      return notImpl();
    },
    async getReport() {
      return null;
    },
    async listAuditEntries() {
      return { items: [], total: 0 };
    },
    async ping() {},
    async listExpiredReconfirmations() {
      return [];
    },
    async listActivitiesDueForFinish() {
      return [];
    },
  };

  return {
    settings,
    statuses,
    types,
    activities,
    audit,
    repo: {
      async withTransaction<T>(fn: (inner: ActivityTx) => Promise<T>): Promise<T> {
        return fn(tx);
      },
      async ping() {},
    },
  };
}

describe('ActivityAdminUseCases (in-memory)', () => {
  const clock = new FixedClock(new Date('2026-08-16T12:00:00.000Z'));
  const actor = { discordUserId: 'admin-1' };

  it('rejects config put on revision conflict', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
    });
    await expect(
      useCases.putAdminConfig(
        'guild-1',
        { expectedRevision: 99, maxActivePerCreator: 5 },
        { actor },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('accepts config put and bumps revision', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const updated = await useCases.putAdminConfig(
      'guild-1',
      { expectedRevision: 1, maxActivePerCreator: 6 },
      { actor },
    );
    expect(updated.configRevision).toBe(2);
    expect(updated.maxActivePerCreator).toBe(6);
    expect(mem.audit).toContain('admin.config.put');
  });

  it('denies dangling organizerDefault status on put', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
    });
    await expect(
      useCases.putAdminConfig(
        'guild-1',
        { expectedRevision: 1, organizerDefaultStatusId: 'missing-status' },
        { actor },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('denies waitlistPromotion pointing at non-confirmed status', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
    });
    await expect(
      useCases.putAdminConfig(
        'guild-1',
        { expectedRevision: 1, waitlistPromotionStatusId: 'status-tentative' },
        { actor },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('soft-deactivates type even when historical activities exist', async () => {
    const mem = createAdminMemoryRepo();
    const now = new Date();
    mem.activities.set('act-1', {
      id: 'act-1',
      guildId: 'guild-1',
      organizationId: 'org-1',
      typeId: 'type-raid',
      name: 'Raid',
      description: '',
      startAt: now,
      endAt: null,
      scheduleKind: 'exact',
      periodKey: null,
      scheduleHasExplicitTime: true,
      status: 'published',
      enrollmentOpen: true,
      participantLimit: null,
      organizerDiscordUserId: 'u1',
      organizerV2UserId: null,
      coOrganizerDiscordUserId: null,
      coOrganizerV2UserId: null,
      publicationChannelId: 'c1',
      timezone: 'UTC',
      locationText: null,
      cancelReason: null,
      cancelledAt: null,
      version: 1,
      scheduledFinishAt: now,
      opaqueId: 'aaaaaaaaaaaa',
      createdAt: now,
      updatedAt: now,
    });
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const updated = await useCases.deactivateType('guild-1', 'type-raid', { actor });
    expect(updated.enabled).toBe(false);
    expect(mem.audit).toContain('admin.type.deactivate');
  });

  it('returns READY when config is complete', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
      discordChannelValidation: {
        validateChannels(guildId, channelIds) {
          return Promise.resolve(
            channelIds.map((channelId) => ({
              channelId,
              guildId,
              ok: true,
              code: 'CHANNEL_OK' as const,
            })),
          );
        },
      },
    });
    const readiness = await useCases.getReadiness('guild-1', actor);
    expect(readiness.status).toBe('READY');
    expect(readiness.ready).toBe(true);
  });

  it('returns NOT_READY when hub/channels missing', async () => {
    const mem = createAdminMemoryRepo();
    mem.settings.current = baseSettings({
      hubChannelId: null,
      allowedPublishChannelIds: [],
    });
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const readiness = await useCases.getReadiness('guild-1', actor);
    expect(readiness.status).toBe('NOT_READY');
    expect(readiness.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['HUB_CHANNEL_MISSING', 'NO_ALLOWED_PUBLISH_CHANNELS']),
    );
  });

  it('returns CONFIGURATION_REQUIRED when Discord validation is unavailable', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
      discordChannelValidation: null,
    });
    const readiness = await useCases.getReadiness('guild-1', actor);
    expect(readiness.status).toBe('CONFIGURATION_REQUIRED');
    expect(readiness.ready).toBe(false);
    expect(readiness.issues.map((i) => i.code)).toContain('DISCORD_DEPENDENCY_UNAVAILABLE');
  });

  it('rejects putChannels when Discord reports a channel as invalid', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
      discordChannelValidation: {
        validateChannels(_guildId, channelIds) {
          return Promise.resolve(
            channelIds.map((channelId) =>
              channelId === 'bad'
                ? {
                    channelId,
                    ok: false,
                    code: 'CHANNEL_WRONG_GUILD' as const,
                    detail: 'wrong guild',
                  }
                : { channelId, ok: true, code: 'CHANNEL_OK' as const },
            ),
          );
        },
      },
    });
    await expect(
      useCases.putChannels('guild-1', ['good', 'bad'], 1, { actor }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('accepts putChannels when Discord validates all channels', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
      discordChannelValidation: {
        validateChannels(_guildId, channelIds) {
          return Promise.resolve(
            channelIds.map((channelId) => ({
              channelId,
              ok: true,
              code: 'CHANNEL_OK' as const,
            })),
          );
        },
      },
    });
    const updated = await useCases.putChannels('guild-1', ['chan-a', 'chan-b'], 1, { actor });
    expect(updated.allowedPublishChannelIds).toEqual(['chan-a', 'chan-b']);
  });

  it('protects referenced status from deactivation', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
    });
    await expect(
      useCases.deactivateStatus('guild-1', 'status-confirmed', { actor }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows declined behavior with occupiesSlot=true because fields are independent', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
    });
    const created = await useCases.createStatus(
      'guild-1',
      {
        label: 'Nie, ale rezerwuję',
        occupiesSlot: true,
        behavior: 'declined',
        selectableByMember: true,
      },
      { actor },
    );
    expect(created.behavior).toBe('declined');
    expect(created.occupiesSlot).toBe(true);
  });

  it('filters admin guild inventory to CONFIG_MANAGE and hides denied guilds', async () => {
    const mem = createAdminMemoryRepo();
    class SelectiveAuthz implements AuthorizePort {
      public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
        expect(request.permissionId).toBe(ACTIVITY_PERMISSIONS.CONFIG_MANAGE);
        expect(request.scope.type).toBe('guild');
        const allowed = request.scope.guildId === 'guild-a';
        return Promise.resolve({
          allowed,
          permissionId: request.permissionId,
          decision: allowed ? 'allow' : 'deny',
        });
      }
    }
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new SelectiveAuthz(),
      clock,
      discordGuildMetadata: {
        listGuilds: async () => [
          { id: 'guild-a', name: 'Alpha' },
          { id: 'guild-b', name: 'Bravo' },
        ],
        getGuild: async () => null,
        listChannels: async () => [],
        listRoles: async () => [],
        resolveMembers: async () => [],
        publishHub: async () => ({ mode: 'adopt', messageId: 'm' }),
        reconcileHub: async () => ({ mode: 'adopt', messageId: 'm' }),
      },
    });
    const guilds = await useCases.listAdminGuilds(actor);
    expect(guilds).toEqual([{ id: 'guild-a', name: 'Alpha' }]);
    expect(JSON.stringify(guilds)).not.toContain('guild-b');
    expect(JSON.stringify(guilds)).not.toContain('Bravo');
  });

  it('rejects unauthenticated admin guild listing', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
      discordGuildMetadata: {
        listGuilds: async () => [{ id: 'guild-a', name: 'Alpha' }],
        getGuild: async () => null,
        listChannels: async () => [],
        listRoles: async () => [],
        resolveMembers: async () => [],
        publishHub: async () => ({ mode: 'adopt', messageId: 'm' }),
        reconcileHub: async () => ({ mode: 'adopt', messageId: 'm' }),
      },
    });
    await expect(useCases.listAdminGuilds({})).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('fails closed when authorization dependency throws during guild listing', async () => {
    const mem = createAdminMemoryRepo();
    class BrokenAuthz implements AuthorizePort {
      public authorize(): Promise<AuthorizeResult> {
        return Promise.reject(new Error('authz down'));
      }
    }
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new BrokenAuthz(),
      clock,
      discordGuildMetadata: {
        listGuilds: async () => [
          { id: 'guild-a', name: 'Alpha' },
          { id: 'guild-b', name: 'Bravo' },
        ],
        getGuild: async () => null,
        listChannels: async () => [],
        listRoles: async () => [],
        resolveMembers: async () => [],
        publishHub: async () => ({ mode: 'adopt', messageId: 'm' }),
        reconcileHub: async () => ({ mode: 'adopt', messageId: 'm' }),
      },
    });
    await expect(useCases.listAdminGuilds(actor)).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });

  it('returns an empty guild list when the actor cannot manage any candidate', async () => {
    const mem = createAdminMemoryRepo();
    class DenyAll implements AuthorizePort {
      public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
        return Promise.resolve({
          allowed: false,
          permissionId: request.permissionId,
          decision: 'deny',
        });
      }
    }
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new DenyAll(),
      clock,
      discordGuildMetadata: {
        listGuilds: async () => [{ id: 'guild-b', name: 'Bravo' }],
        getGuild: async () => null,
        listChannels: async () => [],
        listRoles: async () => [],
        resolveMembers: async () => [],
        publishHub: async () => ({ mode: 'adopt', messageId: 'm' }),
        reconcileHub: async () => ({ mode: 'adopt', messageId: 'm' }),
      },
    });
    await expect(useCases.listAdminGuilds(actor)).resolves.toEqual([]);
  });

  it('fails closed when Discord channel metadata is unavailable', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
      discordGuildMetadata: {
        listGuilds: async () => [],
        getGuild: async () => null,
        listChannels: async () => {
          throw new Error('discord down');
        },
        listRoles: async () => [],
        resolveMembers: async () => [],
        publishHub: async () => ({ mode: 'adopt', messageId: 'm' }),
        reconcileHub: async () => ({ mode: 'adopt', messageId: 'm' }),
      },
    });
    await expect(useCases.listDiscordChannels('guild-1', actor)).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
    });
  });

  it('fails closed when Discord role metadata is unavailable', async () => {
    const mem = createAdminMemoryRepo();
    const useCases = new ActivityAdminUseCases({
      repository: mem.repo,
      authorize: new AllowAuthz(),
      clock,
      discordGuildMetadata: {
        listGuilds: async () => [],
        getGuild: async () => null,
        listChannels: async () => [],
        listRoles: async () => {
          throw new Error('discord down');
        },
        resolveMembers: async () => [],
        publishHub: async () => ({ mode: 'adopt', messageId: 'm' }),
        reconcileHub: async () => ({ mode: 'adopt', messageId: 'm' }),
      },
    });
    await expect(useCases.listDiscordRoles('guild-1', actor)).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
    });
  });
});
