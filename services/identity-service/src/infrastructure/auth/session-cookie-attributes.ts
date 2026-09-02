export type SessionCookieSameSite = 'lax' | 'none';

export interface SessionCookieAttributes {
  readonly sameSite: SessionCookieSameSite;
  readonly secure: boolean;
}

function parseOrigin(value: string | undefined): URL | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Host-only session cookies on the public API host.
 * SameSite=Lax is enough when WWW/Admin share that hostname (local 127.0.0.1).
 * Split public hosts (Zeabur WWW vs API) are cross-site, so credentialed
 * fetches need SameSite=None; Secure. Never emit None on non-HTTPS.
 */
export function resolveSessionCookieAttributes(options: {
  readonly authBaseUrl: string | undefined;
  readonly trustedOrigins: readonly string[];
}): SessionCookieAttributes {
  const authUrl = parseOrigin(options.authBaseUrl);
  if (authUrl === null) {
    return { sameSite: 'lax', secure: false };
  }

  const authHost = authUrl.hostname.toLowerCase();
  const https = authUrl.protocol === 'https:';
  const crossHost = options.trustedOrigins.some((origin) => {
    const parsed = parseOrigin(origin);
    return parsed !== null && parsed.hostname.toLowerCase() !== authHost;
  });

  if (crossHost && https) {
    return { sameSite: 'none', secure: true };
  }

  return { sameSite: 'lax', secure: https };
}
