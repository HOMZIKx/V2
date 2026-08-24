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

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function resetRateLimitStoreForTests(): void {
  buckets.clear();
}

export function clientKeyFromRequest(request: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first !== '') {
      return first;
    }
  }
  if (Array.isArray(forwarded) && forwarded[0] !== undefined) {
    return forwarded[0].trim();
  }
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

export function checkRateLimit(
  clientKey: string,
  method: string,
  url: string,
  rules: readonly RateLimitRule[] = GATEWAY_RATE_LIMIT_RULES,
  nowMs: number = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
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
    headers: Record<string, string | string[] | undefined>;
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
