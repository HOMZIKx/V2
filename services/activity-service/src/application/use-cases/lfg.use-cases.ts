import { randomUUID } from 'node:crypto';

import {
  buildLfgMatchFingerprint,
  deriveIntentExpiresAt,
  formatLfgMatchReason,
  formatLfgRoleNeedSummary,
  isPartyRoleKey,
  LFG_DUNGEON_ACTIVITY_TYPES,
  listEligibleJoinRoles,
  pickDeterministicJoinRole,
  rankLfgMatch,
  type LfgGroupMatchInput,
  type LfgSeekerInput,
  type PartyRoleKey,
} from '@v2/hub-core';

import { countOccupiedSlots, hasOpenSeat } from '../../domain/capacity.js';
import { ActivityError } from '../../domain/errors.js';
import { opaqueIdFromUuid } from '../../domain/opaque-id.js';
import {
  filterParticipationsForMode,
  isGuildPublicationTarget,
  resolveParticipationScopeGuildId,
} from '../../domain/participant-mode.js';
import { ACTIVITY_PERMISSIONS } from '../../domain/permissions.js';
import { resolveGuildOrganizationId } from '../guild-organization-scope.js';
import type {
  ActivityRecord,
  ActivityTx,
  ActorSubject,
  AuthorizePort,
  ParticipationRecord,
} from '../ports/activity.ports.js';
import { canViewPrivateActivity } from './activity-p46.helpers.js';
import { verifyLfgCharacter, type LfgCharacterVerifyPort } from './lfg-character-verify.js';
import { enqueueUserNotification } from './notification.use-cases.js';

const LFG_DUNGEON_TYPE_KEYS = new Set(LFG_DUNGEON_ACTIVITY_TYPES.map((entry) => entry.key));
const SIMILAR_GROUP_WINDOW_MS = 2 * 3_600_000;
const LFG_SEARCH_RESULT_LIMIT = 50;

type GroupMatchContext = {
  needs: LfgGroupMatchInput['roleNeeds'];
  filled: Readonly<Partial<Record<PartyRoleKey, number>>>;
  occupied: number;
  capacity: number;
  group: LfgGroupMatchInput;
  fingerprint: string;
  roleNeedSummary: string;
};

function assembleGroupMatchContext(
  activity: ActivityRecord,
  activityTypeKey: string,
  needs: LfgGroupMatchInput['roleNeeds'],
  filled: Readonly<Partial<Record<PartyRoleKey, number>>>,
  occupied: number,
): GroupMatchContext {
  const capacity = activity.participantLimit ?? 8;
  const group: LfgGroupMatchInput = {
    activityTypeKey,
    guildId: activity.guildId,
    organizationId: activity.organizationId,
    capacity,
    occupied,
    status: activityGroupStatus(activity, occupied, capacity),
    startAtMs: activity.startAt.getTime(),
    roleNeeds: needs,
    filledByRole: filled,
  };
  const fingerprint = buildLfgMatchFingerprint({
    activityId: activity.id,
    activityVersion: activity.version,
    startAtIso: activity.startAt.toISOString(),
    occupied,
    capacity,
    roleNeeds: needs,
    filledByRole: filled,
  });
  const roleNeedSummary = formatLfgRoleNeedSummary(needs, filled);
  return { needs, filled, occupied, capacity, group, fingerprint, roleNeedSummary };
}

async function buildGroupMatchContext(
  tx: ActivityTx,
  activity: ActivityRecord,
  activityTypeKey: string,
): Promise<GroupMatchContext> {
  const needs = await tx.listActivityRoleRequirements(activity.id);
  const filled = await tx.countParticipationsByPartyRole(activity.id);
  const occupied = await tx.countOccupiedParticipations(activity.id);
  return assembleGroupMatchContext(activity, activityTypeKey, needs, filled, occupied);
}

async function buildGroupMatchContextsForActivities(
  tx: ActivityTx,
  activities: readonly ActivityRecord[],
  activityTypeKey: string,
): Promise<Map<string, GroupMatchContext>> {
  if (activities.length === 0) {
    return new Map();
  }
  const activityIds = activities.map((activity) => activity.id);
  const [needsByActivity, filledByActivity, occupiedByActivity] = await Promise.all([
    tx.listActivityRoleRequirementsForActivities(activityIds),
    tx.countParticipationsByPartyRoleForActivities(activityIds),
    tx.countOccupiedParticipationsForActivities(activityIds),
  ]);
  const contexts = new Map<string, GroupMatchContext>();
  for (const activity of activities) {
    contexts.set(
      activity.id,
      assembleGroupMatchContext(
        activity,
        activityTypeKey,
        needsByActivity.get(activity.id) ?? [],
        filledByActivity.get(activity.id) ?? {},
        occupiedByActivity.get(activity.id) ?? 0,
      ),
    );
  }
  return contexts;
}

function requireDiscord(actor: ActorSubject): string {
  if (actor.discordUserId === undefined || actor.discordUserId.trim().length === 0) {
    throw new ActivityError('UNAUTHENTICATED', 'Discord actor required');
  }
  return actor.discordUserId;
}

function assertValidWindow(windowStartAt: Date, windowEndAt: Date): void {
  if (windowEndAt.getTime() <= windowStartAt.getTime()) {
    throw new ActivityError('VALIDATION_FAILED', 'windowEndAt must be after windowStartAt');
  }
}

async function resolveMembershipOk(
  authorize: AuthorizePort,
  guildId: string,
  discordUserId: string,
): Promise<boolean> {
  const result = await authorize.authorize({
    subject: { discordUserId },
    permissionId: ACTIVITY_PERMISSIONS.JOIN,
    scope: { type: 'guild', guildId },
  });
  return result.allowed;
}

function buildSeekerInput(
  _group: LfgGroupMatchInput,
  verified: {
    readonly guildId: string;
    readonly organizationId: string;
    readonly activityTypeKey: string;
    readonly classSpecKey: string;
    readonly supportedPartyRoles: readonly PartyRoleKey[];
    readonly sessionRoles: readonly PartyRoleKey[];
    readonly windowStartMs: number;
    readonly windowEndMs: number;
    readonly membershipOk: boolean;
  },
): LfgSeekerInput {
  return {
    guildId: verified.guildId,
    organizationId: verified.organizationId,
    activityTypeKey: verified.activityTypeKey,
    characterClassSpecKey: verified.classSpecKey,
    characterSupportedRoles: verified.supportedPartyRoles,
    sessionRoles: verified.sessionRoles,
    windowStartMs: verified.windowStartMs,
    windowEndMs: verified.windowEndMs,
    membershipOk: verified.membershipOk,
  };
}

function assertPartyRoleStillOpen(
  partyRoleKey: PartyRoleKey,
  roleNeeds: LfgGroupMatchInput['roleNeeds'],
  filledByRole: Readonly<Partial<Record<PartyRoleKey, number>>>,
): void {
  if (roleNeeds.length === 0) {
    return;
  }
  const need = roleNeeds.find((entry) => entry.role === partyRoleKey);
  if (need === undefined) {
    if (partyRoleKey !== 'FLEX') {
      throw new ActivityError('PRECONDITION_FAILED', 'Selected party role is not needed');
    }
    return;
  }
  const filled = filledByRole[partyRoleKey] ?? 0;
  if (filled >= need.requiredCount) {
    throw new ActivityError('PRECONDITION_FAILED', 'Selected party role slot is already filled');
  }
}

function activityGroupStatus(
  activity: ActivityRecord,
  occupied: number,
  capacity: number,
): LfgGroupMatchInput['status'] {
  if (activity.status === 'cancelled') {
    return 'cancelled';
  }
  if (activity.status === 'completed') {
    return 'ended';
  }
  if (occupied >= capacity) {
    return 'full';
  }
  return 'open';
}

export type LfgSearchInput = {
  readonly guildId: string;
  readonly organizationId: string;
  readonly activityTypeKey: string;
  readonly characterId: string;
  readonly sessionRoles: readonly string[];
  readonly windowStartAt: Date;
  readonly windowEndAt: Date;
  readonly memberRoleIds?: readonly string[];
};

export type LfgSearchMatch = {
  readonly activityId: string;
  readonly opaqueId: string;
  readonly occupancy: { readonly occupied: number; readonly capacity: number };
  readonly roleNeedSummary: string;
  readonly matchReason: string;
  readonly eligiblePartyRoles: readonly PartyRoleKey[];
  readonly suggestedPartyRole: PartyRoleKey | null;
};

export async function searchLfgMatches(
  tx: ActivityTx,
  actor: ActorSubject,
  input: LfgSearchInput,
  characterVerify: LfgCharacterVerifyPort,
): Promise<{ matches: readonly LfgSearchMatch[] }> {
  const discordUserId = requireDiscord(actor);
  assertValidWindow(input.windowStartAt, input.windowEndAt);
  const organizationId = await resolveGuildOrganizationId(tx, input.guildId, input.organizationId);
  const verified = await verifyLfgCharacter(characterVerify, {
    discordUserId,
    characterId: input.characterId,
    sessionRoles: input.sessionRoles,
  });
  const activities = await tx.listOpenActivitiesForLfg({
    guildId: input.guildId,
    organizationId,
    activityTypeKey: input.activityTypeKey,
  });

  const visibleActivities = activities.filter((activity) =>
    canViewPrivateActivity({
      activity,
      actor,
      ...(input.memberRoleIds !== undefined ? { memberRoleIds: input.memberRoleIds } : {}),
    }),
  );
  const contexts = await buildGroupMatchContextsForActivities(
    tx,
    visibleActivities,
    input.activityTypeKey,
  );

  const ranked: Array<LfgSearchMatch & { score: number }> = [];

  for (const activity of visibleActivities) {
    const ctx = contexts.get(activity.id);
    if (ctx === undefined) {
      continue;
    }
    const seeker = buildSeekerInput(ctx.group, {
      guildId: input.guildId,
      organizationId,
      activityTypeKey: input.activityTypeKey,
      classSpecKey: verified.classSpecKey,
      supportedPartyRoles: verified.supportedPartyRoles,
      sessionRoles: verified.sessionRoles,
      windowStartMs: input.windowStartAt.getTime(),
      windowEndMs: input.windowEndAt.getTime(),
      membershipOk: activity.guildId === input.guildId,
    });
    const rank = rankLfgMatch(ctx.group, seeker);
    if (rank.eligible) {
      const eligiblePartyRoles = listEligibleJoinRoles(ctx.group, seeker);
      ranked.push({
        activityId: activity.id,
        opaqueId: activity.opaqueId,
        occupancy: { occupied: ctx.occupied, capacity: ctx.capacity },
        roleNeedSummary: ctx.roleNeedSummary,
        matchReason: formatLfgMatchReason(rank.reasons),
        eligiblePartyRoles,
        suggestedPartyRole: pickDeterministicJoinRole(eligiblePartyRoles),
        score: rank.score,
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return {
    matches: ranked.slice(0, LFG_SEARCH_RESULT_LIMIT).map(({ score, ...match }) => {
      void score;
      return match;
    }),
  };
}

export async function searchSimilarGroupsBeforeCreate(
  tx: ActivityTx,
  actor: ActorSubject,
  input: {
    readonly guildId: string;
    readonly organizationId: string;
    readonly activityTypeKey: string;
    readonly startAt: Date;
    readonly memberRoleIds?: readonly string[];
  },
): Promise<{
  warnings: readonly {
    activityId: string;
    opaqueId: string;
    name: string;
    startAt: Date;
  }[];
}> {
  requireDiscord(actor);
  const activities = await tx.listOpenActivitiesForLfg({
    guildId: input.guildId,
    organizationId: input.organizationId,
    activityTypeKey: input.activityTypeKey,
  });
  const startMs = input.startAt.getTime();
  const warnings: Array<{ activityId: string; opaqueId: string; name: string; startAt: Date }> = [];
  for (const activity of activities) {
    if (
      !canViewPrivateActivity({
        activity,
        actor,
        ...(input.memberRoleIds !== undefined ? { memberRoleIds: input.memberRoleIds } : {}),
      })
    ) {
      continue;
    }
    const delta = Math.abs(activity.startAt.getTime() - startMs);
    if (delta <= SIMILAR_GROUP_WINDOW_MS) {
      warnings.push({
        activityId: activity.id,
        opaqueId: activity.opaqueId,
        name: activity.name,
        startAt: activity.startAt,
      });
    }
  }
  warnings.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return { warnings };
}

export async function createLfgIntent(
  tx: ActivityTx,
  actor: ActorSubject,
  input: {
    guildId: string;
    organizationId: string;
    characterId: string;
    activityTypeKey: string;
    sessionRoles: readonly string[];
    windowStartAt: Date;
    windowEndAt: Date;
  },
  characterVerify: LfgCharacterVerifyPort,
  now: Date,
): Promise<{ intentId: string }> {
  const userId = requireDiscord(actor);
  assertValidWindow(input.windowStartAt, input.windowEndAt);
  const organizationId = await resolveGuildOrganizationId(tx, input.guildId, input.organizationId);
  const verified = await verifyLfgCharacter(characterVerify, {
    discordUserId: userId,
    characterId: input.characterId,
    sessionRoles: input.sessionRoles,
  });
  const overlapping = await tx.hasOverlappingLfgIntent({
    recipientDiscordUserId: userId,
    characterId: verified.characterId,
    activityTypeKey: input.activityTypeKey,
    windowStartAt: input.windowStartAt,
    windowEndAt: input.windowEndAt,
    now,
  });
  if (overlapping) {
    throw new ActivityError('CONFLICT', 'An active LFG watch already covers this time window');
  }
  const expiresAt = deriveIntentExpiresAt(input.windowEndAt, now);
  const intentId = await tx.insertLfgIntent({
    guildId: input.guildId,
    organizationId,
    recipientDiscordUserId: userId,
    characterId: verified.characterId,
    activityTypeKey: input.activityTypeKey,
    sessionRoles: verified.sessionRoles,
    windowStartAt: input.windowStartAt,
    windowEndAt: input.windowEndAt,
    expiresAt,
    classSpecKey: verified.classSpecKey,
  });
  return { intentId };
}

export async function updateLfgIntent(
  tx: ActivityTx,
  actor: ActorSubject,
  input: {
    intentId: string;
    guildId: string;
    sessionRoles: readonly string[];
    windowStartAt: Date;
    windowEndAt: Date;
  },
  characterVerify: LfgCharacterVerifyPort,
  now: Date,
): Promise<void> {
  const userId = requireDiscord(actor);
  assertValidWindow(input.windowStartAt, input.windowEndAt);
  const intent = await tx.getLfgIntentById(input.intentId);
  if (
    intent === null ||
    intent.recipientDiscordUserId !== userId ||
    intent.guildId !== input.guildId
  ) {
    throw new ActivityError('NOT_FOUND', 'LFG watch not found');
  }
  if (intent.cancelledAt !== null || intent.fulfilledAt !== null) {
    throw new ActivityError('PRECONDITION_FAILED', 'LFG watch is not editable');
  }
  if (intent.pausedAt !== null) {
    throw new ActivityError('PRECONDITION_FAILED', 'Resume the watch before editing');
  }
  if (intent.expiresAt.getTime() <= now.getTime()) {
    throw new ActivityError('PRECONDITION_FAILED', 'LFG watch has expired');
  }
  const verified = await verifyLfgCharacter(characterVerify, {
    discordUserId: userId,
    characterId: intent.characterId,
    sessionRoles: input.sessionRoles,
  });
  const overlapping = await tx.hasOverlappingLfgIntent({
    recipientDiscordUserId: userId,
    characterId: intent.characterId,
    activityTypeKey: intent.activityTypeKey,
    windowStartAt: input.windowStartAt,
    windowEndAt: input.windowEndAt,
    now,
    excludeIntentId: input.intentId,
  });
  if (overlapping) {
    throw new ActivityError('CONFLICT', 'An active LFG watch already covers this time window');
  }
  const expiresAt = deriveIntentExpiresAt(input.windowEndAt, now);
  const updated = await tx.updateLfgIntent({
    intentId: input.intentId,
    recipientDiscordUserId: userId,
    sessionRoles: verified.sessionRoles,
    windowStartAt: input.windowStartAt,
    windowEndAt: input.windowEndAt,
    expiresAt,
    classSpecKey: verified.classSpecKey,
    now,
  });
  if (!updated) {
    throw new ActivityError('NOT_FOUND', 'LFG watch not found');
  }
  await tx.clearLfgIntentSuppressions(input.intentId);
}

export async function cancelLfgIntent(
  tx: ActivityTx,
  actor: ActorSubject,
  intentId: string,
  now: Date,
): Promise<void> {
  const userId = requireDiscord(actor);
  const cancelled = await tx.cancelLfgIntent(intentId, userId, now);
  if (!cancelled) {
    throw new ActivityError('NOT_FOUND', 'LFG watch not found');
  }
}

export async function pauseLfgIntent(
  tx: ActivityTx,
  actor: ActorSubject,
  intentId: string,
  now: Date,
): Promise<void> {
  const userId = requireDiscord(actor);
  const paused = await tx.pauseLfgIntent(intentId, userId, now);
  if (!paused) {
    throw new ActivityError('NOT_FOUND', 'LFG watch not found or not pausable');
  }
}

export async function resumeLfgIntent(
  tx: ActivityTx,
  actor: ActorSubject,
  intentId: string,
  now: Date,
): Promise<void> {
  const userId = requireDiscord(actor);
  const intent = await tx.getLfgIntentById(intentId);
  if (intent === null || intent.recipientDiscordUserId !== userId) {
    throw new ActivityError('NOT_FOUND', 'LFG watch not found or not resumable');
  }
  if (
    intent.cancelledAt !== null ||
    intent.fulfilledAt !== null ||
    intent.pausedAt === null ||
    intent.expiresAt.getTime() <= now.getTime() ||
    intent.windowEndAt.getTime() <= now.getTime()
  ) {
    throw new ActivityError('PRECONDITION_FAILED', 'LFG watch is not resumable');
  }
  const resumed = await tx.resumeLfgIntent(intentId, userId, now);
  if (!resumed) {
    throw new ActivityError('NOT_FOUND', 'LFG watch not found or not resumable');
  }
}

export async function listMyLfgIntents(tx: ActivityTx, actor: ActorSubject, guildId: string) {
  const userId = requireDiscord(actor);
  return tx.listLfgIntentsForUser(guildId, userId);
}

export async function resolveLfgIntentByOpaque(
  tx: ActivityTx,
  actor: ActorSubject,
  guildId: string,
  opaqueId: string,
) {
  const userId = requireDiscord(actor);
  const intent = await tx.getLfgIntentByOpaqueId(userId, guildId, opaqueId);
  if (intent === null) {
    throw new ActivityError('NOT_FOUND', 'LFG watch not found');
  }
  return {
    id: intent.id,
    opaqueId: opaqueIdFromUuid(intent.id),
    guildId: intent.guildId,
    organizationId: intent.organizationId,
    characterId: intent.characterId,
    sessionRoles: intent.sessionRoles,
    activityTypeKey: intent.activityTypeKey,
  };
}

export async function resolveLfgFullGroupWatchByOpaque(
  tx: ActivityTx,
  actor: ActorSubject,
  guildId: string,
  opaqueId: string,
) {
  const userId = requireDiscord(actor);
  const watch = await tx.getLfgFullGroupWatchByOpaqueId(userId, guildId, opaqueId);
  if (watch === null) {
    throw new ActivityError('NOT_FOUND', 'Full-group watch not found');
  }
  return {
    id: watch.id,
    opaqueId: opaqueIdFromUuid(watch.id),
    guildId,
    activityId: watch.activityId,
    characterId: watch.characterId,
    sessionRoles: watch.sessionRoles,
  };
}

export async function suppressLfgMatch(
  tx: ActivityTx,
  actor: ActorSubject,
  input: { activityId: string; intentId?: string },
  now: Date,
): Promise<void> {
  const userId = requireDiscord(actor);
  const activity = await tx.getActivity(input.activityId);
  if (activity === null) {
    throw new ActivityError('NOT_FOUND', 'Activity not found');
  }
  const activityTypeKey =
    activity.typeId === null ? null : await tx.getActivityTypeKeyByTypeId(activity.typeId);
  if (activityTypeKey === null) {
    throw new ActivityError('VALIDATION_FAILED', 'Activity type is not eligible for LFG');
  }
  const ctx = await buildGroupMatchContext(tx, activity, activityTypeKey);

  if (input.intentId !== undefined) {
    const intent = await tx.getLfgIntentById(input.intentId);
    if (intent === null || intent.recipientDiscordUserId !== userId) {
      throw new ActivityError('NOT_FOUND', 'LFG watch not found');
    }
    if (activityTypeKey !== intent.activityTypeKey) {
      throw new ActivityError('VALIDATION_FAILED', 'Activity does not match LFG watch');
    }
    await tx.recordLfgIntentSuppression({
      intentId: input.intentId,
      activityId: input.activityId,
      fingerprint: ctx.fingerprint,
      now,
    });
    return;
  }

  await tx.recordLfgActorMatchSuppression({
    recipientDiscordUserId: userId,
    activityId: input.activityId,
    fingerprint: ctx.fingerprint,
    now,
  });
}

export async function joinLfgActivity(
  tx: ActivityTx,
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
  characterVerify: LfgCharacterVerifyPort,
  now: Date,
): Promise<ParticipationRecord> {
  const discordUserId = requireDiscord(actor);
  if (!isPartyRoleKey(input.partyRoleKey)) {
    throw new ActivityError('VALIDATION_FAILED', 'Invalid party role key');
  }

  const activity = await tx.lockActivity(input.activityId);
  const requestGuildId = input.guildId ?? activity.guildId;
  const targets = await tx.listPublicationTargets(input.activityId);
  const targetGuildIds = targets.length > 0 ? targets.map((t) => t.guildId) : [activity.guildId];
  if (!isGuildPublicationTarget(requestGuildId, targetGuildIds)) {
    throw new ActivityError('FORBIDDEN', 'Guild is not a publication target for this activity');
  }
  if (
    !canViewPrivateActivity({
      activity,
      actor,
      ...(input.memberRoleIds !== undefined ? { memberRoleIds: input.memberRoleIds } : {}),
    })
  ) {
    throw new ActivityError('FORBIDDEN', 'Private activity access denied');
  }
  if (!activity.enrollmentOpen) {
    throw new ActivityError('PRECONDITION_FAILED', 'Enrollment is closed');
  }

  const activityTypeKey =
    activity.typeId === null ? null : await tx.getActivityTypeKeyByTypeId(activity.typeId);
  if (activityTypeKey === null || !LFG_DUNGEON_TYPE_KEYS.has(activityTypeKey)) {
    throw new ActivityError('PRECONDITION_FAILED', 'Activity is not an LFG dungeon event');
  }

  const intent = input.intentId !== undefined ? await tx.getLfgIntentById(input.intentId) : null;
  if (input.intentId !== undefined) {
    if (intent === null || intent.recipientDiscordUserId !== discordUserId) {
      throw new ActivityError('NOT_FOUND', 'LFG watch not found');
    }
    if (
      intent.cancelledAt !== null ||
      intent.fulfilledAt !== null ||
      intent.pausedAt !== null ||
      intent.expiresAt.getTime() <= now.getTime()
    ) {
      throw new ActivityError('PRECONDITION_FAILED', 'LFG watch is not active');
    }
    if (intent.windowEndAt.getTime() <= now.getTime()) {
      throw new ActivityError('PRECONDITION_FAILED', 'LFG watch window has ended');
    }
    if (intent.activityTypeKey !== activityTypeKey) {
      throw new ActivityError('VALIDATION_FAILED', 'LFG watch type mismatch');
    }
    if (intent.guildId !== requestGuildId || intent.organizationId !== activity.organizationId) {
      throw new ActivityError('FORBIDDEN', 'LFG watch scope mismatch');
    }
  }

  const fullGroupWatch =
    input.fullGroupWatchId !== undefined
      ? await tx.getLfgFullGroupWatchById(input.fullGroupWatchId)
      : null;
  if (input.fullGroupWatchId !== undefined) {
    if (fullGroupWatch === null || fullGroupWatch.recipientDiscordUserId !== discordUserId) {
      throw new ActivityError('NOT_FOUND', 'Full-group watch not found');
    }
    if (fullGroupWatch.cancelledAt !== null) {
      throw new ActivityError('PRECONDITION_FAILED', 'Full-group watch is not active');
    }
    if (fullGroupWatch.activityId !== input.activityId) {
      throw new ActivityError('VALIDATION_FAILED', 'Full-group watch activity mismatch');
    }
    if (
      fullGroupWatch.guildId !== requestGuildId ||
      fullGroupWatch.organizationId !== activity.organizationId
    ) {
      throw new ActivityError('FORBIDDEN', 'Full-group watch scope mismatch');
    }
  }

  const characterId =
    intent !== null && intent !== undefined
      ? intent.characterId
      : fullGroupWatch !== null && fullGroupWatch !== undefined
        ? fullGroupWatch.characterId
        : input.characterId;
  if (characterId === undefined) {
    throw new ActivityError('VALIDATION_FAILED', 'characterId is required');
  }

  const verified = await verifyLfgCharacter(characterVerify, {
    discordUserId,
    characterId,
    sessionRoles: intent?.sessionRoles ?? fullGroupWatch?.sessionRoles ?? [input.partyRoleKey],
  });

  if (!verified.sessionRoles.includes(input.partyRoleKey)) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      'Selected party role is not supported by character',
    );
  }

  const ctx = await buildGroupMatchContext(tx, activity, activityTypeKey);
  const seeker = buildSeekerInput(ctx.group, {
    guildId: requestGuildId,
    organizationId: activity.organizationId,
    activityTypeKey,
    classSpecKey: verified.classSpecKey,
    supportedPartyRoles: verified.supportedPartyRoles,
    sessionRoles: verified.sessionRoles,
    windowStartMs: intent?.windowStartAt.getTime() ?? activity.startAt.getTime() - 3_600_000,
    windowEndMs: intent?.windowEndAt.getTime() ?? activity.startAt.getTime() + 3_600_000,
    membershipOk: activity.guildId === requestGuildId,
  });
  const rank = rankLfgMatch(ctx.group, seeker);
  if (!rank.eligible) {
    throw new ActivityError('PRECONDITION_FAILED', 'Group no longer matches your LFG criteria');
  }
  const eligiblePartyRoles = listEligibleJoinRoles(ctx.group, seeker);
  if (!eligiblePartyRoles.includes(input.partyRoleKey)) {
    throw new ActivityError('PRECONDITION_FAILED', 'Selected party role is not needed');
  }
  assertPartyRoleStillOpen(input.partyRoleKey, ctx.needs, ctx.filled);

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

  const participants = await tx.listParticipations(input.activityId);
  const pool = filterParticipationsForMode(participants, activity.participantMode, requestGuildId);
  const alreadyJoined = pool.some(
    (row) =>
      row.discordUserId === discordUserId &&
      row.resignedAt === null &&
      row.removedAt === null &&
      row.waitlistPosition === null,
  );
  if (alreadyJoined) {
    throw new ActivityError('CONFLICT', 'Already participating in this activity');
  }
  const occupied = countOccupiedSlots(pool);
  if (statusDef.occupiesSlot && !hasOpenSeat({ participantLimit, currentOccupied: occupied })) {
    throw new ActivityError(
      'PRECONDITION_FAILED',
      'No open slot remains — refresh matches or enable persistent search',
    );
  }
  const waitlistPosition: number | null = null;

  const participation = await tx.upsertParticipation({
    id: randomUUID(),
    activityId: input.activityId,
    discordUserId,
    v2UserId: actor.v2UserId ?? null,
    statusDefId: input.statusDefId,
    confirmationState: 'confirmed',
    reconfirmDeadline: null,
    waitlistPosition,
    scopeGuildId,
    partyRoleKey: input.partyRoleKey,
  });

  if (intent !== null) {
    await tx.fulfillLfgIntent(intent.id, discordUserId, now);
  }
  if (input.fullGroupWatchId !== undefined) {
    const fulfilled = await tx.fulfillLfgFullGroupWatch(input.fullGroupWatchId, discordUserId, now);
    if (!fulfilled) {
      throw new ActivityError('NOT_FOUND', 'Full-group watch not found');
    }
  }

  return participation;
}

type IntentMatchCandidate = {
  intentId: string;
  recipientDiscordUserId: string;
  score: number;
  reasons: readonly string[];
  fingerprint: string;
  roleNeedSummary: string;
  eligiblePartyRoles: readonly PartyRoleKey[];
  suggestedPartyRole: PartyRoleKey | null;
};

/** Notify waiting intents when a matching group appears (deduped DISCOVERY, coalesced per user). */
export async function notifyLfgIntentsForActivity(
  tx: ActivityTx,
  activity: ActivityRecord,
  activityTypeKey: string,
  authorize: AuthorizePort,
  characterVerify: LfgCharacterVerifyPort,
  now: Date,
): Promise<number> {
  const intents = await tx.listActiveLfgIntents({
    guildId: activity.guildId,
    organizationId: activity.organizationId,
    activityTypeKey,
    now,
  });
  if (intents.length === 0) {
    return 0;
  }

  const ctx = await buildGroupMatchContext(tx, activity, activityTypeKey);
  const intentIds = intents.map((intent) => intent.id);
  const recipientIds = [...new Set(intents.map((intent) => intent.recipientDiscordUserId))];
  const [suppressedIntents, suppressedActors, notifiedRecipients] = await Promise.all([
    tx.listSuppressedLfgIntentIds({
      activityId: activity.id,
      fingerprint: ctx.fingerprint,
      intentIds,
    }),
    tx.listSuppressedLfgActorRecipients({
      activityId: activity.id,
      fingerprint: ctx.fingerprint,
      recipientDiscordUserIds: recipientIds,
    }),
    tx.listLfgNotifiedRecipients({
      activityId: activity.id,
      fingerprint: ctx.fingerprint,
      recipientDiscordUserIds: recipientIds,
    }),
  ]);

  const membershipCache = new Map<string, boolean>();
  const characterCache = new Map<
    string,
    Awaited<ReturnType<typeof verifyLfgCharacter>> | 'invalid'
  >();
  const byUser = new Map<string, IntentMatchCandidate[]>();

  for (const intent of intents) {
    if (suppressedIntents.has(intent.id)) {
      continue;
    }
    if (suppressedActors.has(intent.recipientDiscordUserId)) {
      continue;
    }
    if (notifiedRecipients.has(intent.recipientDiscordUserId)) {
      continue;
    }

    let membershipOk = membershipCache.get(intent.recipientDiscordUserId);
    if (membershipOk === undefined) {
      membershipOk = await resolveMembershipOk(
        authorize,
        activity.guildId,
        intent.recipientDiscordUserId,
      );
      membershipCache.set(intent.recipientDiscordUserId, membershipOk);
    }
    if (!membershipOk) {
      continue;
    }

    const characterCacheKey = `${intent.recipientDiscordUserId}:${intent.characterId}:${intent.sessionRoles.join(',')}`;
    let verified = characterCache.get(characterCacheKey);
    if (verified === undefined) {
      try {
        verified = await verifyLfgCharacter(characterVerify, {
          discordUserId: intent.recipientDiscordUserId,
          characterId: intent.characterId,
          sessionRoles: intent.sessionRoles,
        });
        characterCache.set(characterCacheKey, verified);
      } catch {
        characterCache.set(characterCacheKey, 'invalid');
        continue;
      }
    }
    if (verified === 'invalid') {
      continue;
    }
    const seeker = buildSeekerInput(ctx.group, {
      guildId: activity.guildId,
      organizationId: activity.organizationId,
      activityTypeKey,
      classSpecKey: verified.classSpecKey,
      supportedPartyRoles: verified.supportedPartyRoles,
      sessionRoles: verified.sessionRoles,
      windowStartMs: intent.windowStartAt.getTime(),
      windowEndMs: intent.windowEndAt.getTime(),
      membershipOk: true,
    });
    const rank = rankLfgMatch(ctx.group, seeker);
    if (!rank.eligible) {
      continue;
    }
    if (
      !canViewPrivateActivity({
        activity,
        actor: { discordUserId: intent.recipientDiscordUserId },
      })
    ) {
      continue;
    }

    const eligiblePartyRoles = listEligibleJoinRoles(ctx.group, seeker);
    const suggestedPartyRole = pickDeterministicJoinRole(eligiblePartyRoles);
    const candidate: IntentMatchCandidate = {
      intentId: intent.id,
      recipientDiscordUserId: intent.recipientDiscordUserId,
      score: rank.score,
      reasons: rank.reasons,
      fingerprint: ctx.fingerprint,
      roleNeedSummary: ctx.roleNeedSummary,
      eligiblePartyRoles,
      suggestedPartyRole,
    };
    const existing = byUser.get(intent.recipientDiscordUserId) ?? [];
    existing.push(candidate);
    byUser.set(intent.recipientDiscordUserId, existing);
  }

  let sent = 0;
  for (const [recipientDiscordUserId, candidates] of byUser) {
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]!;
    const additionalCount = candidates.length - 1;
    const matchReason = formatLfgMatchReason(best.reasons);
    const bodyBase = `${matchReason} — ${best.roleNeedSummary}. Termin: ${activity.startAt.toISOString()}.`;
    const body =
      additionalCount > 0
        ? `${bodyBase} (+${additionalCount} ${additionalCount === 1 ? 'inne dopasowanie' : 'inne dopasowania'})`
        : bodyBase;

    const result = await enqueueUserNotification(
      tx,
      {
        guildId: activity.guildId,
        recipientDiscordUserId,
        notificationClass: 'DISCOVERY',
        kind: 'lfg.match',
        title: `Dopasowanie: ${activityTypeKey}`,
        body,
        dedupeKey: `lfg-match:${activity.id}:${recipientDiscordUserId}`,
        activityId: activity.id,
        interestKey: activityTypeKey,
        activityTypeKey,
        deepLink: `v2://activities/${activity.id}`,
        fingerprint: best.fingerprint,
        deliveryActions: {
          template: 'lfg_match',
          activityId: activity.id,
          activityOpaqueId: activity.opaqueId,
          guildId: activity.guildId,
          organizationId: activity.organizationId,
          activityTypeKey,
          fingerprint: best.fingerprint,
          intentId: best.intentId,
          intentOpaqueId: opaqueIdFromUuid(best.intentId),
          ...(best.eligiblePartyRoles.length > 0
            ? { eligiblePartyRoles: [...best.eligiblePartyRoles] }
            : {}),
          ...(best.suggestedPartyRole !== null
            ? { suggestedPartyRole: best.suggestedPartyRole }
            : {}),
        },
      },
      now,
    );
    if (!result.suppressed && result.inboxItemId !== null) {
      for (const candidate of candidates) {
        await tx.recordLfgNotifiedMatch(
          recipientDiscordUserId,
          activity.id,
          candidate.fingerprint,
          now,
        );
      }
      sent += 1;
    }
  }
  return sent;
}

export async function createLfgFullGroupWatch(
  tx: ActivityTx,
  actor: ActorSubject,
  input: {
    guildId: string;
    organizationId: string;
    activityId: string;
    characterId: string;
    sessionRoles: readonly string[];
  },
  characterVerify: LfgCharacterVerifyPort,
): Promise<{ watchId: string }> {
  const userId = requireDiscord(actor);
  const organizationId = await resolveGuildOrganizationId(tx, input.guildId, input.organizationId);
  const verified = await verifyLfgCharacter(characterVerify, {
    discordUserId: userId,
    characterId: input.characterId,
    sessionRoles: input.sessionRoles,
  });
  const activity = await tx.getActivity(input.activityId);
  if (activity === null) {
    throw new ActivityError('NOT_FOUND', 'Activity not found');
  }
  if (activity.guildId !== input.guildId || activity.organizationId !== organizationId) {
    throw new ActivityError('FORBIDDEN', 'Activity scope mismatch');
  }
  const activityTypeKey =
    activity.typeId === null ? null : await tx.getActivityTypeKeyByTypeId(activity.typeId);
  if (activityTypeKey === null || !LFG_DUNGEON_TYPE_KEYS.has(activityTypeKey)) {
    throw new ActivityError('PRECONDITION_FAILED', 'Activity is not an LFG dungeon event');
  }
  const ctx = await buildGroupMatchContext(tx, activity, activityTypeKey);
  if (ctx.group.status !== 'full') {
    throw new ActivityError('PRECONDITION_FAILED', 'Activity is not full');
  }
  const watchId = await tx.insertLfgFullGroupWatch({
    guildId: input.guildId,
    organizationId: input.organizationId,
    recipientDiscordUserId: userId,
    activityId: input.activityId,
    characterId: verified.characterId,
    sessionRoles: verified.sessionRoles,
    classSpecKey: verified.classSpecKey,
  });
  return { watchId };
}

export async function cancelLfgFullGroupWatch(
  tx: ActivityTx,
  actor: ActorSubject,
  watchId: string,
  now: Date,
): Promise<void> {
  const userId = requireDiscord(actor);
  const cancelled = await tx.cancelLfgFullGroupWatch(watchId, userId, now);
  if (!cancelled) {
    throw new ActivityError('NOT_FOUND', 'Full-group watch not found');
  }
}

/** Notify users watching a previously full group when a slot reopens. */
export async function notifyFullGroupWatchesForActivity(
  tx: ActivityTx,
  activity: ActivityRecord,
  activityTypeKey: string,
  authorize: AuthorizePort,
  characterVerify: LfgCharacterVerifyPort,
  now: Date,
): Promise<number> {
  const ctx = await buildGroupMatchContext(tx, activity, activityTypeKey);
  if (
    ctx.group.status === 'full' ||
    ctx.group.status === 'cancelled' ||
    ctx.group.status === 'ended'
  ) {
    return 0;
  }
  const watches = await tx.listLfgFullGroupWatchesForActivity(activity.id);
  if (watches.length === 0) {
    return 0;
  }
  const participants = await tx.listParticipations(activity.id);
  const activeParticipantIds = new Set(
    participants
      .filter(
        (row) => row.resignedAt === null && row.removedAt === null && row.waitlistPosition === null,
      )
      .map((row) => row.discordUserId),
  );

  const watchRecipientIds = [
    ...new Set(
      watches
        .map((watch) => watch.recipientDiscordUserId)
        .filter((recipientId) => !activeParticipantIds.has(recipientId)),
    ),
  ];
  const [suppressedActors, notifiedRecipients] = await Promise.all([
    tx.listSuppressedLfgActorRecipients({
      activityId: activity.id,
      fingerprint: ctx.fingerprint,
      recipientDiscordUserIds: watchRecipientIds,
    }),
    tx.listLfgNotifiedRecipients({
      activityId: activity.id,
      fingerprint: ctx.fingerprint,
      recipientDiscordUserIds: watchRecipientIds,
    }),
  ]);
  const membershipCache = new Map<string, boolean>();
  const characterCache = new Map<
    string,
    Awaited<ReturnType<typeof verifyLfgCharacter>> | 'invalid'
  >();

  let sent = 0;
  for (const watch of watches) {
    if (activeParticipantIds.has(watch.recipientDiscordUserId)) {
      continue;
    }
    if (suppressedActors.has(watch.recipientDiscordUserId)) {
      continue;
    }
    if (notifiedRecipients.has(watch.recipientDiscordUserId)) {
      continue;
    }

    let membershipOk = membershipCache.get(watch.recipientDiscordUserId);
    if (membershipOk === undefined) {
      membershipOk = await resolveMembershipOk(
        authorize,
        activity.guildId,
        watch.recipientDiscordUserId,
      );
      membershipCache.set(watch.recipientDiscordUserId, membershipOk);
    }
    if (!membershipOk) {
      continue;
    }

    const characterCacheKey = `${watch.recipientDiscordUserId}:${watch.characterId}:${watch.sessionRoles.join(',')}`;
    let verified = characterCache.get(characterCacheKey);
    if (verified === undefined) {
      try {
        verified = await verifyLfgCharacter(characterVerify, {
          discordUserId: watch.recipientDiscordUserId,
          characterId: watch.characterId,
          sessionRoles: watch.sessionRoles,
        });
        characterCache.set(characterCacheKey, verified);
      } catch {
        characterCache.set(characterCacheKey, 'invalid');
        continue;
      }
    }
    if (verified === 'invalid') {
      continue;
    }
    const seeker = buildSeekerInput(ctx.group, {
      guildId: activity.guildId,
      organizationId: activity.organizationId,
      activityTypeKey,
      classSpecKey: verified.classSpecKey,
      supportedPartyRoles: verified.supportedPartyRoles,
      sessionRoles: verified.sessionRoles,
      windowStartMs: activity.startAt.getTime() - 3_600_000,
      windowEndMs: activity.startAt.getTime() + 3_600_000,
      membershipOk: true,
    });
    const rank = rankLfgMatch(ctx.group, seeker);
    if (!rank.eligible) {
      continue;
    }
    if (
      !canViewPrivateActivity({
        activity,
        actor: { discordUserId: watch.recipientDiscordUserId },
      })
    ) {
      continue;
    }

    const eligiblePartyRoles = listEligibleJoinRoles(ctx.group, seeker);
    const suggestedPartyRole = pickDeterministicJoinRole(eligiblePartyRoles);
    const matchReason = formatLfgMatchReason(rank.reasons);
    const body = `${matchReason} — ${ctx.roleNeedSummary}. Zwolniło się miejsce: ${activity.startAt.toISOString()}.`;
    const result = await enqueueUserNotification(
      tx,
      {
        guildId: activity.guildId,
        recipientDiscordUserId: watch.recipientDiscordUserId,
        notificationClass: 'DISCOVERY',
        kind: 'lfg.slot_reopened',
        title: `Wolne miejsce: ${activityTypeKey}`,
        body,
        dedupeKey: `lfg-reopen:${activity.id}:${watch.recipientDiscordUserId}`,
        activityId: activity.id,
        interestKey: activityTypeKey,
        activityTypeKey,
        deepLink: `v2://activities/${activity.id}`,
        fingerprint: ctx.fingerprint,
        deliveryActions: {
          template: 'lfg_slot_reopened',
          activityId: activity.id,
          activityOpaqueId: activity.opaqueId,
          guildId: activity.guildId,
          organizationId: activity.organizationId,
          activityTypeKey,
          fingerprint: ctx.fingerprint,
          fullGroupWatchId: watch.id,
          fullGroupWatchOpaqueId: opaqueIdFromUuid(watch.id),
          ...(eligiblePartyRoles.length > 0 ? { eligiblePartyRoles: [...eligiblePartyRoles] } : {}),
          ...(suggestedPartyRole !== null ? { suggestedPartyRole } : {}),
        },
      },
      now,
    );
    if (!result.suppressed && result.inboxItemId !== null) {
      await tx.recordLfgNotifiedMatch(
        watch.recipientDiscordUserId,
        activity.id,
        ctx.fingerprint,
        now,
      );
      sent += 1;
    }
  }
  return sent;
}

/** Run LFG discovery notifications after activity composition or schedule changes. */
export async function triggerLfgMatchingForActivity(
  tx: ActivityTx,
  activity: ActivityRecord,
  authorize: AuthorizePort,
  characterVerify: LfgCharacterVerifyPort,
  now: Date,
): Promise<number> {
  if (activity.typeId === null || activity.cancelledAt !== null) {
    return 0;
  }
  if (activity.status !== 'published' && activity.status !== 'registrations_open') {
    return 0;
  }
  if (!activity.enrollmentOpen) {
    return 0;
  }
  const activityTypeKey = await tx.getActivityTypeKeyByTypeId(activity.typeId);
  if (activityTypeKey === null || !LFG_DUNGEON_TYPE_KEYS.has(activityTypeKey)) {
    return 0;
  }
  const intentSent = await notifyLfgIntentsForActivity(
    tx,
    activity,
    activityTypeKey,
    authorize,
    characterVerify,
    now,
  );
  const reopenSent = await notifyFullGroupWatchesForActivity(
    tx,
    activity,
    activityTypeKey,
    authorize,
    characterVerify,
    now,
  );
  return intentSent + reopenSent;
}
