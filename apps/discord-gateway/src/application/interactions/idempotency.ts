const recentInteractionIds = new Map<string, number>();
const WINDOW_MS = 15_000;
const MAX_ENTRIES = 10_000;
const SWEEP_INTERVAL_MS = 5_000;
let lastSweepAt = 0;

function sweepExpired(now: number): void {
  const expiresBefore = now - WINDOW_MS;
  for (const [id, timestamp] of recentInteractionIds) {
    if (timestamp < expiresBefore) {
      recentInteractionIds.delete(id);
    }
  }
}

export function claimInteractionId(interactionId: string, now = Date.now()): boolean {
  if (now - lastSweepAt >= SWEEP_INTERVAL_MS || recentInteractionIds.size >= MAX_ENTRIES) {
    sweepExpired(now);
    lastSweepAt = now;
  }

  if (recentInteractionIds.has(interactionId)) {
    return false;
  }

  if (recentInteractionIds.size >= MAX_ENTRIES) {
    const oldest = recentInteractionIds.keys().next().value;
    if (oldest !== undefined) {
      recentInteractionIds.delete(oldest);
    }
  }

  recentInteractionIds.set(interactionId, now);
  return true;
}

export function resetIdempotencyWindow(): void {
  recentInteractionIds.clear();
  lastSweepAt = 0;
}
