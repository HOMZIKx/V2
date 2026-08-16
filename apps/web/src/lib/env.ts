export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:4000';
}

export function getIdentityPublicUrl(): string {
  return process.env.NEXT_PUBLIC_IDENTITY_URL?.trim() || 'http://127.0.0.1:4200';
}

export function getWebOrigin(): string {
  return process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim() || 'http://127.0.0.1:3000';
}

export function buildDiscordLoginUrl(callbackPath = '/aktywnosci'): string {
  const callbackURL = `${getWebOrigin().replace(/\/$/, '')}${callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`}`;
  const base = getIdentityPublicUrl().replace(/\/$/, '');
  return `${base}/identity/oauth/discord?callbackURL=${encodeURIComponent(callbackURL)}`;
}
