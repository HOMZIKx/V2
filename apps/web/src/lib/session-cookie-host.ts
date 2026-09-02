import { isLoopbackHostname } from './public-origin';

/**
 * Identity session cookies are host-only on the public API host.
 * WWW middleware must not treat a missing cookie on a different hostname
 * (e.g. v2-web.zeabur.app vs v2-api.zeabur.app) as logged-out.
 * Local loopback aliases (localhost / 127.0.0.1 / ::1) stay the same host.
 */
function canonicalHostname(hostname: string): string {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return isLoopbackHostname(normalized) ? 'loopback' : normalized;
}

export function shouldUseServerSessionGate(requestHostname: string, apiBaseUrl: string): boolean {
  try {
    return canonicalHostname(requestHostname) === canonicalHostname(new URL(apiBaseUrl).hostname);
  } catch {
    return true;
  }
}
