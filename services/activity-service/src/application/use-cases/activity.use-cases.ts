import { randomUUID } from 'node:crypto';

import { countOccupiedSlots, hasOpenSeat } from '../../domain/capacity.js';
import {
  assertCreateLimit,
  assertStartHorizon,
  draftExpiresAt,
  isDraftExpired,
} from '../../domain/create-limits.js';
import { ActivityError } from '../../domain/errors.js';
import {
  assertTransition,
  canPermanentlyDelete,
  scheduledFinishAt,
  type ActivityStatus,
} from '../../domain/lifecycle.js';
import { opaqueIdFromUuid } from '../../domain/opaque-id.js';
import { ACTIVITY_PERMISSIONS, EXTENDED_HORIZON_PERMISSIONS } from '../../domain/permissions.js';
import { isReconfirmExpired, resolveReconfirmDeadline } from '../../domain/reconfirmation.js';
import { assertValidReferenceStatus } from '../../domain/status-def.js';
import { assignWaitlistPosition, nextWaitlistPromotion } from '../../domain/waitlist.js';
import type {
  ActivityRecord,
  ActivityTx,
  ActivityUseCaseDeps,
  ActorSubject,
  GuildActivitySettingsRecord,
  ParticipationStatusDefRecord,
  UpsertActivityProjectionInput,
} from '../ports/activity.ports.js';

export interface MutationContext {
  readonly actor: ActorSubject;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
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

export class ActivityUseCases {
  public constructor(private readonly deps: ActivityUseCaseDeps) {}

  private async requirePermission(
    actor: ActorSubject,
    permissionId: string,
    guildId: string,
    operationClass: 'ordinary' | 'sensitive' = 'ordinary',
  ): Promise<void> {
    const result = await this.deps.authorize.authorize({
      subject: actor,
      permissionId,
      scope: { type: 'guild', guildId },
      operationClass,
    });
    if (!result.allowed) {
      throw new ActivityError('FORBIDDEN', `Missing permission ${permissionId}`);
    }
  }

  private async resolveExtendedHorizon(actor: ActorSubject, guildId: string): Promise<boolean> {
    for (const permissionId of EXTENDED_HORIZON_PERMISSIONS) {
      const result = await this.deps.authorize.authorize({
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
  ): Promise<void> {
    const channelId = activity.publicationChannelId ?? '';
    await tx.upsertActivityProjection({
      activityId: activity.id,
      guildId: activity.guildId,
      channelId,
      opaqueId: activity.opaqueId,
      status: 'pending',
    });
    await tx.insertOutbox({
      eventType: 'activity.activity.projection_requested.v1',
      aggregateType: 'activity',
      aggregateId: activity.id,
      aggregateVersion: activity.version,
      payload: {
        activityId: activity.id,
        opaqueId: activity.opaqueId,
        guildId: activity.guildId,
        channelId,
      },
      occurredAt: now,
    });
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
    return this.mutate(ctx, 'ensure-defaults', `guild:${guildId}`, async (tx) =>
      tx.ensureGuildDefaults({ guildId, orgId }),
    );
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
      return tx.updateDraft(id, { payload });
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
      participantLimit?: number | null;
      publicationChannelId?: string;
      timezone?: string;
      locationText?: string | null;
      typeId?: string | null;
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

      const extended = await this.resolveExtendedHorizon(ctx.actor, draft.guildId);
      assertStartHorizon({
        startAt: input.startAt,
        now,
        allowExtendedHorizon: extended,
      });

      await tx.lockCreatorAdvisory(draft.guildId, discordUserId);
      const defaults = await tx.ensureGuildDefaults({
        guildId: draft.guildId,
        orgId: input.organizationId,
      });
      const activeCount = await tx.countActiveOwn(draft.guildId, discordUserId);
      assertCreateLimit({
        activeOwnCount: activeCount,
        maxActivePerCreator: defaults.settings.maxActivePerCreator,
      });

      const finish = scheduledFinishAt(input.startAt, input.endAt ?? null);
      const activityId = randomUUID();
      const activity = await tx.insertActivity({
        id: activityId,
        guildId: draft.guildId,
        organizationId: input.organizationId,
        typeId: input.typeId ?? null,
        name: input.name,
        description: input.description ?? '',
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        status: 'registrations_open',
        enrollmentOpen: true,
        participantLimit: input.participantLimit ?? null,
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
        });
      }

      await tx.insertOutbox({
        eventType: 'activity.activity.created.v1',
        aggregateType: 'activity',
        aggregateId: activity.id,
        aggregateVersion: activity.version,
        payload: {
          activityId: activity.id,
          guildId: activity.guildId,
          opaqueId: activity.opaqueId,
        },
        occurredAt: now,
      });
      await this.requestProjection(tx, activity, now);
      await tx.deleteDraft(id);
      await tx.insertAudit({
        guildId: activity.guildId,
        activityId: activity.id,
        actorDiscordUserId: discordUserId,
        action: 'activity.published',
        ...(ctx.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
      });
      return activity;
    });
  }

  public async getActivity(id: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivity(id);
      if (activity === null || activity.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, activity.guildId);
      return activity;
    });
  }

  public async listActivities(guildId: string, actor: ActorSubject) {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    return this.deps.repository.withTransaction((tx) => tx.listActivities(guildId));
  }

  public async listMyActivities(actor: ActorSubject, guildId?: string) {
    const discordUserId = requireDiscord(actor);
    if (guildId !== undefined) {
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, guildId);
    }
    return this.deps.repository.withTransaction((tx) =>
      tx.listMyActivities({
        ...(guildId !== undefined ? { guildId } : {}),
        discordUserId,
        ...(actor.v2UserId !== undefined ? { v2UserId: actor.v2UserId } : {}),
      }),
    );
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
  ) {
    return this.mutate(ctx, 'activity-edit', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      const now = this.deps.clock.now();
      const updated = await tx.updateActivity({
        ...activity,
        name: patch.name ?? activity.name,
        description: patch.description ?? activity.description,
        participantLimit:
          patch.participantLimit === undefined ? activity.participantLimit : patch.participantLimit,
        locationText: patch.locationText === undefined ? activity.locationText : patch.locationText,
        publicationChannelId:
          patch.publicationChannelId === undefined
            ? activity.publicationChannelId
            : patch.publicationChannelId,
        version: activity.version + 1,
      });
      await this.requestProjection(tx, updated, now);
      return updated;
    });
  }

  public async cancelActivity(id: string, reason: string, ctx: MutationContext) {
    if (reason.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'Cancel reason is required');
    }
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'activity-cancel', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      assertTransition(activity.status, 'cancelled');
      const updated = await tx.updateActivity({
        ...activity,
        status: 'cancelled',
        enrollmentOpen: false,
        cancelReason: reason,
        cancelledAt: now,
        version: activity.version + 1,
      });
      await tx.insertOutbox({
        eventType: 'activity.activity.cancelled.v1',
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: updated.version,
        payload: { activityId: id, reason, opaqueId: updated.opaqueId },
        occurredAt: now,
      });
      const participants = await tx.listParticipations(id);
      for (const participant of participants) {
        if (
          participant.discordUserId === null ||
          participant.resignedAt !== null ||
          participant.removedAt !== null
        ) {
          continue;
        }
        await tx.enqueueInbox({
          guildId: activity.guildId,
          recipientDiscordUserId: participant.discordUserId,
          kind: 'activity.cancelled',
          payload: {
            activityId: id,
            opaqueId: updated.opaqueId,
            reason,
          },
          dedupeKey: `cancel:${id}:${participant.discordUserId}:${updated.version}`,
        });
      }
      await this.requestProjection(tx, updated, now);
      return updated;
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
        return tx.updateActivity({
          ...activity,
          status,
          enrollmentOpen: open,
          version: activity.version + 1,
        });
      },
    );
  }

  public async rsvp(id: string, input: { statusDefId: string }, ctx: MutationContext) {
    const discordUserId = requireDiscord(ctx.actor);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'rsvp', `activity:${id}:${discordUserId}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requirePermission(ctx.actor, ACTIVITY_PERMISSIONS.JOIN, activity.guildId);
      if (!activity.enrollmentOpen) {
        throw new ActivityError('PRECONDITION_FAILED', 'Enrollment is closed');
      }
      const statusDef = await tx.getStatusDef(input.statusDefId);
      if (statusDef === null || !statusDef.active || !statusDef.selectableByMember) {
        throw new ActivityError('VALIDATION_FAILED', 'Invalid status definition');
      }

      const participants = await tx.listParticipations(id);
      const occupied = countOccupiedSlots(participants);
      let waitlistPosition: number | null = null;
      if (
        statusDef.occupiesSlot &&
        !hasOpenSeat({ participantLimit: activity.participantLimit, currentOccupied: occupied })
      ) {
        const positions = participants
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
      });

      await tx.insertOutbox({
        eventType: 'activity.activity.rsvp_changed.v1',
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: activity.version,
        payload: {
          activityId: id,
          opaqueId: activity.opaqueId,
          participationId: participation.id,
          discordUserId,
          waitlisted: waitlistPosition !== null,
        },
        occurredAt: now,
      });
      await this.requestProjection(tx, activity, now);
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
      const promoted = freedSlot ? await this.promoteWaitlist(tx, activity, now) : null;
      await tx.insertOutbox({
        eventType: 'activity.activity.rsvp_changed.v1',
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
      return { resigned: true, promoted };
    });
  }

  private async promoteWaitlist(
    tx: import('../ports/activity.ports.js').ActivityTx,
    activity: ActivityRecord,
    now: Date,
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
    const waitlisted = participants
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
    const target = participants.find((p) => p.id === next.id);
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
    });
    await tx.insertOutbox({
      eventType: 'activity.activity.waitlist_promoted.v1',
      aggregateType: 'activity',
      aggregateId: activity.id,
      aggregateVersion: activity.version,
      payload: {
        activityId: activity.id,
        opaqueId: activity.opaqueId,
        participationId: target.id,
      },
      occurredAt: now,
    });
    if (target.discordUserId !== null) {
      await tx.enqueueInbox({
        guildId: activity.guildId,
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
    await this.requestProjection(tx, activity, now);
    return target.id;
  }

  public async listParticipants(id: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivity(id);
      if (activity === null) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, activity.guildId);
      return tx.listParticipations(id);
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
        return { removed: true, promoted };
      },
    );
  }

  public async assignCoOrganizer(
    id: string,
    input: { discordUserId: string; v2UserId?: string },
    ctx: MutationContext,
  ) {
    return this.mutate(ctx, 'co-organizer', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      if (
        activity.coOrganizerDiscordUserId !== null &&
        activity.coOrganizerDiscordUserId !== input.discordUserId
      ) {
        throw new ActivityError('CONFLICT', 'Activity already has a co-organizer (max 1)');
      }
      return tx.updateActivity({
        ...activity,
        coOrganizerDiscordUserId: input.discordUserId,
        coOrganizerV2UserId: input.v2UserId ?? null,
        version: activity.version + 1,
      });
    });
  }

  public async takeover(id: string, ctx: MutationContext) {
    const discordUserId = requireDiscord(ctx.actor);
    return this.mutate(ctx, 'takeover', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requirePermission(
        ctx.actor,
        ACTIVITY_PERMISSIONS.MANAGE_GUILD,
        activity.guildId,
        'sensitive',
      );
      return tx.updateActivity({
        ...activity,
        organizerDiscordUserId: discordUserId,
        organizerV2UserId: ctx.actor.v2UserId ?? null,
        version: activity.version + 1,
      });
    });
  }

  public async startActivity(id: string, ctx: MutationContext) {
    return this.mutate(ctx, 'start', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      if (activity.status !== 'registrations_open' && activity.status !== 'registrations_closed') {
        throw new ActivityError('PRECONDITION_FAILED', 'Cannot start activity in this status');
      }
      assertTransition(activity.status, 'in_progress');
      return tx.updateActivity({
        ...activity,
        status: 'in_progress',
        enrollmentOpen: false,
        version: activity.version + 1,
      });
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
        eventType: 'activity.activity.finished.v1',
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
    input: { startAt: Date; endAt?: Date | null; reconfirmDeadline?: Date | null },
    ctx: MutationContext,
  ) {
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'reschedule', `activity:${id}`, async (tx) => {
      const activity = await tx.lockActivity(id);
      await this.requireManageSelfOrGuild(ctx.actor, activity);
      const extended = await this.resolveExtendedHorizon(ctx.actor, activity.guildId);
      assertStartHorizon({ startAt: input.startAt, now, allowExtendedHorizon: extended });
      const deadline = resolveReconfirmDeadline({
        now,
        startAt: input.startAt,
        ...(input.reconfirmDeadline !== undefined
          ? { requestedDeadline: input.reconfirmDeadline }
          : {}),
      });
      const finish = scheduledFinishAt(input.startAt, input.endAt ?? null);
      const updated = await tx.updateActivity({
        ...activity,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        scheduledFinishAt: finish,
        version: activity.version + 1,
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
            },
            dedupeKey: `reconfirm:${id}:${p.discordUserId}:${updated.version}`,
          });
        }
      }

      await tx.insertOutbox({
        eventType: 'activity.activity.schedule_changed.v1',
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: updated.version,
        payload: {
          activityId: id,
          opaqueId: updated.opaqueId,
          startAt: input.startAt.toISOString(),
        },
        occurredAt: now,
      });
      await tx.insertOutbox({
        eventType: 'activity.activity.reconfirm_required.v1',
        aggregateType: 'activity',
        aggregateId: id,
        aggregateVersion: updated.version,
        payload: {
          activityId: id,
          opaqueId: updated.opaqueId,
          deadline: deadline.toISOString(),
        },
        occurredAt: now,
      });
      await this.requestProjection(tx, updated, now);
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
          eventType: 'activity.activity.finished.v1',
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
      const { panel, repaired } = await tx.upsertPanel({
        organizationId: input.organizationId,
        discordGuildId: input.discordGuildId,
        channelId: input.channelId,
        panelType: input.panelType ?? 'hub',
        ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      });
      if (input.operationId !== undefined && input.nonce !== undefined) {
        await tx.insertPublishOccurrence({
          panelId: panel.id,
          operationId: input.operationId,
          nonce: input.nonce.slice(0, 25),
          payloadVersion: panel.payloadVersion,
          desiredChannelId: input.channelId,
          ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        });
      }
      if (repaired) {
        await tx.insertOutbox({
          eventType: 'activity.panel.projection_repaired.v1',
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

  public async getActivityByOpaqueId(opaqueId: string, actor: ActorSubject) {
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivityByOpaqueId(opaqueId);
      if (activity === null || activity.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      await this.requirePermission(actor, ACTIVITY_PERMISSIONS.READ, activity.guildId);
      return activity;
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
    return this.mutate(ctx, 'test-seed-guild', `guild:${input.guildId}`, async (tx) => {
      const defaults = await tx.ensureGuildDefaults({
        guildId: input.guildId,
        orgId: input.orgId,
      });
      await tx.setAllowedPublishChannelIds(input.guildId, [input.channelId]);
      const settings = await tx.getSettings(input.guildId);
      return {
        settings: settings ?? defaults.settings,
        statuses: defaults.statuses,
        seeded: true,
      };
    });
  }
}
