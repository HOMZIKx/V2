import { ActivityError } from './errors.js';

export interface SlotOccupant {
  readonly occupiesSlot: boolean;
  readonly confirmationState: 'confirmed' | 'requires_reconfirmation';
  readonly waitlistPosition: number | null;
  readonly resignedAt: Date | null;
  readonly removedAt: Date | null;
}

/** Active seat holders: occupies slot, not resigned/removed, not on waitlist. */
export function countOccupiedSlots(participants: readonly SlotOccupant[]): number {
  let count = 0;
  for (const p of participants) {
    if (p.resignedAt !== null || p.removedAt !== null) {
      continue;
    }
    if (p.waitlistPosition !== null) {
      continue;
    }
    if (p.occupiesSlot) {
      count += 1;
    }
  }
  return count;
}

export function assertCanTakeSlot(input: {
  readonly participantLimit: number | null;
  readonly currentOccupied: number;
  readonly wantsSlot: boolean;
}): void {
  if (!input.wantsSlot) {
    return;
  }
  if (input.participantLimit === null) {
    return;
  }
  if (input.currentOccupied >= input.participantLimit) {
    throw new ActivityError('CAPACITY_EXCEEDED', 'Activity participant limit reached');
  }
}

export function hasOpenSeat(input: {
  readonly participantLimit: number | null;
  readonly currentOccupied: number;
}): boolean {
  if (input.participantLimit === null) {
    return true;
  }
  return input.currentOccupied < input.participantLimit;
}
