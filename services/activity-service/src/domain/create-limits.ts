import { ActivityError } from './errors.js';
import type { ActivityStatus } from './lifecycle.js';
import { ACTIVE_OWN_STATUSES } from './lifecycle.js';

export const DEFAULT_MAX_ACTIVE_PER_CREATOR = 4;
export const ORDINARY_HORIZON_MS = 14 * 24 * 60 * 60 * 1000;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function isActiveOwnStatus(status: ActivityStatus): boolean {
  return (ACTIVE_OWN_STATUSES as readonly string[]).includes(status);
}

export function assertCreateLimit(input: {
  readonly activeOwnCount: number;
  readonly maxActivePerCreator: number;
}): void {
  if (input.activeOwnCount >= input.maxActivePerCreator) {
    throw new ActivityError(
      'CREATE_LIMIT_EXCEEDED',
      `Creator already has ${input.activeOwnCount} active activities (max ${input.maxActivePerCreator})`,
    );
  }
}

export function assertStartHorizon(input: {
  readonly startAt: Date;
  readonly now: Date;
  readonly allowExtendedHorizon: boolean;
}): void {
  if (input.allowExtendedHorizon) {
    if (input.startAt.getTime() < input.now.getTime()) {
      throw new ActivityError('VALIDATION_FAILED', 'start_at must be in the future');
    }
    return;
  }
  const max = input.now.getTime() + ORDINARY_HORIZON_MS;
  if (input.startAt.getTime() > max) {
    throw new ActivityError(
      'HORIZON_EXCEEDED',
      'Ordinary members may only schedule activities within 14 days',
    );
  }
  if (input.startAt.getTime() < input.now.getTime()) {
    throw new ActivityError('VALIDATION_FAILED', 'start_at must be in the future');
  }
}

export function draftExpiresAt(now: Date): Date {
  return new Date(now.getTime() + DRAFT_TTL_MS);
}

export function isDraftExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
