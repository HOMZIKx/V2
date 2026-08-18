/**
 * Shared production origin contract for WWW/Admin bake and runtime doctor.
 * Loopback must never be treated as a deployed public origin.
 */

export function isLoopbackHostname(hostname) {
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

/**
 * @param {unknown} raw
 * @param {{ requireHttps?: boolean }} [options]
 * @returns {{ ok: boolean, reason: 'ok' | 'missing' | 'malformed' | 'loopback' | 'insecure', origin: string | null }}
 */
export function evaluatePublicOrigin(raw, options = {}) {
  const requireHttps = options.requireHttps === true;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'missing', origin: null };
  }

  let url;
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

export function assertProductionPublicOrigins(env, keys, options = {}) {
  const failures = [];
  for (const key of keys) {
    const result = evaluatePublicOrigin(env[key], options);
    if (!result.ok) {
      failures.push(`${key}:${result.reason}`);
    }
  }
  return failures;
}
