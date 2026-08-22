import { randomUUID } from 'node:crypto';

import {
  buildLfgMatchFingerprint,
  deriveIntentExpiresAt,
  formatLfgMatchReason,
  formatLfgRoleNeedSummary,
  isPartyRoleKey,
  rankLfgMatch,
  type LfgGroupMatchInput,
  type PartyRoleKey,
} from '@v2/hub-core';

import { countOccupiedSlots, hasOpenSeat } from '../../domain/capacity.js';
import { ActivityError } from '../../domain/errors.js';
import {
  filterParticipationsForMode,
  isGuildPublicationTarget,
  resolveParticipationScopeGuildId,
} from '../../domain/participant-mode.js';
import type {
  ActivityRecord,
  ActivityTx,
  ActorSubject,
  ParticipationRecord,
} from '../ports/activity.ports.js';
import { canViewPrivateActivity } from './activity-p46.helpers.js';
import { enqueueUserNotification } from './notification.use-cases.js';

const LFG_DUNGEON_TYPE_KEYS = new Set(['azrael', 'smok']);
const SIMILAR_GROUP_WINDOW_MS = 2 * 3_600_000;
const LFG_SEARCH_RESULT_LIMIT = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function assertValidCharacterId(characterId: string): void {
  if (!UUID_RE.test(characterId)) {
    throw new ActivityError('VALIDATION_FAILED', 'Invalid character id');
  }
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

async function buildGroupMatchContext(
  tx: ActivityTx,
  activity: ActivityRecord,
  activityTypeKey: string,
): Promise<{
  needs: LfgGroupMatchInput['roleNeeds'];
  filled: Readonly<Partial<Record<PartyRoleKey, number>>>;
  occupied: number;
  capacity: number;
  group: LfgGroupMatchInput;
  fingerprint: string;
  roleNeedSummary: string;
}> {
  const needs = await tx.listActivityRoleRequirements(activity.id);
  const filled = await tx.countParticipationsByPartyRole(activity.id);
  const occupied = await tx.countOccupiedParticipations(activity.id);
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

export type LfgSearchInput = {
  readonly guildId: string;
  readonly organizationId: string;
  readonly activityTypeKey: string;
  readonly characterClassSpecKey: string;
  readonly characterSupportedRoles: readonly string[];
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
};

export async function searchLfgMatches(
  tx: ActivityTx,
  actor: ActorSubject,
  input: LfgSearchInput,
): Promise<{ matches: readonly LfgSearchMatch[] }> {
  requireDiscord(actor);
  assertValidWindow(input.windowStartAt, input.windowEndAt);
  const supported = input.characterSupportedRoles.filter(isPartyRoleKey);
  const session = input.sessionRoles.filter(isPartyRoleKey);
  if (supported.length === 0 || session.length === 0) {
    throw new ActivityError('VALIDATION_FAILED', 'At least one valid party role is required');
  }
  const activities = await tx.listOpenActivitiesForLfg({
    guildId: input.guildId,
    organizationId: input.organizationId,
    activityTypeKey: input.activityTypeKey,
  });

  const ranked: Array<LfgSearchMatch & { score: number }> = [];

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
    const ctx = await buildGroupMatchContext(tx, activity, input.activityTypeKey);
    const rank = rankLfgMatch(ctx.group, {
      guildId: input.guildId,
      organizationId: input.organizationId,
      activityTypeKey: input.activityTypeKey,
      characterClassSpecKey: input.characterClassSpecKey,
      characterSupportedRoles: supported,
      sessionRoles: session,
      windowStartMs: input.windowStartAt.getTime(),
      windowEndMs: input.windowEndAt.getTime(),
      membershipOk: activity.guildId === input.guildId,
    });
    if (rank.eligible) {
      ranked.push({
        activityId: activity.id,
        opaqueId: activity.opaqueId,
        occupancy: { occupied: ctx.occupied, capacity: ctx.capacity },
        roleNeedSummary: ctx.roleNeedSummary,
        matchReason: formatLfgMatchReason(rank.reasons),
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
    classSpecKey?: string;
  },
  now: Date,
): Promise<{ intentId: string }> {
  const userId = requireDiscord(actor);
  assertValidWindow(input.windowStartAt, input.windowEndAt);
  assertValidCharacterId(input.characterId);
  const roles = input.sessionRoles.filter(isPartyRoleKey);
  if (roles.length === 0) {
    throw new ActivityError('VALIDATION_FAILED', 'At least one session party role is required');
  }
  const overlapping = await tx.hasOverlappingLfgIntent({
    recipientDiscordUserId: userId,
    characterId: input.characterId,
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
    organizationId: input.organizationId,
    recipientDiscordUserId: userId,
    characterId: input.characterId,
    activityTypeKey: input.activityTypeKey,
    sessionRoles: roles,
    windowStartAt: input.windowStartAt,
    windowEndAt: input.windowEndAt,
    expiresAt,
    classSpecKey: input.classSpecKey ?? null,
  });
  return { intentId };
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
    characterClassSpecKey?: string;
    characterSupportedRoles?: readonly string[];
    sessionRoles?: readonly string[];
    memberRoleIds?: readonly string[];
  },
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
    if (intent.activityTypeKey !== activityTypeKey) {
      throw new ActivityError('VALIDATION_FAILED', 'LFG watch type mismatch');
    }
    if (intent.guildId !== requestGuildId || intent.organizationId !== activity.organizationId) {
      throw new ActivityError('FORBIDDEN', 'LFG watch scope mismatch');
    }
    assertValidCharacterId(intent.characterId);
  }

  const supported = (
    input.characterSupportedRoles ??
    intent?.sessionRoles ?? [input.partyRoleKey]
  ).filter(isPartyRoleKey);
  const session = (input.sessionRoles ?? intent?.sessionRoles ?? [input.partyRoleKey]).filter(
    isPartyRoleKey,
  );
  const classSpecKey = input.characterClassSpecKey ?? intent?.classSpecKey ?? 'unknown';

  const ctx = await buildGroupMatchContext(tx, activity, activityTypeKey);
  const rank = rankLfgMatch(ctx.group, {
    guildId: requestGuildId,
    organizationId: activity.organizationId,
    activityTypeKey,
    characterClassSpecKey: classSpecKey,
    characterSupportedRoles: supported,
    sessionRoles: session,
    windowStartMs: intent?.windowStartAt.getTime() ?? activity.startAt.getTime() - 3_600_000,
    windowEndMs: intent?.windowEndAt.getTime() ?? activity.startAt.getTime() + 3_600_000,
    membershipOk: activity.guildId === requestGuildId,
  });
  if (!rank.eligible) {
    throw new ActivityError('PRECONDITION_FAILED', 'Group no longer matches your LFG criteria');
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

  return participation;
}

type IntentMatchCandidate = {
  intentId: string;
  recipientDiscordUserId: string;
  score: number;
  reasons: readonly string[];
  fingerprint: string;
  roleNeedSummary: string;
};

/** Notify waiting intents when a matching group appears (deduped DISCOVERY, coalesced per user). */
export async function notifyLfgIntentsForActivity(
  tx: ActivityTx,
  activity: ActivityRecord,
  activityTypeKey: string,
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
  const byUser = new Map<string, IntentMatchCandidate[]>();

  for (const intent of intents) {
    const supported = intent.sessionRoles.filter(isPartyRoleKey);
    if (supported.length === 0) {
      continue;
    }
    const rank = rankLfgMatch(ctx.group, {
      guildId: activity.guildId,
      organizationId: activity.organizationId,
      activityTypeKey,
      characterClassSpecKey: intent.classSpecKey ?? 'unknown',
      characterSupportedRoles: supported,
      sessionRoles: supported,
      windowStartMs: intent.windowStartAt.getTime(),
      windowEndMs: intent.windowEndAt.getTime(),
      membershipOk: true,
    });
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
    if (await tx.isLfgIntentSuppressed(intent.id, activity.id, ctx.fingerprint)) {
      continue;
    }
    if (
      await tx.isLfgActorMatchSuppressed(
        intent.recipientDiscordUserId,
        activity.id,
        ctx.fingerprint,
      )
    ) {
      continue;
    }
    const already = await tx.hasLfgNotifiedMatch(
      intent.recipientDiscordUserId,
      activity.id,
      ctx.fingerprint,
    );
    if (already) {
      continue;
    }

    const candidate: IntentMatchCandidate = {
      intentId: intent.id,
      recipientDiscordUserId: intent.recipientDiscordUserId,
      score: rank.score,
      reasons: rank.reasons,
      fingerprint: ctx.fingerprint,
      roleNeedSummary: ctx.roleNeedSummary,
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
    classSpecKey?: string;
  },
): Promise<{ watchId: string }> {
  const userId = requireDiscord(actor);
  assertValidCharacterId(input.characterId);
  const roles = input.sessionRoles.filter(isPartyRoleKey);
  if (roles.length === 0) {
    throw new ActivityError('VALIDATION_FAILED', 'At least one session party role is required');
  }
  const activity = await tx.getActivity(input.activityId);
  if (activity === null) {
    throw new ActivityError('NOT_FOUND', 'Activity not found');
  }
  if (activity.guildId !== input.guildId || activity.organizationId !== input.organizationId) {
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
    characterId: input.characterId,
    sessionRoles: roles,
    classSpecKey: input.classSpecKey ?? null,
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

  let sent = 0;
  for (const watch of watches) {
    const supported = watch.sessionRoles.filter(isPartyRoleKey);
    if (supported.length === 0) {
      continue;
    }
    const rank = rankLfgMatch(ctx.group, {
      guildId: activity.guildId,
      organizationId: activity.organizationId,
      activityTypeKey,
      characterClassSpecKey: watch.classSpecKey ?? 'unknown',
      characterSupportedRoles: supported,
      sessionRoles: supported,
      windowStartMs: activity.startAt.getTime() - 3_600_000,
      windowEndMs: activity.startAt.getTime() + 3_600_000,
      membershipOk: true,
    });
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
    if (
      await tx.isLfgActorMatchSuppressed(watch.recipientDiscordUserId, activity.id, ctx.fingerprint)
    ) {
      continue;
    }
    if (await tx.hasLfgNotifiedMatch(watch.recipientDiscordUserId, activity.id, ctx.fingerprint)) {
      continue;
    }

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
  const intentSent = await notifyLfgIntentsForActivity(tx, activity, activityTypeKey, now);
  const reopenSent = await notifyFullGroupWatchesForActivity(tx, activity, activityTypeKey, now);
  return intentSent + reopenSent;
}
