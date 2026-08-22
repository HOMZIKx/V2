/**
 * Reservation conflict detection — PROTOTYPE / FOUNDATION WIP (Stage 6).
 * RESERVATIONS_OWNER_DISCOVERY_REQUIRED — do not expand product semantics.
 * See docs/ai/OWNER_DISCOVERY_GAPS.md.
 */

export type ReservationInterval = {
  readonly startsAtMs: number;
  readonly endsAtMs: number;
};

export function intervalsOverlap(a: ReservationInterval, b: ReservationInterval): boolean {
  return a.startsAtMs < b.endsAtMs && b.startsAtMs < a.endsAtMs;
}

export function assertNoDoubleBooking(input: {
  readonly candidate: ReservationInterval;
  readonly existing: readonly ReservationInterval[];
}): { ok: true } | { ok: false; reason: 'conflict' } {
  for (const row of input.existing) {
    if (intervalsOverlap(input.candidate, row)) {
      return { ok: false, reason: 'conflict' };
    }
  }
  return { ok: true };
}
