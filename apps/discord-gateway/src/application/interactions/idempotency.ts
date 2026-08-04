const recentInteractionIds = new Map<string, number>();
const WINDOW_MS = 15_000;

export function claimInteractionId(interactionId: string, now = Date.now()): boolean {
  const expiresBefore = now - WINDOW_MS;
  for (const [id, timestamp] of recentInteractionIds) {
    if (timestamp < expiresBefore) {
      recentInteractionIds.delete(id);
    }
  }

  if (recentInteractionIds.has(interactionId)) {
    return false;
  }

  recentInteractionIds.set(interactionId, now);
  return true;
}

export function resetIdempotencyWindow(): void {
  recentInteractionIds.clear();
}
