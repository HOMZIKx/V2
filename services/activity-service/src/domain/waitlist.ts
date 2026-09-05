import { ActivityError } from './errors.js';

export interface WaitlistEntry {
  readonly id: string;
  readonly waitlistPosition: number;
}

/**
 * FIFO: lowest waitlist_position wins. Caller must hold the activity row lock.
 * Returns the next entry to promote, or undefined if empty.
 */
export function nextWaitlistPromotion(
  entries: readonly WaitlistEntry[],
): WaitlistEntry | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  return [...entries].sort((a, b) => a.waitlistPosition - b.waitlistPosition)[0];
}

export function assignWaitlistPosition(existingPositions: readonly number[]): number {
  if (existingPositions.length === 0) {
    return 1;
  }
  return Math.max(...existingPositions) + 1;
}

export function assertWaitlistPromotionTarget(input: {
  readonly statusOccupiesSlot: boolean;
  readonly statusBehavior: string;
  readonly statusActive: boolean;
}): void {
  if (!input.statusActive || !input.statusOccupiesSlot || input.statusBehavior !== 'confirmed') {
    throw new ActivityError(
      'CONFIG_INVALID',
      'waitlistPromotionStatusId must be active confirmed occupiesSlot status',
    );
  }
}
