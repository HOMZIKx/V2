import { getApiBaseUrl } from '../api/http.js';

/**
 * Prefer explicit public origin in production builds so a mis-copied local
 * Admin pointing at prod API cannot mint a localhost callbackURL.
 */
export function resolveAdminLoginOrigin(windowOrigin: string, envPublicOrigin?: string): string {
  const configured = envPublicOrigin?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured.replace(/\/$/, '');
  }
  return windowOrigin.replace(/\/$/, '');
}

export function buildAdminDiscordLoginUrl(
  origin: string,
  apiBaseUrl: string = getApiBaseUrl(),
  envPublicOrigin?: string,
): string {
  const normalizedOrigin = resolveAdminLoginOrigin(origin, envPublicOrigin);
  const callbackURL = `${normalizedOrigin}/`;
  const base = apiBaseUrl.replace(/\/$/, '');
  return `${base}/identity/oauth/discord?callbackURL=${encodeURIComponent(callbackURL)}`;
}

export function shouldOfferIdentityLogin(mode: 'dev-actor' | 'identity-cookie'): boolean {
  return mode === 'identity-cookie';
}
