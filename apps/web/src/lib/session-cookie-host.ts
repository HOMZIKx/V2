/**
 * Identity session cookies are host-only on the public API host.
 * WWW middleware must not treat a missing cookie on a different hostname
 * (e.g. v2-web.zeabur.app vs v2-api.zeabur.app) as logged-out.
 */
export function shouldUseServerSessionGate(requestHostname: string, apiBaseUrl: string): boolean {
  try {
    const apiHost = new URL(apiBaseUrl).hostname.toLowerCase();
    return requestHostname.trim().toLowerCase() === apiHost;
  } catch {
    return true;
  }
}
