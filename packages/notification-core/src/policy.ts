export const NOTIFICATION_CLASSES = ['DISCOVERY', 'TRANSACTIONAL', 'SYSTEM_SECURITY'] as const;
export type NotificationClass = (typeof NOTIFICATION_CLASSES)[number];

export const NOTIFICATION_CHANNELS = ['DM', 'INBOX'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_DELIVERY_STATUSES = [
  'pending',
  'delivered',
  'failed',
  'skipped',
  'fallback_inbox',
] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export type DiscoveryMuteKey = {
  readonly interestKey?: string;
  readonly activityTypeKey?: string;
  readonly activityId?: string;
};

export type NotificationPreferenceView = {
  readonly userDiscordId: string;
  readonly guildId: string;
  readonly dmEnabled: boolean;
  readonly mutedInterestKeys: readonly string[];
  readonly mutedActivityTypeKeys: readonly string[];
  readonly mutedActivityIds: readonly string[];
};

/**
 * Discovery mute never suppresses TRANSACTIONAL or SYSTEM_SECURITY.
 */
export function isDeliveryAllowedByPreference(input: {
  readonly notificationClass: NotificationClass;
  readonly preference: NotificationPreferenceView | null;
  readonly muteKey?: DiscoveryMuteKey;
}): boolean {
  if (input.notificationClass !== 'DISCOVERY') {
    return true;
  }
  const pref = input.preference;
  if (pref === null) {
    return true;
  }
  const mute = input.muteKey ?? {};
  if (mute.interestKey !== undefined && pref.mutedInterestKeys.includes(mute.interestKey)) {
    return false;
  }
  if (
    mute.activityTypeKey !== undefined &&
    pref.mutedActivityTypeKeys.includes(mute.activityTypeKey)
  ) {
    return false;
  }
  if (mute.activityId !== undefined && pref.mutedActivityIds.includes(mute.activityId)) {
    return false;
  }
  return true;
}

export function shouldAttemptDm(preference: NotificationPreferenceView | null): boolean {
  return preference?.dmEnabled !== false;
}

/**
 * Meaningful-change gate: identical payload fingerprint within coalescing window
 * should not re-notify.
 */
export function shouldSuppressAsUnchanged(input: {
  readonly previousFingerprint: string | null;
  readonly nextFingerprint: string;
  readonly alreadyNotified: boolean;
}): boolean {
  if (!input.alreadyNotified) {
    return false;
  }
  return input.previousFingerprint === input.nextFingerprint;
}

export function notificationFingerprint(parts: readonly string[]): string {
  return parts.join('|');
}
