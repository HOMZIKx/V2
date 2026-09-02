import { NextResponse, type NextRequest } from 'next/server';

import { shouldUseServerSessionGate } from './src/lib/session-cookie-host';

const PROTECTED_PREFIXES = ['/aktywnosci', '/moje', '/powiadomienia'] as const;

function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }
  // Production images fail-closed at Docker build if this is missing; do not fall back to localhost.
  if (process.env.NODE_ENV === 'production') {
    return '';
  }
  return 'http://127.0.0.1:4000';
}

function isProtectedPath(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function loginNextPath(pathname: string): string {
  return pathname === '/' ? '/aktywnosci' : pathname;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const apiBase = getApiBaseUrl();
  // Session cookie is host-only on the API origin. On split public hosts the
  // browser never sends it to WWW, so the client SessionProvider probes
  // /session/me with credentials: include instead.
  if (!shouldUseServerSessionGate(request.nextUrl.hostname, apiBase)) {
    return NextResponse.next();
  }

  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie.includes('v2.identity.session_token')) {
    const login = new URL('/logowanie', request.url);
    login.searchParams.set('next', loginNextPath(pathname));
    return NextResponse.redirect(login);
  }

  try {
    const probe = await fetch(`${apiBase.replace(/\/$/, '')}/session/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        cookie,
      },
      redirect: 'manual',
      cache: 'no-store',
    });
    if (probe.status === 401 || probe.status === 403) {
      const login = new URL('/logowanie', request.url);
      login.searchParams.set('next', loginNextPath(pathname));
      return NextResponse.redirect(login);
    }
  } catch {
    // Network failure — let the client layout show unavailable/error after paint.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/aktywnosci', '/aktywnosci/:path*', '/moje', '/powiadomienia'],
};
