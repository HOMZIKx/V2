import { getApiBaseUrl } from '../api/http.js';

export function buildAdminDiscordLoginUrl(
  origin: string,
  apiBaseUrl: string = getApiBaseUrl(),
): string {
  const normalizedOrigin = origin.replace(/\/$/, '');
  const callbackURL = `${normalizedOrigin}/`;
  const base = apiBaseUrl.replace(/\/$/, '');
  return `${base}/identity/oauth/discord?callbackURL=${encodeURIComponent(callbackURL)}`;
}

export function shouldOfferIdentityLogin(mode: 'dev-actor' | 'identity-cookie'): boolean {
  return mode === 'identity-cookie';
}
