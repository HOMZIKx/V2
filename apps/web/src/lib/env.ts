import { evaluatePublicOrigin, isProductionRuntime, readPublicOrigin } from './public-origin';

export { evaluatePublicOrigin, readPublicOrigin } from './public-origin';

const DEV_API_FALLBACK = process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:4000';
const DEV_IDENTITY_FALLBACK = process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:4200';
const DEV_WEB_FALLBACK = process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3000';

export function getApiBaseUrl(): string {
  return readPublicOrigin(process.env.NEXT_PUBLIC_API_BASE_URL, DEV_API_FALLBACK);
}

export function getIdentityPublicUrl(): string {
  return readPublicOrigin(process.env.NEXT_PUBLIC_IDENTITY_URL, DEV_IDENTITY_FALLBACK);
}

export function getWebOrigin(): string {
  return readPublicOrigin(process.env.NEXT_PUBLIC_WEB_ORIGIN, DEV_WEB_FALLBACK);
}

export function buildDiscordLoginUrl(callbackPath = '/aktywnosci'): string {
  const callbackURL = `${getWebOrigin().replace(/\/$/, '')}${callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`}`;
  const base = getIdentityPublicUrl().replace(/\/$/, '');
  return `${base}/identity/oauth/discord?callbackURL=${encodeURIComponent(callbackURL)}`;
}

export function isLoginConfiguredFromOrigins(
  origins: { api: string; identity: string; web: string },
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (isProductionRuntime(nodeEnv)) {
    return (
      evaluatePublicOrigin(origins.api, { requireHttps: true }).ok &&
      evaluatePublicOrigin(origins.identity, { requireHttps: true }).ok &&
      evaluatePublicOrigin(origins.web, { requireHttps: true }).ok
    );
  }

  const identity = origins.identity.trim();
  return identity.length > 0 && identity !== 'unavailable';
}

export function isLoginConfigured(): boolean {
  return isLoginConfiguredFromOrigins({
    api: getApiBaseUrl(),
    identity: getIdentityPublicUrl(),
    web: getWebOrigin(),
  });
}

/** Organization scope for Activity LFG (matches gateway ACTIVITY_ORGANIZATION_ID). */
export function getActivityOrganizationId(): string | null {
  const value = process.env.NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID?.trim();
  return value !== undefined && value !== '' ? value : null;
}
