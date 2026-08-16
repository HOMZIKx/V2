import { ActivityError } from './errors.js';
import { assertValidReferenceStatus, type ParticipationStatusDefLike } from './status-def.js';

export const PARTICIPANT_FIELD_TYPES = [
  'character',
  'class',
  'role',
  'text',
  'select',
  'number',
] as const;

export type ParticipantFieldType = (typeof PARTICIPANT_FIELD_TYPES)[number];

export const MIN_CREATE_HORIZON_DAYS = 1;
export const MAX_CREATE_HORIZON_DAYS = 365;
export const DEFAULT_CREATE_HORIZON_DAYS = 14;

export const MIN_POST_RETENTION_HOURS = 1;
export const MAX_POST_RETENTION_HOURS = 720;
export const DEFAULT_POST_RETENTION_HOURS = 72;

/** Max ping role ids stored in guild admin config. */
export const MAX_PING_ROLE_IDS = 50;

const FORBIDDEN_PING_ROLE_VALUES = new Set(['everyone', 'here', '@everyone', '@here']);

export type AdminReadinessIssueCode =
  | 'ORGANIZER_DEFAULT_MISSING'
  | 'ORGANIZER_DEFAULT_INVALID'
  | 'WAITLIST_PROMOTION_MISSING'
  | 'WAITLIST_PROMOTION_INVALID'
  | 'NO_ENABLED_ACTIVITY_TYPES'
  | 'NO_ACTIVE_STATUS_DEFS'
  | 'HUB_CHANNEL_MISSING'
  | 'NO_ALLOWED_PUBLISH_CHANNELS'
  | 'DISCORD_DEPENDENCY_UNAVAILABLE'
  | 'CHANNEL_MISSING'
  | 'CHANNEL_WRONG_GUILD'
  | 'CHANNEL_UNSUPPORTED'
  | 'BOT_PERMISSION_MISSING';

export interface AdminReadinessIssue {
  readonly code: AdminReadinessIssueCode;
  readonly message: string;
}

export interface AdminReadinessSnapshot {
  readonly organizerDefaultStatusId: string | null;
  readonly waitlistPromotionStatusId: string | null;
  readonly organizerDefaultStatus: ParticipationStatusDefLike | undefined;
  readonly waitlistPromotionStatus: ParticipationStatusDefLike | undefined;
  readonly enabledActivityTypeCount: number;
  readonly activeStatusDefCount: number;
  readonly hubChannelId: string | null;
  readonly allowedPublishChannelCount: number;
}

export function isParticipantFieldType(value: string): value is ParticipantFieldType {
  return (PARTICIPANT_FIELD_TYPES as readonly string[]).includes(value);
}

export function assertParticipantFieldType(value: string): asserts value is ParticipantFieldType {
  if (!isParticipantFieldType(value)) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      `fieldType must be one of: ${PARTICIPANT_FIELD_TYPES.join('|')}`,
    );
  }
}

export function validateOrganizerDefault(def: ParticipationStatusDefLike | undefined): void {
  assertValidReferenceStatus(def, 'organizerDefault');
}

export function validateWaitlistPromotion(def: ParticipationStatusDefLike | undefined): void {
  assertValidReferenceStatus(def, 'waitlistPromotion');
}

export function assertCreateHorizonDays(days: number): void {
  if (!Number.isInteger(days) || days < MIN_CREATE_HORIZON_DAYS || days > MAX_CREATE_HORIZON_DAYS) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      `maxCreateHorizonDays must be an integer between ${MIN_CREATE_HORIZON_DAYS} and ${MAX_CREATE_HORIZON_DAYS}`,
    );
  }
}

export function assertPostRetentionHours(hours: number): void {
  if (
    !Number.isInteger(hours) ||
    hours < MIN_POST_RETENTION_HOURS ||
    hours > MAX_POST_RETENTION_HOURS
  ) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      `postRetentionHoursAfterFinish must be an integer between ${MIN_POST_RETENTION_HOURS} and ${MAX_POST_RETENTION_HOURS}`,
    );
  }
}

export function assertPingRoleIds(roleIds: readonly string[]): void {
  if (roleIds.length > MAX_PING_ROLE_IDS) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      `At most ${MAX_PING_ROLE_IDS} ping role ids may be stored`,
    );
  }
  const seen = new Set<string>();
  for (const roleId of roleIds) {
    const trimmed = roleId.trim();
    if (trimmed.length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'ping role id must not be empty');
    }
    if (FORBIDDEN_PING_ROLE_VALUES.has(trimmed.toLowerCase())) {
      throw new ActivityError(
        'VALIDATION_FAILED',
        '@everyone and @here are forbidden as ping role config values',
      );
    }
    if (seen.has(trimmed)) {
      throw new ActivityError('VALIDATION_FAILED', `Duplicate ping role id: ${trimmed}`);
    }
    seen.add(trimmed);
  }
}

export function assertRemindersJson(value: unknown): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new ActivityError('VALIDATION_FAILED', 'reminders must be a JSON array');
  }
  if (value.length > 20) {
    throw new ActivityError('VALIDATION_FAILED', 'At most 20 reminder entries are allowed');
  }
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ActivityError('VALIDATION_FAILED', 'Each reminder must be an object');
    }
  }
}

export function evaluateAdminReadiness(snapshot: AdminReadinessSnapshot): {
  ready: boolean;
  issues: AdminReadinessIssue[];
} {
  const issues: AdminReadinessIssue[] = [];

  if (snapshot.organizerDefaultStatusId === null) {
    issues.push({
      code: 'ORGANIZER_DEFAULT_MISSING',
      message: 'organizerDefaultStatusId is not configured',
    });
  } else {
    try {
      validateOrganizerDefault(snapshot.organizerDefaultStatus);
    } catch {
      issues.push({
        code: 'ORGANIZER_DEFAULT_INVALID',
        message: 'organizerDefaultStatusId does not satisfy confirmed/active/occupiesSlot rules',
      });
    }
  }

  if (snapshot.waitlistPromotionStatusId === null) {
    issues.push({
      code: 'WAITLIST_PROMOTION_MISSING',
      message: 'waitlistPromotionStatusId is not configured',
    });
  } else {
    try {
      validateWaitlistPromotion(snapshot.waitlistPromotionStatus);
    } catch {
      issues.push({
        code: 'WAITLIST_PROMOTION_INVALID',
        message: 'waitlistPromotionStatusId does not satisfy confirmed/active/occupiesSlot rules',
      });
    }
  }

  if (snapshot.enabledActivityTypeCount < 1) {
    issues.push({
      code: 'NO_ENABLED_ACTIVITY_TYPES',
      message: 'At least one enabled activity type is required',
    });
  }

  if (snapshot.activeStatusDefCount < 1) {
    issues.push({
      code: 'NO_ACTIVE_STATUS_DEFS',
      message: 'At least one active participation status is required',
    });
  }

  if (snapshot.hubChannelId === null || snapshot.hubChannelId.trim().length === 0) {
    issues.push({
      code: 'HUB_CHANNEL_MISSING',
      message: 'hubChannelId is not configured',
    });
  }

  if (snapshot.allowedPublishChannelCount < 1) {
    issues.push({
      code: 'NO_ALLOWED_PUBLISH_CHANNELS',
      message: 'At least one allowed publish channel is required',
    });
  }

  return { ready: issues.length === 0, issues };
}
