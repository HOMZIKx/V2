import { randomUUID } from 'node:crypto';

import { opaqueIdFromUuid } from '../domain/opaque-id.js';
import { OUTBOX_EVENT_TYPES } from '../domain/outbox-events.js';
import { buildEventProjectionPayload } from './event-projection-payload.js';
import type { ActivityRecord, ActivityTx } from './ports/activity.ports.js';

/**
 * Enqueues full Discord event projection payloads (PROJECTION_REQUESTED).
 * Thin outbox bodies are rejected by discord-gateway — always use this helper.
 */
export async function enqueueEventProjection(
  tx: ActivityTx,
  activity: ActivityRecord,
  now: Date,
  options?: { readonly onlyGuildIds?: readonly string[] },
): Promise<number> {
  let targets = await tx.listPublicationTargets(activity.id);
  if (targets.length === 0) {
    const channelId = activity.publicationChannelId ?? '';
    if (channelId.length === 0) {
      return 0;
    }
    targets = [
      {
        id: 'legacy-home',
        activityId: activity.id,
        organizationId: activity.organizationId,
        guildId: activity.guildId,
        channelId,
        participantLimit: activity.participantLimit,
        sortOrder: 0,
      },
    ];
  }

  if (options?.onlyGuildIds !== undefined) {
    const allowed = new Set(options.onlyGuildIds);
    targets = targets.filter((t) => allowed.has(t.guildId));
  }

  const [types, statusDefs, participations] = await Promise.all([
    tx.listActivityTypes(activity.guildId),
    tx.listStatusDefs(activity.guildId),
    tx.listParticipations(activity.id),
  ]);

  let enqueued = 0;
  for (const target of targets) {
    if (target.channelId.trim().length === 0) {
      continue;
    }
    const existing = await tx.getActivityProjectionForGuild(activity.id, target.guildId);
    const opaqueId =
      existing?.opaqueId ??
      (target.guildId === activity.guildId ? activity.opaqueId : opaqueIdFromUuid(randomUUID()));
    const payload = buildEventProjectionPayload({
      activity,
      channelId: target.channelId,
      opaqueEventId: opaqueId,
      messageId: existing?.messageId ?? null,
      types,
      statusDefs,
      participations,
      participantLimit: target.participantLimit ?? activity.participantLimit,
    });
    if (payload === null) {
      continue;
    }

    await tx.upsertActivityProjection({
      activityId: activity.id,
      guildId: target.guildId,
      channelId: target.channelId,
      opaqueId,
      status: 'pending',
      ...(existing?.messageId !== undefined && existing.messageId !== null
        ? { messageId: existing.messageId }
        : {}),
    });
    await tx.insertOutbox({
      eventType: OUTBOX_EVENT_TYPES.PROJECTION_REQUESTED,
      aggregateType: 'activity',
      aggregateId: activity.id,
      aggregateVersion: activity.version,
      payload: { ...payload },
      occurredAt: now,
    });
    enqueued += 1;
  }
  return enqueued;
}
