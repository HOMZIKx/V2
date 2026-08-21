import {
  EnqueueNotificationSchema,
  isDeliveryAllowedByPreference,
  notificationFingerprint,
  shouldAttemptDm,
  shouldSuppressAsUnchanged,
  type EnqueueNotificationInput,
  type NotificationPreferenceView,
} from '@v2/notification-core';

import { ActivityError } from '../../domain/errors.js';
import { OUTBOX_EVENT_TYPES } from '../../domain/outbox-events.js';
import type { ActivityTx } from '../ports/activity.ports.js';

export async function getOrCreateNotificationPreference(
  tx: ActivityTx,
  guildId: string,
  recipientDiscordUserId: string,
): Promise<NotificationPreferenceView> {
  const existing = await tx.getNotificationPreference(guildId, recipientDiscordUserId);
  if (existing !== null) {
    return existing;
  }
  return {
    userDiscordId: recipientDiscordUserId,
    guildId,
    dmEnabled: true,
    mutedInterestKeys: [],
    mutedActivityTypeKeys: [],
    mutedActivityIds: [],
  };
}

/**
 * Enqueue durable Inbox item + optional DM delivery outbox, respecting class/mute policy.
 */
export async function enqueueUserNotification(
  tx: ActivityTx,
  raw: EnqueueNotificationInput,
  now: Date,
): Promise<{ created: boolean; suppressed: boolean; inboxItemId: string | null }> {
  const input = EnqueueNotificationSchema.parse(raw);
  const preference = await getOrCreateNotificationPreference(
    tx,
    input.guildId,
    input.recipientDiscordUserId,
  );

  const allowed = isDeliveryAllowedByPreference({
    notificationClass: input.notificationClass,
    preference,
    muteKey: {
      ...(input.interestKey !== undefined ? { interestKey: input.interestKey } : {}),
      ...(input.activityTypeKey !== undefined ? { activityTypeKey: input.activityTypeKey } : {}),
      ...(input.activityId !== undefined ? { activityId: input.activityId } : {}),
    },
  });
  if (!allowed) {
    return { created: false, suppressed: true, inboxItemId: null };
  }

  const fingerprint =
    input.fingerprint ??
    notificationFingerprint([
      input.kind,
      input.title,
      input.body,
      input.deepLink ?? '',
      input.activityId ?? '',
    ]);

  const memory = await tx.getNotificationDedupeMemory(
    input.recipientDiscordUserId,
    input.dedupeKey,
  );
  if (
    shouldSuppressAsUnchanged({
      previousFingerprint: memory?.fingerprint ?? null,
      nextFingerprint: fingerprint,
      alreadyNotified: memory !== null,
    })
  ) {
    return { created: false, suppressed: true, inboxItemId: null };
  }

  const enqueued = await tx.enqueueInbox({
    guildId: input.guildId,
    recipientDiscordUserId: input.recipientDiscordUserId,
    kind: input.kind,
    notificationClass: input.notificationClass,
    title: input.title,
    body: input.body,
    deepLink: input.deepLink ?? null,
    fingerprint,
    interestKey: input.interestKey ?? null,
    activityId: input.activityId ?? null,
    payload: {
      title: input.title,
      body: input.body,
      deepLink: input.deepLink ?? null,
      notificationClass: input.notificationClass,
    },
    dedupeKey: input.dedupeKey,
  });

  await tx.recordNotificationDeliveryAttempt({
    inboxItemId: enqueued.item.id,
    channel: 'INBOX',
    status: 'delivered',
    attemptNumber: 1,
  });

  await tx.upsertNotificationDedupeMemory({
    recipientDiscordUserId: input.recipientDiscordUserId,
    dedupeKey: input.dedupeKey,
    fingerprint,
    lastNotifiedAt: now,
  });

  if (enqueued.created && shouldAttemptDm(preference)) {
    await tx.insertOutbox({
      eventType: OUTBOX_EVENT_TYPES.NOTIFICATION_DELIVER,
      aggregateType: 'notification',
      aggregateId: enqueued.item.id,
      aggregateVersion: 1,
      payload: {
        inboxItemId: enqueued.item.id,
        guildId: input.guildId,
        recipientDiscordUserId: input.recipientDiscordUserId,
        title: input.title,
        body: input.body,
        deepLink: input.deepLink ?? null,
        notificationClass: input.notificationClass,
        kind: input.kind,
      },
      occurredAt: now,
    });
  }

  return { created: enqueued.created, suppressed: false, inboxItemId: enqueued.item.id };
}

export async function updateNotificationPreference(
  tx: ActivityTx,
  input: {
    guildId: string;
    recipientDiscordUserId: string;
    dmEnabled?: boolean;
    mutedInterestKeys?: readonly string[];
    mutedActivityTypeKeys?: readonly string[];
    mutedActivityIds?: readonly string[];
  },
): Promise<NotificationPreferenceView> {
  if (input.recipientDiscordUserId.trim().length === 0) {
    throw new ActivityError('VALIDATION_FAILED', 'recipientDiscordUserId required');
  }
  return tx.upsertNotificationPreference({
    guildId: input.guildId,
    recipientDiscordUserId: input.recipientDiscordUserId,
    dmEnabled: input.dmEnabled,
    mutedInterestKeys: input.mutedInterestKeys,
    mutedActivityTypeKeys: input.mutedActivityTypeKeys,
    mutedActivityIds: input.mutedActivityIds,
  });
}
