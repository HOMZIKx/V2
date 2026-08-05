export interface CallbackUrlPolicy {
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly IDENTITY_AUTH_BASE_URL: string | undefined;
  readonly IDENTITY_TRUSTED_ORIGINS: readonly string[];
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost')
  );
}

/**
 * Whether a callback URL is allowed for OAuth start/link flows.
 * Origin must match the auth base URL origin or an entry in trusted origins.
 * In production, only https non-localhost URLs are accepted.
 */
export function isAllowedCallbackUrl(callbackURL: string, config: CallbackUrlPolicy): boolean {
  let url: URL;
  try {
    url = new URL(callbackURL);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  if (config.NODE_ENV === 'production') {
    if (url.protocol !== 'https:') {
      return false;
    }
    if (isLocalHostname(url.hostname)) {
      return false;
    }
  }

  const allowedOrigins = new Set(config.IDENTITY_TRUSTED_ORIGINS);
  if (config.IDENTITY_AUTH_BASE_URL !== undefined) {
    try {
      allowedOrigins.add(new URL(config.IDENTITY_AUTH_BASE_URL).origin);
    } catch {
      return false;
    }
  }

  return allowedOrigins.has(url.origin);
}
