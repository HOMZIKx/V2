function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function validPort(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!/^\d{1,5}$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed >= 1 && parsed <= 65535 ? String(parsed) : null;
}

/**
 * URL base for server-side calls from one Next route to another route in the
 * same web process. In production we deliberately avoid the public deployment
 * URL: a loopback hop does not depend on external DNS, TLS or ingress routing.
 * WEB_INTERNAL_ORIGIN remains an explicit escape hatch for unusual runtimes.
 */
export function internalWebOrigin(requestUrl: string): string {
  const configured = process.env.WEB_INTERNAL_ORIGIN?.trim();
  if (configured) return trimTrailingSlash(configured);

  if (process.env.NODE_ENV === 'production') {
    const port = validPort(process.env.PORT) ?? validPort(process.env.WEB_PORT) ?? '3000';
    return `http://127.0.0.1:${port}`;
  }

  return new URL(requestUrl).origin;
}

export function internalWebUrl(requestUrl: string, path: string): URL {
  return new URL(path, `${internalWebOrigin(requestUrl)}/`);
}
