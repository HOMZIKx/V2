export type PublicOriginReason = 'ok' | 'missing' | 'malformed' | 'loopback' | 'insecure';

export function isProductionRuntime(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === 'production';
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '0.0.0.0' ||
    normalized.endsWith('.localhost')
  );
}

export function evaluatePublicOrigin(
  raw: string | undefined,
  options: { requireHttps?: boolean } = {},
): { ok: boolean; reason: PublicOriginReason; origin: string | null } {
  const requireHttps = options.requireHttps === true;
  if (raw === undefined || raw.trim() === '') {
    return { ok: false, reason: 'missing', origin: null };
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'malformed', origin: null };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'malformed', origin: null };
  }
  if (isLoopbackHostname(url.hostname)) {
    return { ok: false, reason: 'loopback', origin: null };
  }
  if (requireHttps && url.protocol !== 'https:') {
    return { ok: false, reason: 'insecure', origin: null };
  }

  return { ok: true, reason: 'ok', origin: url.origin };
}

export function readPublicOrigin(
  raw: string | undefined,
  fallback: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  if (isProductionRuntime(nodeEnv)) {
    const evaluated = evaluatePublicOrigin(raw, { requireHttps: true });
    return evaluated.origin ?? '';
  }
  const trimmed = raw?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : fallback;
}
