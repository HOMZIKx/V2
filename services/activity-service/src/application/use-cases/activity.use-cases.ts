import { randomUUID } from 'node:crypto';

import { formatLfgRoleNeedSummary, isPartyRoleKey } from '@v2/hub-core';

import type { AttendanceMark } from '../../domain/attendance.js';
import { assertAttendanceWindowOpen } from '../../domain/attendance.js';
import { countOccupiedSlots, hasOpenSeat } from '../../domain/capacity.js';
import { assertCreateLimit, draftExpiresAt, isDraftExpired } from '../../domain/create-limits.js';
import { ActivityError } from '../../domain/errors.js';
import { assertGuildIdAllowedForTestSeed } from '../../domain/guild-id-guards.js';
import {
  assertTransition,
  canPermanentlyDelete,
  scheduledFinishAt,
  type ActivityStatus,
} from '../../domain/lifecycle.js';
import { opaqueIdFromUuid } from '../../domain/opaque-id.js';
import { OUTBOX_EVENT_TYPES } from '../../domain/outbox-events.js';
import {
  filterParticipationsForMode,
  isGuildPublicationTarget,
  resolveParticipationScopeGuildId,
} from '../../domain/participant-mode.js';
import { ACTIVITY_PERMISSIONS, EXTENDED_HORIZON_PERMISSIONS } from '../../domain/permissions.js';
import { mintPrivateInviteToken, type ActivityVisibility } from '../../domain/privacy.js';
import { normalizePublicationTargets } from '../../domain/publication-targets.js';
import { isReconfirmExpired, resolveReconfirmDeadline } from '../../domain/reconfirmation.js';
import {
  assertScheduleValid,
  buildSchedulePayloadFields,
  type PeriodKey,
  type ScheduleKind,
} from '../../domain/schedule.js';
import { assertValidReferenceStatus } from '../../domain/status-def.js';
import { assignWaitlistPosition, nextWaitlistPromotion } from '../../domain/waitlist.js';
import { authorizeOrFailClosed, requireAllowed } from '../authorize-fail-closed.js';
import { enqueueEventProjection } from '../enqueue-event-projection.js';
import { resolveGuildOrganizationId } from '../guild-organization-scope.js';
import {
  collectOrganizerDiscordIds,
  collectParticipantDiscordIds,
  toMemberActivityListItem,
  UNKNOWN_MEMBER_DISPLAY,
  type MemberActivityListItem,
} from '../member-activity-presentation.js';
import type {
  ActivityRecord,
  ActivityTx,
  ActivityUseCaseDeps,
  ActorSubject,
  GuildActivitySettingsRecord,
  ParticipationRecord,
  ParticipationStatusDefRecord,
  UpsertActivityProjectionInput,
} from '../ports/activity.ports.js';
import {
  buildSeriesOccurrences,
  canViewPrivateActivity,
  insertSeriesWithOccurrences,
  summarizeAttendance,
  type SeriesCancelScope,
  type SeriesEditScope,
  type SeriesPublishInput,
} from './activity-p46.helpers.js';
import { enqueueUserNotification } from './notification.use-cases.js';

export interface MutationContext {
  readonly actor: ActorSubject;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
}

/** Reject non-ISO startAt values stored on drafts (e.g. DAS12 from Discord UX). */
export function normalizeDraftPayloadStartAt(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(payload, 'startAt')) {
    return payload;
  }
  const raw = payload.startAt;
  if (raw === null || raw === undefined || raw === '') {
    const next = { ...payload };
    delete next.startAt;
    return next;
  }
  if (typeof raw !== 'string') {
    throw new ActivityError('VALIDATION_FAILED', 'Nieprawidłowa data i godzina.');
  }
  const isoOk = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    raw.trim(),
  );
  const parsed = new Date(raw);
  if (!isoOk || Number.isNaN(parsed.getTime())) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      'Nieprawidłowa data i godzina. Użyj lokalnego formatu w Discordzie (np. 20.08.2026 18:00).',
    );
  }
  return { ...payload, startAt: parsed.toISOString() };
}

function actorKey(actor: ActorSubject): string {
  return actor.discordUserId ?? actor.v2UserId ?? 'anonymous';
}

function requireDiscord(actor: ActorSubject): string {
  if (actor.discordUserId === undefined || actor.discordUserId.length === 0) {
    throw new ActivityError('UNAUTHENTICATED', 'Discord user id is required');
  }
  return actor.discordUserId;
}

function redactPrivateSecrets<T extends ActivityRecord>(
  activity: T,
): Omit<T, 'privateInviteTokenHash'> & { privateInviteTokenHash: null } {
  return { ...activity, privateInviteTokenHash: null };
}

export class ActivityUseCases {
  public constructor(private readonly deps: ActivityUseCaseDeps) {}

  private async resolveDisplayNames(
    guildId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const port = this.deps.discordGuildMetadata;
    if (port === undefined || port === null || userIds.length === 0) {
      return map;
    }
    try {
      const resolved = await port.resolveMembers(guildId, userIds);
      for (const row of resolved) {
        if (row.displayName.trim() !== '') {
          map.set(row.id, row.displayName);
        }
      }
    } catch {
      // Presentation metadata only — list/detail still succeed.
    }
    return map;
  }

  private async presentActivities(
    activities: readonly ActivityRecord[],
    actor: ActorSubject,
  ): Promise<MemberActivityListItem[]> {
    if (activities.length === 0) {
      return [];
    }
    const byGuild = new Map<string, ActivityRecord[]>();
    for (const activity of activities) {
      const group = byGuild.get(activity.guildId) ?? [];
      group.push(activity);
      byGuild.set(activity.guildId, group);
    }
    const presented = new Map<string, MemberActivityListItem>();
    for (const [guildId, group] of byGuild) {
      const ids = group.map((activity) => activity.id);
      const [participations, statuses, types] = await this.deps.repository.withTransaction(
        async (tx) =>
          Promise.all([
            tx.listParticipationsForActivities(ids),
            tx.listStatusDefs(guildId),
            tx.listActivityTypes(guildId),
          ]),
      );
      const statusById = new Map(statuses.map((status) => [status.id, status] as const));
      const typeById = new Map(types.map((type) => [type.id, type] as const));
      const partsByActivity = new Map<string, ParticipationRecord[]>();
      for (const row of participations) {
        const list = partsByActivity.get(row.activityId) ?? [];
        list.push(row);
        partsByActivity.set(row.activityId, list);
      }
      const displayByDiscordId = await this.resolveDisplayNames(
        guildId,
        collectOrganizerDiscordIds(group),
      );
      for (const activity of group) {
        presented.set(
          activity.id,
          toMemberActivityListItem({
            activity,
            participations: partsByActivity.get(activity.id) ?? [],
            actor,
            statusById,
            typeById,
            displayByDiscordId,
          }),
        );
      }
    }
    return activities.map((activity) => {
      const item = presented.get(activity.id);
      return (
        item ??
        toMemberActivityListItem({
          activity,
          participations: [],
          actor,
          statusById: new Map(),
          typeById: new Map(),
          displayByDiscordId: new Map(),
        })
      );
    });
  }

  private async requirePermission(
    actor: ActorSubject,
    permissionId: string,
    guildId: string,
    operationClass: 'ordinary' | 'sensitive' = 'ordinary',
  ): Promise<void> {
    await requireAllowed(this.deps.authorize, {
      subject: actor,
      permissionId,
      scope: { type: 'guild', guildId },
      operationClass,
    });
  }

  private async requireOrganizationPermission(
    actor: ActorSubject,
    permissionId: string,
    operationClass: 'ordinary' | 'sensitive' = 'sensitive',
  ): Promise<void> {
    await requireAllowed(this.deps.authorize, {
      subject: actor,
      permissionId,
      scope: { type: 'organization' },
      operationClass,
    });
  }

  private async resolveExtendedHorizon(actor: ActorSubject, guildId: string): Promise<boolean> {
    for (const permissionId of EXTENDED_HORIZON_PERMISSIONS) {
      const result = await authorizeOrFailClosed(this.deps.authorize, {
        subject: actor,
        permissionId,
        scope: { type: 'guild', guildId },
        operationClass: 'sensitive',
      });
      if (result.allowed) {
        return true;
      }
    }
    return false;
  }

  private async requireManageSelfOrGuild(
    actor: ActorSubject,
    activity: ActivityRecord,
  ): Promise<void> {
    const discordId = actor.discordUserId;
    const isOwner =
      (discordId !== undefined &&
        (activity.organizerDiscordUserId === discordId ||
          activity.coOrganizerDiscordUserId === discordId)) ||
      (actor.v2UserId !== undefined &&
        (activity.organizerV2UserId === actor.v2UserId ||
          activity.coOrganizerV2UserId === actor.v2UserId));

    if (isOwner) {
      await this.requirePermission(
        actor,
        ACTIVITY_PERMISSIONS.MANAGE_SELF,
        activity.guildId,
        'ordinary',
      );
      return;
    }

    await this.requirePermission(
      actor,
      ACTIVITY_PERMISSIONS.MANAGE_GUILD,
      activity.guildId,
      'sensitive',
    );
  }

  private async requireManageGuildOrReport(actor: ActorSubject, guildId: string): Promise<void> {
    const manageGuild = await this.deps.authorize.authorize({
      subject: actor,
      permissionId: ACTIVITY_PERMISSIONS.MANAGE_GUILD,
      scope: { type: 'guild', guildId },
      operationClass: 'sensitive',
    });
    if (manageGuild.allowed) {
      return;
    }
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.REPORT_MANAGE, guildId, 'sensitive');
  }

  private async requestProjection(
    tx: ActivityTx,
    activity: ActivityRecord,
    now: Date,
    options?: { readonly onlyGuildIds?: readonly string[] },
  ): Promise<void> {
    await enqueueEventProjection(tx, activity, now, options);
  }

  private async triggerLfgMatchingAfterProjection(
    tx: ActivityTx,
    activity: ActivityRecord,
    now: Date,
  ): Promise<void> {
    const { triggerLfgMatchingForActivity } = await import('./lfg.use-cases.js');
    await triggerLfgMatchingForActivity(
      tx,
      activity,
      this.deps.authorize,
      this.deps.characterVerify,
      now,
    );
  }

  private async mutate<T>(
    ctx: MutationContext,
    operation: string,
    scope: string,
    run: (tx: import('../ports/activity.ports.js').ActivityTx) => Promise<T>,
  ): Promise<T> {
    return this.deps.repository.withTransaction(async (tx) => {
      if (ctx.idempotencyKey !== undefined) {
        const existing = await tx.findIdempotency({
          scope,
          actorKey: actorKey(ctx.actor),
          operation,
          idempotencyKey: ctx.idempotencyKey,
        });
        if (existing !== null) {
          return existing.responseBody as T;
        }
      }

      const result = await run(tx);

      if (ctx.idempotencyKey !== undefined) {
        await tx.saveIdempotency({
          scope,
          actorKey: actorKey(ctx.actor),
          operation,
          idempotencyKey: ctx.idempotencyKey,
          responseStatus: 200,
          responseBody: result,
        });
      }
      return result;
    });
  }

  public async ensureGuildDefaults(
    guildId: string,
    orgId: string,
    ctx: MutationContext,
  ): Promise<{ settings: GuildActivitySettingsRecord; statuses: ParticipationStatusDefRecord[] }> {
    await this.requirePermission(
      ctx.actor,
      ACTIVITY_PERMISSIONS.CONFIG_MANAGE,
      guildId,
      'sensitive',
    );
    return this.mutate(ctx, 'ensure-defaults', `guild:${guildId}`, async (tx) => {
      const resolvedOrgId = await resolveGuildOrganizationId(tx, guildId, orgId);
      return tx.ensureGuildDefaults({ guildId, orgId: resolvedOrgId });
    });
  }

  public async getGuildConfig(guildId: string, actor: ActorSubject) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const settings = await tx.getSettings(guildId);
      if (settings === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      const statuses = await tx.listStatusDefs(guildId);
      return { settings, statuses };
    });
  }

  public async updateGuildConfig(
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
    ctx: MutationContext,
  ) {
    await this.requirePermission(
      ctx.actor,
      ACTIVITY_PERMISSIONS.CONFIG_MANAGE,
      guildId,
      'sensitive',
    );
    return this.mutate(ctx, 'config-update', `guild:${guildId}`, async (tx) => {
      if (patch.organizerDefaultStatusId !== undefined && patch.organizerDefaultStatusId !== null) {
        const def = await tx.getStatusDef(patch.organizerDefaultStatusId);
        assertValidReferenceStatus(def ?? undefined, 'organizerDefault');
      }
      if (
        patch.waitlistPromotionStatusId !== undefined &&
        patch.waitlistPromotionStatusId !== null
      ) {
        const def = await tx.getStatusDef(patch.waitlistPromotionStatusId);
        assertValidReferenceStatus(def ?? undefined, 'waitlistPromotion');
      }
      return tx.updateSettings(guildId, patch);
    });
  }

  public async createDraft(
    input: {
      guildId: string;
      payload?: Record<string, unknown>;
    },
    ctx: MutationContext,
  ) {
    const discordUserId = requireDiscord(ctx.actor);
    await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.CREATE, input.guildId);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'draft-create', `guild:${input.guildId}`, async (tx) =>
      tx.insertDraft({
        id: randomUUID(),
        guildId: input.guildId,
        creatorSubjectType: 'discord',
        creatorDiscordUserId: discordUserId,
        creatorV2UserId: ctx.actor.v2UserId ?? null,
        payload: input.payload ?? {},
        expiresAt: draftExpiresAt(now),
      }),
    );
  }

  public async getDraft(id: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const draft = await tx.getDraft(id);
      if (draft === null) {
        throw new ActivityError('NOT_FOUND', 'Draft not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, draft.guildId);
      if (isDraftExpired(draft.expiresAt, this.deps.clock.now())) {
        throw new ActivityError('GONE', 'Draft expired');
      }
      return draft;
    });
  }

  public async getDraftByOpaque(opaqueId: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const draft = await tx.getDraftByOpaque(opaqueId);
      if (draft === null) {
        throw new ActivityError('NOT_FOUND', 'Draft not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, draft.guildId);
      if (isDraftExpired(draft.expiresAt, this.deps.clock.now())) {
        throw new ActivityError('GONE', 'Draft expired');
      }
      return draft;
    });
  }

  public async updateDraft(id: string, payload: Record<string, unknown>, ctx: MutationContext) {
    return this.mutate(ctx, 'draft-update', `draft:${id}`, async (tx) => {
      const draft = await tx.getDraft(id);
      if (draft === null) {
        throw new ActivityError('NOT_FOUND', 'Draft not found');
      }
      requireDiscord(ctx.actor);
      if (draft.creatorDiscordUserId !== ctx.actor.discordUserId) {
        await this.requirePermission(
          ctx.actor,
          ACTIVITY_PERMISSIONS.MANAGE_GUILD,
          draft.guildId,
          'sensitive',
        );
      } else {
        await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.CREATE, draft.guildId);
      }
      if (isDraftExpired(draft.expiresAt, this.deps.clock.now())) {
        throw new ActivityError('GONE', 'Draft expired');
      }
      const normalized = normalizeDraftPayloadStartAt(payload);
      return tx.updateDraft(id, { payload: { ...draft.payload, ...normalized } });
    });
  }

  public async discardDraft(id: string, ctx: MutationContext) {
    return this.mutate(ctx, 'draft-discard', `draft:${id}`, async (tx) => {
      const draft = await tx.getDraft(id);
      if (draft === null) {
        throw new ActivityError('NOT_FOUND', 'Draft not found');
      }
      if (draft.creatorDiscordUserId !== ctx.actor.discordUserId) {
        await this.requirePermission(
          ctx.actor,
          ACTIVITY_PERMISSIONS.MANAGE_GUILD,
          draft.guildId,
          'sensitive',
        );
      }
      await tx.deleteDraft(id);
      return { id, discarded: true };
    });
  }

  public async publishDraft(
    id: string,
    input: {
      organizationId: string;
      name: string;
      description?: string;
      startAt: Date;
      endAt?: Date | null;
      scheduleKind?: ScheduleKind;
      periodKey?: PeriodKey | null;
      scheduleHasExplicitTime?: boolean;
      participantLimit?: number | null;
      publicationChannelId?: string;
      timezone?: string;
      locationText?: string | null;
      typeId?: string | null;
      /** P4.5: shared (default) | separate */
      participantMode?: 'shared' | 'separate';
      /** P4.5: additional Discord guild+channel targets (home guild may be omitted). */
      targets?: readonly {
        guildId: string;
        channelId: string;
        participantLimit?: number | null;
      }[];
      /** P4.6: public (default) | private */
      visibility?: ActivityVisibility;
      privateRoleIds?: readonly string[];
    },
    ctx: MutationContext,
  ) {
    const discordUserId = requireDiscord(ctx.actor);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'draft-publish', `draft:${id}`, async (tx) => {
      const draft = await tx.getDraft(id);
      if (draft === null) {
        throw new ActivityError('NOT_FOUND', 'Draft not found');
      }
      if (isDraftExpired(draft.expiresAt, now)) {
        throw new ActivityError('GONE', 'Draft expired');
      }
      await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.CREATE, draft.guildId);

      const visibility: ActivityVisibility = input.visibility === 'private' ? 'private' : 'public';
      let privateInviteTokenHash: string | null = null;
      let mintedInviteToken: string | undefined;
      const privateRoleIds = input.privateRoleIds ?? [];
      if (visibility === 'private') {
        await this.requirePermission(
          ctx.actor,
          ACTIVITY_PERMISSIONS.CREATE_PRIVATE,
          draft.guildId,
          'sensitive',
        );
        const minted = mintPrivateInviteToken();
        privateInviteTokenHash = minted.tokenHash;
        mintedInviteToken = minted.token;
      }

      const participantMode = input.participantMode === 'separate' ? 'separate' : 'shared';
      const publicationTargets = normalizePublicationTargets({
        homeGuildId: draft.guildId,
        homeChannelId: input.publicationChannelId ?? null,
        ...(input.targets !== undefined ? { targets: input.targets } : {}),
      });
      if (publicationTargets.length > 1) {
        await this.requireOrganizationPermission(
          ctx.actor,
          ACTIVITY_PERMISSIONS.PUBLISH_MULTI_GUILD,
          'sensitive',
        );
      }
      for (const target of publicationTargets) {
        if (target.guildId !== draft.guildId) {
          await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.CREATE, target.guildId);
        }
      }

      const scheduleKind: ScheduleKind = input.scheduleKind ?? 'exact';
      const periodKey: PeriodKey | null =
        scheduleKind === 'flexible_period' ? (input.periodKey ?? null) : null;
      const scheduleHasExplicitTime = input.scheduleHasExplicitTime ?? true;
      const endAt = input.endAt ?? null;

      const extended = await this.resolveExtendedHorizon(ctx.actor, draft.guildId);
      assertScheduleValid({
        kind: scheduleKind,
        periodKey,
        startAt: input.startAt,
        endAt,
        now,
        allowExtendedHorizon: extended,
      });

      await tx.lockCreatorAdvisory(draft.guildId, discordUserId);
      const organizationId = await resolveGuildOrganizationId(
        tx,
        draft.guildId,
        input.organizationId,
      );
      const defaults = await tx.ensureGuildDefaults({
        guildId: draft.guildId,
        orgId: organizationId,
      });
      const activeCount = await tx.countActiveOwn(draft.guildId, discordUserId);
      assertCreateLimit({
        activeOwnCount: activeCount,
        maxActivePerCreator: defaults.settings.maxActivePerCreator,
      });

      // Period end / explicit endAt / start+2h existing rule.
      const finish = scheduledFinishAt(input.startAt, endAt);
      const activityId = randomUUID();
      const activity = await tx.insertActivity({
        id: activityId,
        guildId: draft.guildId,
        organizationId,
        typeId: input.typeId ?? null,
        name: input.name,
        description: input.description ?? '',
        startAt: input.startAt,
        endAt,
        scheduleKind,
        periodKey,
        scheduleHasExplicitTime,
        status: 'registrations_open',
        enrollmentOpen: true,
        participantLimit: input.participantLimit ?? null,
        participantMode,
        seriesId: null,
        seriesOccurrenceIndex: null,
        visibility,
        privateInviteTokenHash,
        privateRoleIds,
        organizerDiscordUserId: discordUserId,
        organizerV2UserId: ctx.actor.v2UserId ?? null,
        coOrganizerDiscordUserId: null,
        coOrganizerV2UserId: null,
        publicationChannelId: input.publicationChannelId ?? null,
        timezone: input.timezone ?? 'UTC',
        locationText: input.locationText ?? null,
        cancelReason: null,
        cancelledAt: null,
        scheduledFinishAt: finish,
        opaqueId: opaqueIdFromUuid(activityId),
      });

      if (defaults.settings.organizerDefaultStatusId !== null) {
        await tx.upsertParticipation({
          id: randomUUID(),
          activityId: activity.id,
          discordUserId,
          v2UserId: ctx.actor.v2UserId ?? null,
          statusDefId: defaults.settings.organizerDefaultStatusId,
          confirmationState: 'confirmed',
          reconfirmDeadline: null,
          waitlistPosition: null,
          scopeGuildId: participantMode === 'separate' ? draft.guildId : null,
        });
      }

      await tx.replacePublicationTargets(
        activity.id,
        publicationTargets.map((target, index) => ({
          organizationId,
          guildId: target.guildId,
          channelId: target.channelId,
          participantLimit:
            participantMode === 'separate'
              ? (target.participantLimit ?? input.participantLimit ?? null)
              : null,
          sortOrder: index,
        })),
      );

      await tx.insertOutbox({
        eventType: OUTBOX_EVENT_TYPES.CREATED,
        aggregateType: 'activity',
        aggregateId: activity.id,
        aggregateVersion: activity.version,
        payload: {
          activityId: activity.id,
          guildId: activity.guildId,
          opaqueId: activity.opaqueId,
          organizationId: activity.organizationId,
          participantMode: activity.participantMode,
          visibility: activity.visibility,
        },
        occurredAt: now,
      });
      await this.requestProjection(tx, activity, now);
      await this.triggerLfgMatchingAfterProjection(tx, activity, now);
      await tx.deleteDraft(id);
      await tx.insertAudit({
        guildId: activity.guildId,
        activityId: activity.id,
        actorDiscordUserId: discordUserId,
        action: 'activity.published',
        ...(ctx.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
      });
      return mintedInviteToken === undefined
        ? activity
        : { ...activity, privateInviteToken: mintedInviteToken };
    });
  }

  public async publishSeriesDraft(
    draftId: string,
    input: SeriesPublishInput,
    ctx: MutationContext,
  ) {
    const discordUserId = requireDiscord(ctx.actor);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'series-publish', `draft:${draftId}`, async (tx) => {
      const draft = await tx.getDraft(draftId);
      if (draft === null) {
        throw new ActivityError('NOT_FOUND', 'Draft not found');
      }
      if (isDraftExpired(draft.expiresAt, now)) {
        throw new ActivityError('GONE', 'Draft expired');
      }
      await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.CREATE, draft.guildId);
      await this.requirePermission(
        ctx.actor,
        ACTIVITY_PERMISSIONS.CREATE_RECURRING,
        draft.guildId,
        'sensitive',
      );

      const visibility: ActivityVisibility = input.visibility === 'private' ? 'private' : 'public';
      let privateInviteTokenHash: string | null = null;
      let mintedInviteToken: string | undefined;
      const privateRoleIds = input.privateRoleIds ?? [];
      if (visibility === 'private') {
        await this.requirePermission(
          ctx.actor,
          ACTIVITY_PERMISSIONS.CREATE_PRIVATE,
          draft.guildId,
          'sensitive',
        );
        const minted = mintPrivateInviteToken();
        privateInviteTokenHash = minted.tokenHash;
        mintedInviteToken = minted.token;
      }

      let starts: Date[];
      let endAts: (Date | null)[];
      try {
        const expanded = buildSeriesOccurrences({
          recurrenceKind: input.recurrenceKind,
          firstStartAt: input.firstStartAt,
          horizonEndAt: input.horizonEndAt,
          ...(input.weekdays !== undefined ? { weekdays: input.weekdays } : {}),
          ...(input.endAtOffsetMs !== undefined ? { endAtOffsetMs: input.endAtOffsetMs } : {}),
          now,
        });
        starts = expanded.starts;
        endAts = expanded.endAts;
      } catch (error) {
        const code =
          error instanceof Error && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'VALIDATION_FAILED';
        throw new ActivityError(
          code === 'HORIZON_EXCEEDED' ? 'HORIZON_EXCEEDED' : 'VALIDATION_FAILED',
          error instanceof Error ? error.message : 'Invalid series',
        );
      }

      await tx.lockCreatorAdvisory(draft.guildId, discordUserId);
      const organizationId = await resolveGuildOrganizationId(
        tx,
        draft.guildId,
        input.organizationId,
      );
      const defaults = await tx.ensureGuildDefaults({
        guildId: draft.guildId,
        orgId: organizationId,
      });
      const activeCount = await tx.countActiveOwn(draft.guildId, discordUserId);
      assertCreateLimit({
        activeOwnCount: activeCount + starts.length - 1,
        maxActivePerCreator: defaults.settings.maxActivePerCreator,
      });

      const { series, activities } = await insertSeriesWithOccurrences(tx, {
        seriesId: randomUUID(),
        draftGuildId: draft.guildId,
        organizationId,
        discordUserId,
        v2UserId: ctx.actor.v2UserId ?? null,
        publish: input,
        starts,
        endAts,
        privateInviteTokenHash,
        visibility,
        privateRoleIds,
        organizerDefaultStatusId: defaults.settings.organizerDefaultStatusId,
      });

      for (const activity of activities) {
        await tx.insertOutbox({
          eventType: OUTBOX_EVENT_TYPES.CREATED,
          aggregateType: 'activity',
          aggregateId: activity.id,
          aggregateVersion: activity.version,
          payload: {
            activityId: activity.id,
            guildId: activity.guildId,
            opaqueId: activity.opaqueId,
            organizationId: activity.organizationId,
            seriesId: series.id,
            visibility: activity.visibility,
          },
          occurredAt: now,
        });
        await this.requestProjection(tx, activity, now);
      }

      await tx.deleteDraft(draftId);
      await tx.insertAudit({
        guildId: draft.guildId,
        ...(activities[0] !== undefined ? { activityId: activities[0].id } : {}),
        actorDiscordUserId: discordUserId,
        action: 'activity.series.published',
        ...(ctx.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
      });

      return {
        series,
        activities,
        ...(mintedInviteToken !== undefined ? { privateInviteToken: mintedInviteToken } : {}),
      };
    });
  }

  public async getActivity(
    id: string,
    actor: ActorSubject,
    access?: { memberRoleIds?: readonly string[]; inviteToken?: string },
  ) {
    const activity = await this.deps.repository.withTransaction(async (tx) => {
      const found = await tx.getActivity(id);
      if (found === null || found.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, found.guildId);
      if (
        !canViewPrivateActivity({
          activity: found,
          actor,
          ...(access?.memberRoleIds !== undefined ? { memberRoleIds: access.memberRoleIds } : {}),
          ...(access?.inviteToken !== undefined ? { inviteToken: access.inviteToken } : {}),
        })
      ) {
        throw new ActivityError('FORBIDDEN', 'Private activity access denied');
      }
      return found;
    });
    const [presented] = await this.presentActivities([activity], actor);
    return presented ?? redactPrivateSecrets(activity);
  }

  public async listActivities(
    guildId: string,
    actor: ActorSubject,
    access?: { memberRoleIds?: readonly string[] },
  ) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    const activities = await this.deps.repository.withTransaction((tx) =>
      tx.listActivities(guildId),
    );
    const visible = activities.filter((activity) =>
      canViewPrivateActivity({
        activity,
        actor,
        ...(access?.memberRoleIds !== undefined ? { memberRoleIds: access.memberRoleIds } : {}),
      }),
    );
    return this.presentActivities(visible, actor);
  }

  public async listMyActivities(actor: ActorSubject, guildId?: string) {
    const discordUserId = requireDiscord(actor);
    if (guildId !== undefined) {
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    }
    const activities = await this.deps.repository.withTransaction((tx) =>
      tx.listMyActivities({
        ...(guildId !== undefined ? { guildId } : {}),
        discordUserId,
        ...(actor.v2UserId !== undefined ? { v2UserId: actor.v2UserId } : {}),
      }),
    );
    return this.presentActivities(activities, actor);
  }

  public async editActivity(
    id: string,
    patch: Partial<{
      name: string;
      description: string;
      participantLimit: number | null;
      locationText: string | null;
      publicationChannelId: string | null;
    }>,
    ctx: MutationContext,
    seriesScope: SeriesEditScope = 'this',
  ) {
    return this.mutate(ctx, 'activity-edit', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      const now = this.deps.clock.now();
      const targets =
        seriesScope === 'this' || activity.seriesId === null
          ? [activity]
          : (await tx.listActivitiesBySeries(activity.seriesId)).filter(
              (row) =>
                row.status !== 'cancelled' &&
                row.status !== 'deleted' &&
                (row.seriesOccurrenceIndex ?? 0) >= (activity.seriesOccurrenceIndex ?? 0),
            );
      let last = activity;
      for (const target of targets) {
        const locked = target.id === activity.id ? activity : await tx.lockActivity(target.id);
        last = await tx.updateActivity({
          ...locked,
          name: patch.name ?? locked.name,
          description: patch.description ?? locked.description,
          participantLimit:
            patch.participantLimit === undefined ? locked.participantLimit : patch.participantLimit,
          locationText: patch.locationText === undefined ? locked.locationText : patch.locationText,
          publicationChannelId:
            patch.publicationChannelId === undefined
              ? locked.publicationChannelId
              : patch.publicationChannelId,
          version: locked.version + 1,
        });
        await this.requestProjection(tx, last, now);
      }
      return last;
    });
  }

  public async cancelActivity(
    id: string,
    reason: string,
    ctx: MutationContext,
    seriesScope: SeriesCancelScope = 'this',
  ) {
    if (reason.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'Cancel reason is required');
    }
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'activity-cancel', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);

      const targets = await this.resolveCancelTargets(tx, activity, seriesScope);
      let last = activity;
      for (const target of targets) {
        const locked = target.id === activity.id ? activity : await tx.lockActivity(target.id);
        if (locked.status === 'cancelled' || locked.status === 'deleted') {
          continue;
        }
        assertTransition(locked.status, 'cancelled');
        const updated = await tx.updateActivity({
          ...locked,
          status: 'cancelled',
          enrollmentOpen: false,
          cancelReason: reason,
          cancelledAt: now,
          version: locked.version + 1,
        });
        await tx.insertOutbox({
          eventType: OUTBOX_EVENT_TYPES.CANCELLED,
          aggregateType: 'activity',
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          payload: {
            activityId: updated.id,
            reason,
            opaqueId: updated.opaqueId,
            seriesScope,
          },
          occurredAt: now,
        });
        const participants = await tx.listParticipations(updated.id);
        for (const participant of participants) {
          if (
            participant.discordUserId === null ||
            participant.resignedAt !== null ||
            participant.removedAt !== null
          ) {
            continue;
          }
          await enqueueUserNotification(
            tx,
            {
              guildId: locked.guildId,
              recipientDiscordUserId: participant.discordUserId,
              notificationClass: 'TRANSACTIONAL',
              kind: 'activity.cancelled',
              title: 'Aktywność anulowana',
              body: reason.trim().length > 0 ? reason : 'Organizator anulował aktywność.',
              dedupeKey: `cancel:${updated.id}:${participant.discordUserId}:${updated.version}`,
              activityId: updated.id,
              deepLink: `v2://activities/${updated.id}`,
              fingerprint: `cancel|${updated.id}|${updated.version}|${reason}`,
            },
            now,
          );
        }
        await this.requestProjection(tx, updated, now);
        await this.triggerLfgMatchingAfterProjection(tx, updated, now);
        last = updated;
      }

      if (seriesScope === 'entire_series' && activity.seriesId !== null) {
        const series = await tx.getSeries(activity.seriesId);
        if (series !== null && series.status === 'active') {
          await tx.updateSeries({
            ...series,
            status: 'cancelled',
            version: series.version + 1,
          });
        }
      }
      return last;
    });
  }

  private async resolveCancelTargets(
    tx: ActivityTx,
    activity: ActivityRecord,
    seriesScope: SeriesCancelScope,
  ): Promise<ActivityRecord[]> {
    if (seriesScope === 'this' || activity.seriesId === null) {
      return [activity];
    }
    const all = await tx.listActivitiesBySeries(activity.seriesId);
    if (seriesScope === 'entire_series') {
      return all.filter((row) => row.status !== 'deleted');
    }
    return all.filter(
      (row) =>
        row.status !== 'deleted' &&
        (row.seriesOccurrenceIndex ?? 0) >= (activity.seriesOccurrenceIndex ?? 0),
    );
  }

  public async markAttendance(
    activityId: string,
    input: { subjectDiscordUserId: string; status: AttendanceMark },
    ctx: MutationContext,
  ) {
    const actorDiscord = requireDiscord(ctx.actor);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'attendance-mark', `activity:${activityId}`, async (tx) => {
      const activity = await tx.lockActivity(activityId);
      await this.requirePermission(
        ctx.actor,
        ACTIVITY_PERMISSIONS.ATTENDANCE_RECORD,
        activity.guildId,
      );
      const isOrganizer =
        activity.organizerDiscordUserId === actorDiscord ||
        activity.coOrganizerDiscordUserId === actorDiscord;
      if (!isOrganizer) {
        await this.requirePermission(
          ctx.actor,
          ACTIVITY_PERMISSIONS.MANAGE_GUILD,
          activity.guildId,
          'sensitive',
        );
      }
      try {
        assertAttendanceWindowOpen({
          activityFinishedAt: activity.scheduledFinishAt,
          now,
        });
      } catch (error) {
        const code =
          error instanceof Error && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'PRECONDITION_FAILED';
        throw new ActivityError(
          code === 'GONE' ? 'GONE' : 'PRECONDITION_FAILED',
          error instanceof Error ? error.message : 'Attendance window closed',
        );
      }
      const record = await tx.upsertAttendance({
        id: randomUUID(),
        activityId: activity.id,
        guildId: activity.guildId,
        subjectDiscordUserId: input.subjectDiscordUserId,
        markedByDiscordUserId: actorDiscord,
        status: input.status,
        markedAt: now,
      });
      await tx.insertAudit({
        guildId: activity.guildId,
        activityId: activity.id,
        actorDiscordUserId: actorDiscord,
        action: 'activity.attendance.marked',
        ...(ctx.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
      });
      return record;
    });
  }

  public async listAttendance(activityId: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivity(activityId);
      if (activity === null || activity.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.ATTENDANCE_RECORD, activity.guildId);
      return tx.listAttendance(activityId);
    });
  }

  public async getSelfStats(guildId: string, actor: ActorSubject) {
    const discordUserId = requireDiscord(actor);
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.STATS_READ_SELF, guildId);
    const records = await this.deps.repository.withTransaction((tx) =>
      tx.listAttendanceForSubject({ guildId, subjectDiscordUserId: discordUserId }),
    );
    return { guildId, subjectDiscordUserId: discordUserId, ...summarizeAttendance(records) };
  }

  public async getGuildStats(guildId: string, actor: ActorSubject) {
    await this.requirePermission(
      actor,
      ACTIVITY_PERMISSIONS.STATS_READ_GUILD,
      guildId,
      'sensitive',
    );
    const records = await this.deps.repository.withTransaction((tx) =>
      tx.listAttendanceForGuild(guildId),
    );
    return { guildId, ...summarizeAttendance(records) };
  }

  public async getSeries(seriesId: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const series = await tx.getSeries(seriesId);
      if (series === null) {
        throw new ActivityError('NOT_FOUND', 'Series not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, series.homeGuildId);
      const occurrences = await tx.listActivitiesBySeries(seriesId);
      return { series, occurrences };
    });
  }

  public async deleteActivity(id: string, ctx: MutationContext) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'activity-delete', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      const participants = await tx.listParticipations(id);
      const activeCount = participants.filter(
        (p) => p.resignedAt === null && p.removedAt === null,
      ).length;
      if (
        !canPermanentlyDelete({
          status: activity.status,
          startAt: activity.startAt,
          now,
          participantCount: activeCount,
        })
      ) {
        throw new ActivityError(
          'PRECONDITION_FAILED',
          'Permanent delete only before start with zero participants',
        );
      }
      if (activity.status === 'published') {
        assertTransition('published', 'deleted');
      } else if (activity.status === 'draft') {
        assertTransition('draft', 'deleted');
      } else {
        throw new ActivityError('PRECONDITION_FAILED', 'Cannot delete activity in this status');
      }
      const updated = await tx.updateActivity({
        ...activity,
        status: 'deleted',
        enrollmentOpen: false,
        version: activity.version + 1,
      });
      await this.requestProjection(tx, updated, now);
      return updated;
    });
  }

  public async openEnrollment(id: string, ctx: MutationContext) {
    return this.setEnrollment(id, true, ctx);
  }

  public async closeEnrollment(id: string, ctx: MutationContext) {
    return this.setEnrollment(id, false, ctx);
  }

  private async setEnrollment(id: string, open: boolean, ctx: MutationContext) {
    const now = this.deps.clock.now();
    return this.mutate(
      ctx,
      open ? 'enrollment-open' : 'enrollment-close',
      `activity:${id}`,
      async (tx) => {
        const activity = await tx.lockActivity(id);
        await this.requireManageSelfOrGuild(ctx.actor, activity);
        let status: ActivityStatus = activity.status;
        if (open && activity.status === 'published') {
          assertTransition(activity.status, 'registrations_open');
          status = 'registrations_open';
        } else if (open && activity.status === 'registrations_closed') {
          assertTransition(activity.status, 'registrations_open');
          status = 'registrations_open';
        } else if (!open && activity.status === 'registrations_open') {
          assertTransition(activity.status, 'registrations_closed');
          status = 'registrations_closed';
        }
        const updated = await tx.updateActivity({
          ...activity,
          status,
          enrollmentOpen: open,
          version: activity.version + 1,
        });
        await this.requestProjection(tx, updated, now);
        return updated;
      },
    );
  }

  public async rsvp(
    id: string,
    input: { statusDefId: string; guildId?: string; partyRoleKey?: string },
    ctx: MutationContext,
  ) {
    const discordUserId = requireDiscord(ctx.actor);
    const now = this.deps.clock.now();
    if (input.partyRoleKey !== undefined && !isPartyRoleKey(input.partyRoleKey)) {
      throw new ActivityError('VALIDATION_FAILED', 'Invalid party role key');
    }
    return this.mutate(ctx, 'rsvp', `activity:${id}:${discordUserId}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      const requestGuildId = input.guildId ?? activity.guildId;
      const targets = await tx.listPublicationTargets(id);
      const targetGuildIds =
        targets.length > 0 ? targets.map((t) => t.guildId) : [activity.guildId];
      if (!isGuildPublicationTarget(requestGuildId, targetGuildIds)) {
        throw new ActivityError('FORBIDDEN', 'Guild is not a publication target for this activity');
      }
      await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.JOIN, requestGuildId);
      if (
        !canViewPrivateActivity({
          activity,
          actor: ctx.actor,
        })
      ) {
        throw new ActivityError('FORBIDDEN', 'Private activity access denied');
      }
      if (!activity.enrollmentOpen) {
        throw new ActivityError('PRECONDITION_FAILED', 'Enrollment is closed');
      }
      const statusDef = await tx.getStatusDef(input.statusDefId);
      if (statusDef === null || !statusDef.active || !statusDef.selectableByMember) {
        throw new ActivityError('VALIDATION_FAILED', 'Invalid status definition');
      }

      const scopeGuildId = resolveParticipationScopeGuildId({
        mode: activity.participantMode,
        requestGuildId,
      });
      const targetMeta = targets.find((t) => t.guildId === requestGuildId);
      const participantLimit =
        activity.participantMode === 'separate'
          ? (targetMeta?.participantLimit ?? activity.participantLimit)
          : activity.participantLimit;

      const participants = await tx.listParticipations(id);
      const pool = filterParticipationsForMode(
        participants,
        activity.participantMode,
        requestGuildId,
      );
      const occupied = countOccupiedSlots(pool);
      let waitlistPosition: number | null = null;
      if (statusDef.occupiesSlot && !hasOpenSeat({ participantLimit, currentOccupied: occupied })) {
        const positions = pool
          .filter(
            (p) => p.waitlistPosition !== null && p.resignedAt === null && p.removedAt === null,
          )
          .map((p) => p.waitlistPosition as number);
        waitlistPosition = assignWaitlistPosition(positions);
      }

      const participation = await tx.upsertParticipation({
        id: randomUUID(),
        activityId: id,
        discordUserId,
        v2UserId: ctx.actor.v2UserId ?? null,
        statusDefId: input.statusDefId,
        confirmationState: 'confirmed',
        reconfirmDeadline: null,
        waitlistPosition,
        scopeGuildId,
        ...(input.partyRoleKey !== undefined ? { partyRoleKey: input.partyRoleKey } : {}),
      });

      await tx.insertOutbox({
        eventType: OUTBOX_EVENT_TYPES.RSVP_CHANGED,
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: activity.version,
        payload: {
          activityId: id,
          opaqueId: activity.opaqueId,
          participationId: participation.id,
          discordUserId,
          waitlisted: waitlistPosition !== null,
          scopeGuildId,
          requestGuildId,
        },
        occurredAt: now,
      });
      await this.requestProjection(
        tx,
        activity,
        now,
        activity.participantMode === 'separate' ? { onlyGuildIds: [requestGuildId] } : undefined,
      );
      await this.triggerLfgMatchingAfterProjection(tx, activity, now);
      return participation;
    });
  }

  public async resign(id: string, ctx: MutationContext) {
    const discordUserId = requireDiscord(ctx.actor);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'resign', `activity:${id}:${discordUserId}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.JOIN, activity.guildId);
      const participation = await tx.getParticipation(id, discordUserId);
      if (participation === null) {
        throw new ActivityError('NOT_FOUND', 'Participation not found');
      }
      const freedSlot =
        participation.occupiesSlot &&
        participation.waitlistPosition === null &&
        participation.resignedAt === null;
      await tx.markParticipationResigned(participation.id, now);
      const promoted = freedSlot
        ? await this.promoteWaitlist(tx, activity, now, participation.scopeGuildId)
        : null;
      await tx.insertOutbox({
        eventType: OUTBOX_EVENT_TYPES.RSVP_CHANGED,
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: activity.version,
        payload: {
          activityId: id,
          opaqueId: activity.opaqueId,
          discordUserId,
          resigned: true,
        },
        occurredAt: now,
      });
      await this.requestProjection(tx, activity, now);
      await this.triggerLfgMatchingAfterProjection(tx, activity, now);
      return { resigned: true, promoted };
    });
  }

  private async promoteWaitlist(
    tx: import('../ports/activity.ports.js').ActivityTx,
    activity: ActivityRecord,
    now: Date,
    scopeGuildId: string | null = null,
  ) {
    const settings = await tx.getSettings(activity.guildId);
    if (settings === null || settings.waitlistPromotionStatusId === null) {
      return null;
    }
    const promotionStatusId = settings.waitlistPromotionStatusId;
    const promotionStatus = await tx.getStatusDef(promotionStatusId);
    if (promotionStatus === null) {
      return null;
    }
    const participants = await tx.listParticipations(activity.id);
    const pool =
      activity.participantMode === 'separate'
        ? participants.filter((p) => p.scopeGuildId === scopeGuildId)
        : participants.filter((p) => p.scopeGuildId === null);
    const waitlisted = pool
      .filter(
        (p): p is typeof p & { waitlistPosition: number } =>
          p.waitlistPosition !== null && p.resignedAt === null && p.removedAt === null,
      )
      .map((p) => ({
        id: p.id,
        waitlistPosition: p.waitlistPosition,
      }));
    const next = nextWaitlistPromotion(waitlisted);
    if (next === undefined) {
      return null;
    }
    const target = pool.find((p) => p.id === next.id);
    if (target === undefined) {
      return null;
    }
    await tx.upsertParticipation({
      id: target.id,
      activityId: activity.id,
      discordUserId: target.discordUserId,
      v2UserId: target.v2UserId,
      statusDefId: promotionStatus.id,
      confirmationState: 'confirmed',
      reconfirmDeadline: null,
      waitlistPosition: null,
      scopeGuildId: target.scopeGuildId,
    });
    await tx.insertOutbox({
      eventType: OUTBOX_EVENT_TYPES.WAITLIST_PROMOTED,
      aggregateType: 'activity',
      aggregateId: activity.id,
      aggregateVersion: activity.version,
      payload: {
        activityId: activity.id,
        opaqueId: activity.opaqueId,
        participationId: target.id,
        scopeGuildId: target.scopeGuildId,
      },
      occurredAt: now,
    });
    if (target.discordUserId !== null) {
      await tx.enqueueInbox({
        guildId: target.scopeGuildId ?? activity.guildId,
        recipientDiscordUserId: target.discordUserId,
        kind: 'activity.waitlist_promoted',
        payload: {
          activityId: activity.id,
          opaqueId: activity.opaqueId,
          participationId: target.id,
        },
        dedupeKey: `waitlist-promote:${activity.id}:${target.id}:${activity.version}`,
      });
    }
    await this.requestProjection(
      tx,
      activity,
      now,
      activity.participantMode === 'separate' && target.scopeGuildId !== null
        ? { onlyGuildIds: [target.scopeGuildId] }
        : undefined,
    );
    return target.id;
  }

  public async listParticipants(id: string, actor: ActorSubject) {
    const { guildId, rows } = await this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivity(id);
      if (activity === null) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, activity.guildId);
      return { guildId: activity.guildId, rows: await tx.listParticipations(id) };
    });
    const displayByDiscordId = await this.resolveDisplayNames(
      guildId,
      collectParticipantDiscordIds(rows),
    );
    return rows.map((row) => {
      const { removeReason: _ignoredRemoveReason, ...publicRow } = row;
      void _ignoredRemoveReason;
      return {
        ...publicRow,
        displayName:
          row.discordUserId !== null
            ? (displayByDiscordId.get(row.discordUserId) ?? UNKNOWN_MEMBER_DISPLAY)
            : UNKNOWN_MEMBER_DISPLAY,
      };
    });
  }

  public async removeParticipant(
    id: string,
    input: { discordUserId: string; reason: string },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    return this.mutate(
      ctx,
      'participant-remove',
      `activity:${id}:${input.discordUserId}`,
      async (tx) => {
        const activity = await tx.lockActivity(id);
        await this.requireManageSelfOrGuild(ctx.actor, activity);
        const participation = await tx.getParticipation(id, input.discordUserId);
        if (participation === null) {
          throw new ActivityError('NOT_FOUND', 'Participation not found');
        }
        const freedSlot = participation.occupiesSlot && participation.waitlistPosition === null;
        await tx.markParticipationRemoved(participation.id, now, input.reason);
        const promoted = freedSlot ? await this.promoteWaitlist(tx, activity, now) : null;
        await tx.enqueueInbox({
          guildId: activity.guildId,
          recipientDiscordUserId: input.discordUserId,
          kind: 'activity.participant_removed',
          payload: {
            activityId: id,
            opaqueId: activity.opaqueId,
            reason: input.reason,
          },
          dedupeKey: `remove:${id}:${input.discordUserId}:${activity.version}`,
        });
        await this.requestProjection(tx, activity, now);
        await this.triggerLfgMatchingAfterProjection(tx, activity, now);
        return { removed: true, promoted };
      },
    );
  }

  public async assignCoOrganizer(
    id: string,
    input: { discordUserId: string; v2UserId?: string },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'co-organizer', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      if (
        activity.coOrganizerDiscordUserId !== null &&
        activity.coOrganizerDiscordUserId !== input.discordUserId
      ) {
        throw new ActivityError('CONFLICT', 'Activity already has a co-organizer (max 1)');
      }
      const updated = await tx.updateActivity({
        ...activity,
        coOrganizerDiscordUserId: input.discordUserId,
        coOrganizerV2UserId: input.v2UserId ?? null,
        version: activity.version + 1,
      });
      await this.requestProjection(tx, updated, now);
      return updated;
    });
  }

  public async takeover(id: string, ctx: MutationContext) {
    const discordUserId = requireDiscord(ctx.actor);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'takeover', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requirePermission(
        ctx.actor,
        ACTIVITY_PERMISSIONS.MANAGE_GUILD,
        activity.guildId,
        'sensitive',
      );
      const updated = await tx.updateActivity({
        ...activity,
        organizerDiscordUserId: discordUserId,
        organizerV2UserId: ctx.actor.v2UserId ?? null,
        version: activity.version + 1,
      });
      await this.requestProjection(tx, updated, now);
      return updated;
    });
  }

  public async startActivity(id: string, ctx: MutationContext) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'start', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      if (activity.status !== 'registrations_open' && activity.status !== 'registrations_closed') {
        throw new ActivityError('PRECONDITION_FAILED', 'Cannot start activity in this status');
      }
      assertTransition(activity.status, 'in_progress');
      const updated = await tx.updateActivity({
        ...activity,
        status: 'in_progress',
        enrollmentOpen: false,
        version: activity.version + 1,
      });
      await this.requestProjection(tx, updated, now);
      return updated;
    });
  }

  public async finishActivity(id: string, ctx: MutationContext) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'finish', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      if (
        activity.status !== 'in_progress' &&
        activity.status !== 'registrations_open' &&
        activity.status !== 'registrations_closed'
      ) {
        throw new ActivityError('PRECONDITION_FAILED', 'Cannot finish activity in this status');
      }
      const updated = await tx.updateActivity({
        ...activity,
        status: 'completed',
        enrollmentOpen: false,
        version: activity.version + 1,
      });
      await tx.insertOutbox({
        eventType: OUTBOX_EVENT_TYPES.FINISHED,
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: updated.version,
        payload: { activityId: id, opaqueId: updated.opaqueId },
        occurredAt: now,
      });
      await this.requestProjection(tx, updated, now);
      return updated;
    });
  }

  public async reschedule(
    id: string,
    input: {
      startAt: Date;
      endAt?: Date | null;
      scheduleKind?: ScheduleKind;
      periodKey?: PeriodKey | null;
      scheduleHasExplicitTime?: boolean;
      reconfirmDeadline?: Date | null;
    },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'reschedule', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      const scheduleKind: ScheduleKind = input.scheduleKind ?? 'exact';
      const periodKey: PeriodKey | null =
        scheduleKind === 'flexible_period' ? (input.periodKey ?? null) : null;
      const scheduleHasExplicitTime =
        input.scheduleHasExplicitTime ?? activity.scheduleHasExplicitTime;
      const endAt = input.endAt === undefined ? null : input.endAt;
      const extended = await this.resolveExtendedHorizon(ctx.actor, activity.guildId);
      assertScheduleValid({
        kind: scheduleKind,
        periodKey,
        startAt: input.startAt,
        endAt,
        now,
        allowExtendedHorizon: extended,
      });
      const deadline = resolveReconfirmDeadline({
        now,
        startAt: input.startAt,
        ...(input.reconfirmDeadline !== undefined
          ? { requestedDeadline: input.reconfirmDeadline }
          : {}),
      });
      const finish = scheduledFinishAt(input.startAt, endAt);
      const updated = await tx.updateActivity({
        ...activity,
        startAt: input.startAt,
        endAt,
        scheduleKind,
        periodKey,
        scheduleHasExplicitTime,
        scheduledFinishAt: finish,
        version: activity.version + 1,
      });

      const scheduleFields = buildSchedulePayloadFields({
        scheduleKind: updated.scheduleKind,
        periodKey: updated.periodKey,
        startAt: updated.startAt,
        endAt: updated.endAt,
        timeZone: updated.timezone,
        scheduleHasExplicitTime: updated.scheduleHasExplicitTime,
      });

      const participants = await tx.listParticipations(id);
      for (const p of participants) {
        if (p.resignedAt !== null || p.removedAt !== null) {
          continue;
        }
        if (!p.occupiesSlot || p.waitlistPosition !== null) {
          continue;
        }
        await tx.upsertParticipation({
          id: p.id,
          activityId: id,
          discordUserId: p.discordUserId,
          v2UserId: p.v2UserId,
          statusDefId: p.statusDefId,
          confirmationState: 'requires_reconfirmation',
          reconfirmDeadline: deadline,
          waitlistPosition: null,
        });
        if (p.discordUserId !== null) {
          await tx.enqueueInbox({
            guildId: activity.guildId,
            recipientDiscordUserId: p.discordUserId,
            kind: 'activity.reconfirm_required',
            payload: {
              activityId: id,
              opaqueId: updated.opaqueId,
              deadline: deadline.toISOString(),
              startAtIso: scheduleFields.startAtIso,
              scheduleLabel: scheduleFields.scheduleLabel,
              scheduleKind: scheduleFields.scheduleKind,
              periodKey: scheduleFields.periodKey,
              scheduleHasExplicitTime: scheduleFields.scheduleHasExplicitTime,
            },
            dedupeKey: `reconfirm:${id}:${p.discordUserId}:${updated.version}`,
          });
        }
      }

      await tx.insertOutbox({
        eventType: OUTBOX_EVENT_TYPES.SCHEDULE_CHANGED,
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: updated.version,
        payload: {
          activityId: id,
          opaqueId: updated.opaqueId,
          startAt: input.startAt.toISOString(),
          ...scheduleFields,
          ...(updated.endAt !== null ? { endAtIso: updated.endAt.toISOString() } : {}),
        },
        occurredAt: now,
      });
      await tx.insertOutbox({
        eventType: OUTBOX_EVENT_TYPES.RECONFIRM_REQUIRED,
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: updated.version,
        payload: {
          activityId: id,
          opaqueId: updated.opaqueId,
          deadline: deadline.toISOString(),
          scheduleLabel: scheduleFields.scheduleLabel,
        },
        occurredAt: now,
      });
      await this.requestProjection(tx, updated, now);
      await this.triggerLfgMatchingAfterProjection(tx, updated, now);
      return updated;
    });
  }

  public async reconfirm(id: string, ctx: MutationContext) {
    const discordUserId = requireDiscord(ctx.actor);
    return this.mutate(ctx, 'reconfirm', `activity:${id}:${discordUserId}`, async (tx) => {
      await tx.lockActivity(id);
      const participation = await tx.getParticipation(id, discordUserId);
      if (participation === null) {
        throw new ActivityError('NOT_FOUND', 'Participation not found');
      }
      if (participation.confirmationState !== 'requires_reconfirmation') {
        throw new ActivityError('PRECONDITION_FAILED', 'Reconfirmation not required');
      }
      return tx.upsertParticipation({
        id: participation.id,
        activityId: id,
        discordUserId,
        v2UserId: ctx.actor.v2UserId ?? null,
        statusDefId: participation.statusDefId,
        confirmationState: 'confirmed',
        reconfirmDeadline: null,
        waitlistPosition: null,
      });
    });
  }

  public async expireReconfirmations(ctx: MutationContext) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'expire-reconfirmations', 'maintenance', async (tx) => {
      const expiredRows = await tx.listExpiredReconfirmations(now);
      let expired = 0;
      let promoted = 0;
      const byActivity = new Map<
        string,
        { activityId: string; participationId: string; discordUserId: string | null }[]
      >();
      for (const row of expiredRows) {
        const list = byActivity.get(row.activityId) ?? [];
        list.push(row);
        byActivity.set(row.activityId, list);
      }
      for (const [activityId, rows] of byActivity) {
        const activity = await tx.lockActivity(activityId);
        for (const row of rows) {
          await tx.markParticipationResigned(row.participationId, now);
          expired += 1;
        }
        const promo = await this.promoteWaitlist(tx, activity, now);
        if (promo !== null) {
          promoted += 1;
        }
      }
      return { expired, promoted };
    });
  }

  public async expireReconfirmationsForActivity(activityId: string, ctx: MutationContext) {
    const now = this.deps.clock.now();
    return this.mutate(
      ctx,
      'expire-reconfirmations-activity',
      `activity:${activityId}`,
      async (tx) => {
        const activity = await tx.lockActivity(activityId);
        const participants = await tx.listParticipations(activityId);
        let expired = 0;
        let promoted = 0;
        for (const p of participants) {
          if (
            isReconfirmExpired({
              confirmationState: p.confirmationState,
              reconfirmDeadline: p.reconfirmDeadline,
              now,
            })
          ) {
            await tx.markParticipationResigned(p.id, now);
            expired += 1;
            const promo = await this.promoteWaitlist(tx, activity, now);
            if (promo !== null) {
              promoted += 1;
            }
          }
        }
        return { expired, promoted };
      },
    );
  }

  public async finishDue(ctx: MutationContext) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'finish-due', 'maintenance', async (tx) => {
      const due = await tx.listActivitiesDueForFinish(now);
      let finished = 0;
      for (const candidate of due) {
        const activity = await tx.lockActivity(candidate.id);
        if (
          activity.status === 'completed' ||
          activity.status === 'cancelled' ||
          activity.status === 'deleted'
        ) {
          continue;
        }
        assertTransition(activity.status, 'completed');
        const updated = await tx.updateActivity({
          ...activity,
          status: 'completed',
          enrollmentOpen: false,
          version: activity.version + 1,
        });
        await tx.insertOutbox({
          eventType: OUTBOX_EVENT_TYPES.FINISHED,
          aggregateType: 'activity',
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          payload: { activityId: updated.id, opaqueId: updated.opaqueId },
          occurredAt: now,
        });
        await this.requestProjection(tx, updated, now);
        finished += 1;
      }
      return { finished };
    });
  }

  public async upsertPanel(
    input: {
      organizationId: string;
      discordGuildId: string;
      channelId: string;
      panelType?: string;
      messageId?: string | null;
      status?: string;
      operationId?: string;
      nonce?: string;
      correlationId?: string;
      occurrenceOutcome?: 'sent' | 'adopted';
      incident?: { action: string; details?: Record<string, unknown> };
    },
    ctx: MutationContext,
  ) {
    await this.requirePermission(
      ctx.actor,
      ACTIVITY_PERMISSIONS.PANEL_MANAGE,
      input.discordGuildId,
      'sensitive',
    );
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'panel-upsert', `panel:${input.discordGuildId}`, async (tx) => {
      const organizationId = await resolveGuildOrganizationId(
        tx,
        input.discordGuildId,
        input.organizationId,
      );
      const { panel, repaired } = await tx.upsertPanel({
        organizationId,
        discordGuildId: input.discordGuildId,
        channelId: input.channelId,
        panelType: input.panelType ?? 'hub',
        ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      });
      if (input.operationId !== undefined && input.nonce !== undefined) {
        const isAck = input.operationId.endsWith(':ack');
        if (!isAck) {
          await tx.insertPublishOccurrence({
            panelId: panel.id,
            operationId: input.operationId,
            nonce: input.nonce.slice(0, 25),
            payloadVersion: panel.payloadVersion,
            desiredChannelId: input.channelId,
            ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
          });
        }
        if (input.occurrenceOutcome !== undefined) {
          const baseOperationId = input.operationId.replace(/:ack$/, '');
          await tx.updatePublishOccurrenceStatus({
            panelId: panel.id,
            operationId: baseOperationId,
            status: input.occurrenceOutcome,
          });
        }
      }
      if (input.incident !== undefined) {
        await tx.insertAudit({
          guildId: input.discordGuildId,
          action: input.incident.action,
          details: input.incident.details ?? {},
          ...(ctx.actor.discordUserId !== undefined
            ? { actorDiscordUserId: ctx.actor.discordUserId }
            : {}),
          ...(ctx.actor.v2UserId !== undefined ? { actorV2UserId: ctx.actor.v2UserId } : {}),
          ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        });
      }
      if (repaired) {
        await tx.insertOutbox({
          eventType: OUTBOX_EVENT_TYPES.PANEL_PROJECTION_REPAIRED,
          aggregateType: 'panel',
          aggregateId: panel.id,
          aggregateVersion: panel.payloadVersion,
          payload: { panelId: panel.id, messageId: panel.messageId },
          occurredAt: now,
        });
      }
      return panel;
    });
  }

  public async getPanelPendingOccurrence(panelId: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const panel = await tx.getPanel(panelId);
      if (panel === null) {
        throw new ActivityError('NOT_FOUND', 'Panel not found');
      }
      await this.requirePermission(
        actor,
        ACTIVITY_PERMISSIONS.PANEL_MANAGE,
        panel.discordGuildId,
        'sensitive',
      );
      return tx.getLatestPendingPublishOccurrence(panelId);
    });
  }

  public async listPanels(guildId: string, actor: ActorSubject) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.PANEL_MANAGE, guildId, 'sensitive');
    return this.deps.repository.withTransaction((tx) => tx.listPanels(guildId));
  }

  public async getPanel(id: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const panel = await tx.getPanel(id);
      if (panel === null) {
        throw new ActivityError('NOT_FOUND', 'Panel not found');
      }
      await this.requirePermission(
        actor,
        ACTIVITY_PERMISSIONS.PANEL_MANAGE,
        panel.discordGuildId,
        'sensitive',
      );
      return panel;
    });
  }

  public async claimOutbox(
    input: { owner: string; limit?: number; leaseSeconds?: number },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'outbox-claim', 'outbox', async (tx) =>
      tx.claimOutbox({
        owner: input.owner,
        limit: input.limit ?? 10,
        leaseSeconds: input.leaseSeconds ?? 30,
        now,
      }),
    );
  }

  public async completeOutbox(id: string, ctx: MutationContext) {
    return this.mutate(ctx, 'outbox-complete', `outbox:${id}`, async (tx) => {
      await tx.completeOutbox(id);
      return { id, status: 'delivered' };
    });
  }

  public async failOutbox(id: string, error: string, ctx: MutationContext) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'outbox-fail', `outbox:${id}`, async (tx) => {
      await tx.failOutbox(id, error, new Date(now.getTime() + 5_000));
      return { id, status: 'pending' };
    });
  }

  public async listInbox(actor: ActorSubject, input: { limit?: number; cursor?: string } = {}) {
    const discordUserId = requireDiscord(actor);
    return this.deps.repository.withTransaction((tx) =>
      tx.listInbox({
        discordUserId,
        limit: input.limit ?? 20,
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      }),
    );
  }

  public async markInboxRead(id: string, actor: ActorSubject) {
    const discordUserId = requireDiscord(actor);
    return this.deps.repository.withTransaction((tx) => tx.markInboxRead(id, discordUserId));
  }

  public async getNotificationPreferences(actor: ActorSubject, guildId: string) {
    const discordUserId = requireDiscord(actor);
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { getOrCreateNotificationPreference } = await import('./notification.use-cases.js');
      return getOrCreateNotificationPreference(tx, guildId, discordUserId);
    });
  }

  public async updateNotificationPreferences(
    actor: ActorSubject,
    guildId: string,
    input: {
      dmEnabled?: boolean;
      mutedInterestKeys?: readonly string[];
      mutedActivityTypeKeys?: readonly string[];
      mutedActivityIds?: readonly string[];
    },
  ) {
    const discordUserId = requireDiscord(actor);
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { updateNotificationPreference } = await import('./notification.use-cases.js');
      return updateNotificationPreference(tx, {
        guildId,
        recipientDiscordUserId: discordUserId,
        ...input,
      });
    });
  }

  public async searchLfg(
    actor: ActorSubject,
    input: {
      guildId: string;
      organizationId: string;
      activityTypeKey: string;
      characterId: string;
      sessionRoles: readonly string[];
      windowStartAt: string;
      windowEndAt: string;
      memberRoleIds?: readonly string[];
    },
  ) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, input.guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { searchLfgMatches } = await import('./lfg.use-cases.js');
      return searchLfgMatches(
        tx,
        actor,
        {
          guildId: input.guildId,
          organizationId: input.organizationId,
          activityTypeKey: input.activityTypeKey,
          characterId: input.characterId,
          sessionRoles: input.sessionRoles,
          windowStartAt: new Date(input.windowStartAt),
          windowEndAt: new Date(input.windowEndAt),
          ...(input.memberRoleIds !== undefined ? { memberRoleIds: input.memberRoleIds } : {}),
        },
        this.deps.characterVerify,
      );
    });
  }

  public async createLfgWatch(
    actor: ActorSubject,
    input: {
      guildId: string;
      organizationId: string;
      characterId: string;
      activityTypeKey: string;
      sessionRoles: readonly string[];
      windowStartAt: string;
      windowEndAt: string;
    },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CREATE, input.guildId);
    return this.mutate(ctx, 'lfg-watch-create', `guild:${input.guildId}`, async (tx) => {
      const { createLfgIntent } = await import('./lfg.use-cases.js');
      return createLfgIntent(
        tx,
        actor,
        {
          guildId: input.guildId,
          organizationId: input.organizationId,
          characterId: input.characterId,
          activityTypeKey: input.activityTypeKey,
          sessionRoles: input.sessionRoles,
          windowStartAt: new Date(input.windowStartAt),
          windowEndAt: new Date(input.windowEndAt),
        },
        this.deps.characterVerify,
        now,
      );
    });
  }

  public async updateLfgWatch(
    actor: ActorSubject,
    intentId: string,
    input: {
      guildId: string;
      sessionRoles: readonly string[];
      windowStartAt: string;
      windowEndAt: string;
    },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CREATE, input.guildId);
    return this.mutate(ctx, 'lfg-watch-update', `intent:${intentId}`, async (tx) => {
      const { updateLfgIntent } = await import('./lfg.use-cases.js');
      await updateLfgIntent(
        tx,
        actor,
        {
          intentId,
          guildId: input.guildId,
          sessionRoles: input.sessionRoles,
          windowStartAt: new Date(input.windowStartAt),
          windowEndAt: new Date(input.windowEndAt),
        },
        this.deps.characterVerify,
        now,
      );
      return { id: intentId, status: 'active' };
    });
  }

  public async cancelLfgWatch(
    actor: ActorSubject,
    intentId: string,
    guildId: string,
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CREATE, guildId);
    return this.mutate(ctx, 'lfg-watch-cancel', `intent:${intentId}`, async (tx) => {
      const { cancelLfgIntent } = await import('./lfg.use-cases.js');
      await cancelLfgIntent(tx, actor, intentId, now);
      return { id: intentId, status: 'cancelled' };
    });
  }

  public async listMyLfgWatches(actor: ActorSubject, guildId: string) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { listMyLfgIntents } = await import('./lfg.use-cases.js');
      return listMyLfgIntents(tx, actor, guildId);
    });
  }

  public async joinLfg(
    actor: ActorSubject,
    input: {
      activityId: string;
      statusDefId: string;
      partyRoleKey: string;
      guildId?: string;
      intentId?: string;
      characterId?: string;
      fullGroupWatchId?: string;
      memberRoleIds?: readonly string[];
    },
    ctx: MutationContext,
  ) {
    requireDiscord(actor);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'lfg-join', `activity:${input.activityId}`, async (tx) => {
      const activityPreview = await tx.getActivity(input.activityId);
      if (activityPreview === null) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      const requestGuildId = input.guildId ?? activityPreview.guildId;
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.JOIN, requestGuildId);
      const { joinLfgActivity } = await import('./lfg.use-cases.js');
      const participation = await joinLfgActivity(
        tx,
        actor,
        {
          activityId: input.activityId,
          statusDefId: input.statusDefId,
          partyRoleKey: input.partyRoleKey,
          ...(input.guildId !== undefined ? { guildId: input.guildId } : {}),
          ...(input.intentId !== undefined ? { intentId: input.intentId } : {}),
          ...(input.characterId !== undefined ? { characterId: input.characterId } : {}),
          ...(input.fullGroupWatchId !== undefined
            ? { fullGroupWatchId: input.fullGroupWatchId }
            : {}),
          ...(input.memberRoleIds !== undefined ? { memberRoleIds: input.memberRoleIds } : {}),
        },
        this.deps.characterVerify,
        now,
      );
      const activity = await tx.getActivity(input.activityId);
      if (activity === null) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await tx.insertOutbox({
        eventType: OUTBOX_EVENT_TYPES.RSVP_CHANGED,
        aggregateType: 'activity',
        aggregateId: input.activityId,
        aggregateVersion: activity.version,
        payload: {
          activityId: input.activityId,
          opaqueId: activity.opaqueId,
          participationId: participation.id,
          discordUserId: actor.discordUserId,
          partyRoleKey: input.partyRoleKey,
          lfgJoin: true,
        },
        occurredAt: now,
      });
      await this.requestProjection(tx, activity, now);
      await this.triggerLfgMatchingAfterProjection(tx, activity, now);
      return participation;
    });
  }

  public async pauseLfgWatch(
    actor: ActorSubject,
    intentId: string,
    guildId: string,
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CREATE, guildId);
    return this.mutate(ctx, 'lfg-watch-pause', `intent:${intentId}`, async (tx) => {
      const { pauseLfgIntent } = await import('./lfg.use-cases.js');
      await pauseLfgIntent(tx, actor, intentId, now);
      return { id: intentId, status: 'paused' };
    });
  }

  public async resumeLfgWatch(
    actor: ActorSubject,
    intentId: string,
    guildId: string,
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CREATE, guildId);
    return this.mutate(ctx, 'lfg-watch-resume', `intent:${intentId}`, async (tx) => {
      const { resumeLfgIntent } = await import('./lfg.use-cases.js');
      await resumeLfgIntent(tx, actor, intentId, now);
      return { id: intentId, status: 'active' };
    });
  }

  public async suppressLfgMatch(
    actor: ActorSubject,
    activityId: string,
    input: { intentId?: string; guildId: string },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CREATE, input.guildId);
    return this.mutate(ctx, 'lfg-match-suppress', `activity:${activityId}`, async (tx) => {
      const { suppressLfgMatch } = await import('./lfg.use-cases.js');
      await suppressLfgMatch(
        tx,
        actor,
        {
          activityId,
          ...(input.intentId !== undefined ? { intentId: input.intentId } : {}),
        },
        now,
      );
      return {
        activityId,
        ...(input.intentId !== undefined ? { intentId: input.intentId } : {}),
        suppressed: true,
      };
    });
  }

  public async createLfgFullGroupWatch(
    actor: ActorSubject,
    input: {
      guildId: string;
      organizationId: string;
      activityId: string;
      characterId: string;
      sessionRoles: readonly string[];
    },
    ctx: MutationContext,
  ) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.JOIN, input.guildId);
    return this.mutate(
      ctx,
      'lfg-full-group-watch-create',
      `activity:${input.activityId}`,
      async (tx) => {
        const { createLfgFullGroupWatch } = await import('./lfg.use-cases.js');
        return createLfgFullGroupWatch(tx, actor, input, this.deps.characterVerify);
      },
    );
  }

  public async cancelLfgFullGroupWatch(
    actor: ActorSubject,
    watchId: string,
    guildId: string,
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.JOIN, guildId);
    return this.mutate(ctx, 'lfg-full-group-watch-cancel', `watch:${watchId}`, async (tx) => {
      const { cancelLfgFullGroupWatch } = await import('./lfg.use-cases.js');
      await cancelLfgFullGroupWatch(tx, actor, watchId, now);
      return { id: watchId, status: 'cancelled' };
    });
  }

  public async resolveLfgIntentByOpaque(opaqueId: string, guildId: string, actor: ActorSubject) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { resolveLfgIntentByOpaque } = await import('./lfg.use-cases.js');
      return resolveLfgIntentByOpaque(tx, actor, guildId, opaqueId);
    });
  }

  public async resolveLfgFullGroupWatchByOpaque(
    opaqueId: string,
    guildId: string,
    actor: ActorSubject,
  ) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.JOIN, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { resolveLfgFullGroupWatchByOpaque } = await import('./lfg.use-cases.js');
      return resolveLfgFullGroupWatchByOpaque(tx, actor, guildId, opaqueId);
    });
  }

  public async resolveLfgActivityByOpaque(
    opaqueId: string,
    actor: ActorSubject,
    access?: { memberRoleIds?: readonly string[] },
  ) {
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivityByOpaqueId(opaqueId);
      if (activity === null || activity.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, activity.guildId);
      if (
        !canViewPrivateActivity({
          activity,
          actor,
          ...(access?.memberRoleIds !== undefined ? { memberRoleIds: access.memberRoleIds } : {}),
        })
      ) {
        throw new ActivityError('FORBIDDEN', 'Private activity access denied');
      }
      const activityTypeKey =
        activity.typeId === null ? null : await tx.getActivityTypeKeyByTypeId(activity.typeId);
      const roleNeeds = await tx.listActivityRoleRequirements(activity.id);
      const filled = await tx.countParticipationsByPartyRole(activity.id);
      return {
        activityId: activity.id,
        opaqueId: activity.opaqueId,
        name: activity.name,
        startAt: activity.startAt.toISOString(),
        guildId: activity.guildId,
        organizationId: activity.organizationId,
        activityTypeKey,
        enrollmentOpen: activity.enrollmentOpen,
        status: activity.status,
        roleNeedSummary: formatLfgRoleNeedSummary(roleNeeds, filled),
      };
    });
  }

  public async searchSimilarLfgGroups(
    actor: ActorSubject,
    input: {
      guildId: string;
      organizationId: string;
      activityTypeKey: string;
      startAt: string;
      memberRoleIds?: readonly string[];
    },
  ) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, input.guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { searchSimilarGroupsBeforeCreate } = await import('./lfg.use-cases.js');
      return searchSimilarGroupsBeforeCreate(tx, actor, {
        guildId: input.guildId,
        organizationId: input.organizationId,
        activityTypeKey: input.activityTypeKey,
        startAt: new Date(input.startAt),
        ...(input.memberRoleIds !== undefined ? { memberRoleIds: input.memberRoleIds } : {}),
      });
    });
  }

  public async createReservation(
    actor: ActorSubject,
    input: {
      guildId: string;
      organizationId: string;
      resourceId: string;
      spotId: string;
      startsAt: string;
      endsAt: string;
    },
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CREATE, input.guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { createReservation } = await import('./reservations.use-cases.js');
      return createReservation(
        tx,
        actor,
        {
          guildId: input.guildId,
          organizationId: input.organizationId,
          resourceId: input.resourceId,
          spotId: input.spotId,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        },
        now,
      );
    });
  }

  public async createMarketplaceOffer(
    actor: ActorSubject,
    input: {
      guildId: string;
      organizationId: string;
      side: 'BUY' | 'SELL';
      categoryKey: string;
      itemLabel: string;
      priceAmount?: number | null;
      budgetAmount?: number | null;
      quantity: number;
      description: string;
      expiresAt?: string | null;
    },
  ) {
    const now = this.deps.clock.now();
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CREATE, input.guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const { createMarketplaceOffer } = await import('./marketplace.use-cases.js');
      return createMarketplaceOffer(
        tx,
        actor,
        {
          guildId: input.guildId,
          organizationId: input.organizationId,
          side: input.side,
          categoryKey: input.categoryKey,
          itemLabel: input.itemLabel,
          quantity: input.quantity,
          description: input.description,
          ...(input.priceAmount !== undefined ? { priceAmount: input.priceAmount } : {}),
          ...(input.budgetAmount !== undefined ? { budgetAmount: input.budgetAmount } : {}),
          ...(input.expiresAt !== undefined && input.expiresAt !== null
            ? { expiresAt: new Date(input.expiresAt) }
            : {}),
        },
        now,
      );
    });
  }

  public async enqueueInbox(
    input: {
      guildId: string;
      recipientDiscordUserId: string;
      kind: string;
      payload: Record<string, unknown>;
      dedupeKey?: string;
    },
    ctx: MutationContext,
  ) {
    await this.requirePermission(
      ctx.actor,
      ACTIVITY_PERMISSIONS.MANAGE_GUILD,
      input.guildId,
      'sensitive',
    );
    return this.mutate(ctx, 'inbox-enqueue', `inbox:${input.guildId}`, async (tx) =>
      tx.enqueueInbox(input),
    );
  }

  public async createReport(
    activityId: string,
    input: { reasonCategory: string; details?: string | null },
    ctx: MutationContext,
  ) {
    const reporterDiscordUserId = requireDiscord(ctx.actor);
    return this.mutate(ctx, 'report-create', `activity:${activityId}`, async (tx) => {
      const activity = await tx.getActivity(activityId);
      if (activity === null || activity.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.JOIN, activity.guildId);
      if (input.reasonCategory.trim().length === 0) {
        throw new ActivityError('VALIDATION_FAILED', 'reasonCategory is required');
      }
      return tx.createReport({
        id: randomUUID(),
        guildId: activity.guildId,
        activityId,
        reporterDiscordUserId,
        reasonCategory: input.reasonCategory.trim(),
        details: input.details ?? null,
      });
    });
  }

  public async listReports(guildId: string, actor: ActorSubject) {
    await this.requireManageGuildOrReport(actor, guildId);
    return this.deps.repository.withTransaction((tx) => tx.listReports(guildId));
  }

  public async getActivityByOpaqueId(
    opaqueId: string,
    actor: ActorSubject,
    access?: { memberRoleIds?: readonly string[]; inviteToken?: string },
  ) {
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivityByOpaqueId(opaqueId);
      if (activity === null || activity.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, activity.guildId);
      if (
        !canViewPrivateActivity({
          activity,
          actor,
          ...(access?.memberRoleIds !== undefined ? { memberRoleIds: access.memberRoleIds } : {}),
          ...(access?.inviteToken !== undefined ? { inviteToken: access.inviteToken } : {}),
        })
      ) {
        throw new ActivityError('FORBIDDEN', 'Private activity access denied');
      }
      return redactPrivateSecrets(activity);
    });
  }

  public async getPanelByOpaqueId(opaqueId: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const panel = await tx.getPanelByOpaqueId(opaqueId);
      if (panel === null) {
        throw new ActivityError('NOT_FOUND', 'Panel not found');
      }
      await this.requirePermission(
        actor,
        ACTIVITY_PERMISSIONS.PANEL_MANAGE,
        panel.discordGuildId,
        'sensitive',
      );
      return panel;
    });
  }

  public async upsertActivityProjection(
    activityId: string,
    input: Omit<UpsertActivityProjectionInput, 'activityId' | 'guildId' | 'opaqueId'> & {
      guildId?: string;
      opaqueId?: string;
      channelId: string;
    },
    ctx: MutationContext,
  ) {
    return this.mutate(ctx, 'projection-upsert', `activity:${activityId}`, async (tx) => {
      const activity = await tx.getActivity(activityId);
      if (activity === null) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(
        ctx.actor,
        ACTIVITY_PERMISSIONS.MANAGE_GUILD,
        activity.guildId,
        'sensitive',
      );
      return tx.upsertActivityProjection({
        activityId,
        guildId: input.guildId ?? activity.guildId,
        channelId: input.channelId,
        opaqueId: input.opaqueId ?? activity.opaqueId,
        ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.revision !== undefined ? { revision: input.revision } : {}),
        ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
        ...(input.retryCount !== undefined ? { retryCount: input.retryCount } : {}),
        ...(input.desiredPayloadVersion !== undefined
          ? { desiredPayloadVersion: input.desiredPayloadVersion }
          : {}),
        ...(input.leaseOwner !== undefined ? { leaseOwner: input.leaseOwner } : {}),
        ...(input.leaseExpiresAt !== undefined ? { leaseExpiresAt: input.leaseExpiresAt } : {}),
      });
    });
  }

  public async getActivityProjection(activityId: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivity(activityId);
      if (activity === null) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, activity.guildId);
      const projection = await tx.getActivityProjection(activityId);
      if (projection === null) {
        throw new ActivityError('NOT_FOUND', 'Projection not found');
      }
      return projection;
    });
  }

  public async claimProjectionRepair(
    input: { owner: string; limit?: number; leaseSeconds?: number },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'projection-claim', 'projection', async (tx) =>
      tx.claimProjectionRepair({
        owner: input.owner,
        limit: input.limit ?? 10,
        leaseSeconds: input.leaseSeconds ?? 30,
        now,
      }),
    );
  }

  public async seedTestGuild(
    input: { guildId: string; orgId: string; channelId: string },
    ctx: MutationContext,
  ) {
    if (this.deps.nodeEnv === 'production' || this.deps.allowTestSeed !== true) {
      throw new ActivityError('FORBIDDEN', 'Test guild seed is disabled');
    }
    assertGuildIdAllowedForTestSeed(input.guildId);
    return this.mutate(ctx, 'test-seed-guild', `guild:${input.guildId}`, async (tx) => {
      const existing = await tx.getSettings(input.guildId);
      const defaults = await tx.ensureGuildDefaults({
        guildId: input.guildId,
        orgId: input.orgId,
      });
      // P4.3: Admin is SoT. Seed must not overwrite real config.
      const adminOwned =
        existing !== null &&
        (existing.configRevision > 1 || existing.allowedPublishChannelIds.length > 0);
      if (!adminOwned) {
        await tx.setAllowedPublishChannelIds(input.guildId, [input.channelId]);
      }
      const settings = await tx.getSettings(input.guildId);
      return {
        settings: settings ?? defaults.settings,
        statuses: defaults.statuses,
        seeded: true,
        configPreserved: adminOwned,
      };
    });
  }
}
