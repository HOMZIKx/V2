export type RateLimitRule = {
  readonly prefix: string;
  readonly methods?: readonly string[];
  readonly max: number;
  readonly windowMs: number;
};

export const GATEWAY_RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  { prefix: '/identity/oauth/', max: 30, windowMs: 60_000 },
  { prefix: '/identity/link/', methods: ['POST'], max: 20, windowMs: 60_000 },
  { prefix: '/activity/v1/lfg/join', methods: ['POST'], max: 60, windowMs: 60_000 },
  { prefix: '/activity/v1/lfg/search', methods: ['POST'], max: 120, windowMs: 60_000 },
  { prefix: '/activity/v1/lfg/intents', methods: ['POST'], max: 30, windowMs: 60_000 },
];

/** Safety cap — prevents unbounded Map growth under identity rotation attacks. */
export const RATE_LIMIT_MAX_BUCKETS = 50_000;
const RATE_LIMIT_SWEEP_INTERVAL_MS = 60_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweepAtMs = 0;

export function resetRateLimitStoreForTests(): void {
  buckets.clear();
  lastSweepAtMs = 0;
}

export function rateLimitStoreSizeForTests(): number {
  return buckets.size;
}

/**
 * Client identity for rate limiting.
 * Uses Fastify `request.ip` only — never parse X-Forwarded-For manually.
 * With `trustProxy` enabled on Zeabur, `request.ip` is derived by Fastify from the trusted edge hop.
 */
export function clientKeyFromRequest(request: { ip?: string }): string {
  return request.ip ?? 'unknown';
}

function normalizePath(url: string): string {
  const path = url.split('?')[0] ?? url;
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

function matchesRule(method: string, path: string, rule: RateLimitRule): boolean {
  if (rule.methods !== undefined && !rule.methods.includes(method.toUpperCase())) {
    return false;
  }
  return path.startsWith(rule.prefix) || path === rule.prefix.replace(/\/$/, '');
}

function sweepExpiredBuckets(nowMs: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= nowMs) {
      buckets.delete(key);
    }
  }
}

function enforceBucketCap(): void {
  if (buckets.size <= RATE_LIMIT_MAX_BUCKETS) {
    return;
  }
  const overflow = buckets.size - RATE_LIMIT_MAX_BUCKETS;
  const oldest = [...buckets.entries()]
    .sort((left, right) => left[1].resetAt - right[1].resetAt)
    .slice(0, overflow);
  for (const [key] of oldest) {
    buckets.delete(key);
  }
}

function maybeSweepBuckets(nowMs: number): void {
  if (nowMs - lastSweepAtMs < RATE_LIMIT_SWEEP_INTERVAL_MS) {
    return;
  }
  lastSweepAtMs = nowMs;
  sweepExpiredBuckets(nowMs);
  enforceBucketCap();
}

export function checkRateLimit(
  clientKey: string,
  method: string,
  url: string,
  rules: readonly RateLimitRule[] = GATEWAY_RATE_LIMIT_RULES,
  nowMs: number = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  maybeSweepBuckets(nowMs);

  const path = normalizePath(url);
  const upperMethod = method.toUpperCase();
  const rule = rules.find((candidate) => matchesRule(upperMethod, path, candidate));
  if (rule === undefined) {
    return { allowed: true };
  }

  const key = `${clientKey}:${upperMethod}:${rule.prefix}`;
  const existing = buckets.get(key);
  if (existing === undefined || existing.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + rule.windowMs });
    enforceBucketCap();
    return { allowed: true };
  }

  if (existing.count >= rule.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { allowed: true };
}

export function applyRateLimitOnRequest(
  request: {
    method: string;
    url: string;
    ip?: string;
  },
  reply: {
    header: (key: string, value: string) => unknown;
    code: (status: number) => { send: (body?: unknown) => unknown };
  },
): boolean {
  const clientKey = clientKeyFromRequest(request);
  const result = checkRateLimit(clientKey, request.method, request.url);
  if (result.allowed) {
    return false;
  }
  void reply.header('Retry-After', String(result.retryAfterSeconds));
  void reply.code(429).send({
    statusCode: 429,
    message: 'Too many requests',
    error: 'Too Many Requests',
  });
  return true;
}
