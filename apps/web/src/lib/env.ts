import { evaluatePublicOrigin, isProductionRuntime, readPublicOrigin } from './public-origin';

export { evaluatePublicOrigin, readPublicOrigin } from './public-origin';

export function getApiBaseUrl(): string {
  return readPublicOrigin(process.env.NEXT_PUBLIC_API_BASE_URL, 'http://127.0.0.1:4000');
}

export function getIdentityPublicUrl(): string {
  return readPublicOrigin(process.env.NEXT_PUBLIC_IDENTITY_URL, 'http://127.0.0.1:4200');
}

export function getWebOrigin(): string {
  return readPublicOrigin(process.env.NEXT_PUBLIC_WEB_ORIGIN, 'http://127.0.0.1:3000');
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
