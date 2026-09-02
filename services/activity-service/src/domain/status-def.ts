import { ActivityError } from './errors.js';

export const STATUS_BEHAVIORS = ['confirmed', 'tentative', 'declined', 'custom'] as const;
export type StatusBehavior = (typeof STATUS_BEHAVIORS)[number];

export interface ParticipationStatusDefLike {
  readonly id: string;
  readonly active: boolean;
  readonly selectableByMember: boolean;
  readonly occupiesSlot: boolean;
  readonly behavior: StatusBehavior;
}

/**
 * organizerDefaultStatusId and waitlistPromotionStatusId must point at a status
 * that is active + selectableByMember + occupiesSlot + behavior=confirmed.
 */
export function assertValidReferenceStatus(
  def: ParticipationStatusDefLike | undefined,
  role: 'organizerDefault' | 'waitlistPromotion',
): asserts def is ParticipationStatusDefLike {
  if (def === undefined) {
    throw new ActivityError('VALIDATION_FAILED', `${role} status definition is missing`);
  }
  if (!def.active) {
    throw new ActivityError('VALIDATION_FAILED', `${role} status must be active`);
  }
  if (!def.selectableByMember) {
    throw new ActivityError('VALIDATION_FAILED', `${role} status must be selectableByMember`);
  }
  if (!def.occupiesSlot) {
    throw new ActivityError('VALIDATION_FAILED', `${role} status must occupy a slot`);
  }
  if (def.behavior !== 'confirmed') {
    throw new ActivityError('VALIDATION_FAILED', `${role} status must have behavior=confirmed`);
  }
}

export const DEFAULT_STATUS_SEED: readonly {
  readonly key: string;
  readonly label: string;
  readonly occupiesSlot: boolean;
  readonly behavior: StatusBehavior;
  readonly selectableByMember: boolean;
  readonly sortOrder: number;
}[] = [
  {
    key: 'confirmed',
    label: 'Będę',
    occupiesSlot: true,
    behavior: 'confirmed',
    selectableByMember: true,
    sortOrder: 10,
  },
  {
    key: 'tentative',
    label: 'Może będę',
    occupiesSlot: false,
    behavior: 'tentative',
    selectableByMember: true,
    sortOrder: 20,
  },
  {
    key: 'declined',
    label: 'Nie będę',
    occupiesSlot: false,
    behavior: 'declined',
    selectableByMember: true,
    sortOrder: 30,
  },
];
