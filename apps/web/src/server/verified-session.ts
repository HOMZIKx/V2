import type { NextRequest } from 'next/server';

function normalizeTarget(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '');
  return trimmed ? trimmed : null;
}

function identityTarget(): string {
  const productionBackendOrigin =
    normalizeTarget(process.env.V2_BACKEND_PUBLIC_ORIGIN) ?? 'https://v2-api.zeabur.app';
  return (
    normalizeTarget(process.env.IDENTITY_PROXY_TARGET) ??
    (process.env.NODE_ENV === 'production' ? productionBackendOrigin : 'http://127.0.0.1:4200')
  );
}

export async function verifiedViewerId(request: NextRequest): Promise<string | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  try {
    const response = await fetch(`${identityTarget()}/identity/me`, {
      method: 'GET',
      headers: { accept: 'application/json', cookie },
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error(`identity /me failed: ${response.status}`);
    const body = (await response.json()) as { id?: unknown };
    return typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null;
  } catch (error) {
    console.error('verified session lookup failed', error);
    return null;
  }
}
