import { ActivityError } from './errors.js';

const MIN_RECONFIRM_MS = 15 * 60 * 1000;

/**
 * Deadline defaults to activity start. Organizer may shorten, but not earlier
 * than now+15m unless start is sooner — then start wins.
 */
export function resolveReconfirmDeadline(input: {
  readonly now: Date;
  readonly startAt: Date;
  readonly requestedDeadline?: Date | null;
}): Date {
  const startMs = input.startAt.getTime();
  const minMs = input.now.getTime() + MIN_RECONFIRM_MS;
  const earliestAllowed = Math.min(startMs, Math.max(minMs, input.now.getTime()));

  if (input.requestedDeadline === undefined || input.requestedDeadline === null) {
    return input.startAt;
  }

  const requested = input.requestedDeadline.getTime();
  if (requested > startMs) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      'Reconfirm deadline cannot be after activity start',
    );
  }

  // If start is sooner than 15 minutes, allow deadline = start.
  if (startMs <= minMs) {
    if (requested > startMs) {
      throw new ActivityError('VALIDATION_FAILED', 'Reconfirm deadline cannot be after start');
    }
    return input.requestedDeadline;
  }

  if (requested < earliestAllowed && requested < minMs) {
    throw new ActivityError(
      'VALIDATION_FAILED',
      'Reconfirm deadline must be at least 15 minutes from now unless start is sooner',
    );
  }

  return input.requestedDeadline;
}

export function isReconfirmExpired(input: {
  readonly confirmationState: 'confirmed' | 'requires_reconfirmation';
  readonly reconfirmDeadline: Date | null;
  readonly now: Date;
}): boolean {
  if (input.confirmationState !== 'requires_reconfirmation') {
    return false;
  }
  if (input.reconfirmDeadline === null) {
    return false;
  }
  return input.now.getTime() >= input.reconfirmDeadline.getTime();
}
