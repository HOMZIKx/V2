import { ActivityError } from './errors.js';

export const ACTIVITY_STATUSES = [
  'draft',
  'published',
  'registrations_open',
  'registrations_closed',
  'in_progress',
  'completed',
  'cancelled',
  'deleted',
] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Statuses that count toward the max-4 active-own limit. */
export const ACTIVE_OWN_STATUSES: readonly ActivityStatus[] = [
  'published',
  'registrations_open',
  'registrations_closed',
  'in_progress',
];

const TRANSITIONS: ReadonlyMap<ActivityStatus, ReadonlySet<ActivityStatus>> = new Map([
  ['draft', new Set(['published', 'deleted'])],
  ['published', new Set(['registrations_open', 'cancelled', 'deleted'])],
  [
    'registrations_open',
    new Set(['registrations_closed', 'in_progress', 'cancelled', 'completed', 'deleted']),
  ],
  [
    'registrations_closed',
    new Set(['registrations_open', 'in_progress', 'cancelled', 'completed', 'deleted']),
  ],
  ['in_progress', new Set(['completed', 'cancelled'])],
  ['completed', new Set()],
  ['cancelled', new Set()],
  ['deleted', new Set()],
]);

export function assertTransition(from: ActivityStatus, to: ActivityStatus): void {
  const allowed = TRANSITIONS.get(from);
  if (allowed === undefined || !allowed.has(to)) {
    throw new ActivityError(
      'PRECONDITION_FAILED',
      `Cannot transition activity from ${from} to ${to}`,
    );
  }
}

export function canPermanentlyDelete(input: {
  readonly status: ActivityStatus;
  readonly startAt: Date;
  readonly now: Date;
  readonly participantCount: number;
}): boolean {
  if (input.status === 'deleted' || input.status === 'cancelled' || input.status === 'completed') {
    return false;
  }
  if (input.participantCount > 0) {
    return false;
  }
  return input.now.getTime() < input.startAt.getTime();
}

/** Auto-finish eligibility: end_at, or start_at + 2h when end is null. */
export function scheduledFinishAt(startAt: Date, endAt: Date | null): Date {
  if (endAt !== null) {
    return endAt;
  }
  return new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
}

export function isAutoFinishDue(input: {
  readonly status: ActivityStatus;
  readonly scheduledFinishAt: Date;
  readonly now: Date;
}): boolean {
  if (
    input.status !== 'in_progress' &&
    input.status !== 'registrations_open' &&
    input.status !== 'registrations_closed' &&
    input.status !== 'published'
  ) {
    return false;
  }
  return input.now.getTime() >= input.scheduledFinishAt.getTime();
}
