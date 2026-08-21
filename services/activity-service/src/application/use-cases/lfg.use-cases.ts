import { isPartyRoleKey, rankLfgMatch, type LfgGroupMatchInput } from '@v2/hub-core';

import { ActivityError } from '../../domain/errors.js';
import type { ActivityRecord, ActivityTx, ActorSubject } from '../ports/activity.ports.js';
import { enqueueUserNotification } from './notification.use-cases.js';

function requireDiscord(actor: ActorSubject): string {
  if (actor.discordUserId === undefined || actor.discordUserId.trim().length === 0) {
    throw new ActivityError('UNAUTHENTICATED', 'Discord actor required');
  }
  return actor.discordUserId;
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
};

export async function searchLfgMatches(
  tx: ActivityTx,
  actor: ActorSubject,
  input: LfgSearchInput,
): Promise<{
  matches: readonly {
    activityId: string;
    opaqueId: string;
    score: number;
    reasons: readonly string[];
  }[];
}> {
  requireDiscord(actor);
  const supported = input.characterSupportedRoles.filter(isPartyRoleKey);
  const session = input.sessionRoles.filter(isPartyRoleKey);
  const activities = await tx.listOpenActivitiesForLfg({
    guildId: input.guildId,
    activityTypeKey: input.activityTypeKey,
  });

  const matches: Array<{
    activityId: string;
    opaqueId: string;
    score: number;
    reasons: readonly string[];
  }> = [];

  for (const activity of activities) {
    const needs = await tx.listActivityRoleRequirements(activity.id);
    const filled = await tx.countParticipationsByPartyRole(activity.id);
    const occupied = await tx.countOccupiedParticipations(activity.id);
    const group: LfgGroupMatchInput = {
      activityTypeKey: input.activityTypeKey,
      guildId: activity.guildId,
      organizationId: activity.organizationId,
      capacity: activity.participantLimit ?? 8,
      occupied,
      status:
        activity.status === 'cancelled'
          ? 'cancelled'
          : activity.status === 'completed'
            ? 'ended'
            : occupied >= (activity.participantLimit ?? 8)
              ? 'full'
              : 'open',
      startAtMs: activity.startAt.getTime(),
      roleNeeds: needs,
      filledByRole: filled,
    };
    const rank = rankLfgMatch(group, {
      guildId: input.guildId,
      organizationId: input.organizationId,
      activityTypeKey: input.activityTypeKey,
      characterClassSpecKey: input.characterClassSpecKey,
      characterSupportedRoles: supported,
      sessionRoles: session,
      windowStartMs: input.windowStartAt.getTime(),
      windowEndMs: input.windowEndAt.getTime(),
      membershipOk: true,
    });
    if (rank.eligible) {
      matches.push({
        activityId: activity.id,
        opaqueId: activity.opaqueId,
        score: rank.score,
        reasons: rank.reasons,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return { matches };
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
    ttlHours?: number;
    classSpecKey?: string;
  },
  now: Date,
): Promise<{ intentId: string }> {
  const userId = requireDiscord(actor);
  const roles = input.sessionRoles.filter(isPartyRoleKey);
  if (roles.length === 0) {
    throw new ActivityError('VALIDATION_FAILED', 'At least one session party role is required');
  }
  const ttlHours = input.ttlHours ?? 6;
  const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
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
  await tx.cancelLfgIntent(intentId, userId, now);
}

export async function listMyLfgIntents(tx: ActivityTx, actor: ActorSubject, guildId: string) {
  const userId = requireDiscord(actor);
  return tx.listLfgIntentsForUser(guildId, userId);
}

/** Notify waiting intents when a matching group appears (deduped DISCOVERY). */
export async function notifyLfgIntentsForActivity(
  tx: ActivityTx,
  activity: ActivityRecord,
  activityTypeKey: string,
  now: Date,
): Promise<number> {
  const intents = await tx.listActiveLfgIntents({
    guildId: activity.guildId,
    activityTypeKey,
    now,
  });
  let sent = 0;
  for (const intent of intents) {
    const fingerprint = `${activity.id}|${activity.version}|${activity.startAt.toISOString()}`;
    const already = await tx.hasLfgNotifiedMatch(
      intent.recipientDiscordUserId,
      activity.id,
      fingerprint,
    );
    if (already) {
      continue;
    }
    const result = await enqueueUserNotification(
      tx,
      {
        guildId: activity.guildId,
        recipientDiscordUserId: intent.recipientDiscordUserId,
        notificationClass: 'DISCOVERY',
        kind: 'lfg.match',
        title: `Dopasowanie: ${activityTypeKey}`,
        body: `Znaleziono ekipę (${activity.startAt.toISOString()}).`,
        dedupeKey: `lfg-match:${activity.id}:${intent.id}`,
        activityId: activity.id,
        interestKey: activityTypeKey,
        deepLink: `v2://activities/${activity.id}`,
        fingerprint,
      },
      now,
    );
    if (result.created) {
      await tx.recordLfgNotifiedMatch(intent.recipientDiscordUserId, activity.id, fingerprint, now);
      sent += 1;
    }
  }
  return sent;
}
