const recentNotifyKeys = new Map<string, number>();
const WINDOW_MS = 60_000;

export function claimNotifyIdempotencyKey(key: string, now = Date.now()): boolean {
  const expiresBefore = now - WINDOW_MS;
  for (const [id, timestamp] of recentNotifyKeys) {
    if (timestamp < expiresBefore) {
      recentNotifyKeys.delete(id);
    }
  }

  if (recentNotifyKeys.has(key)) {
    return false;
  }

  recentNotifyKeys.set(key, now);
  return true;
}

export function releaseNotifyIdempotencyKey(key: string): void {
  recentNotifyKeys.delete(key);
}

export function resetNotifyIdempotencyWindow(): void {
  recentNotifyKeys.clear();
}

export const NOTIFY_IDEMPOTENCY_WINDOW_MS = WINDOW_MS;
