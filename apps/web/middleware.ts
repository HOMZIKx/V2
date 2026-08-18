import { NextResponse, type NextRequest } from 'next/server';

import { shouldUseServerSessionGate } from './src/lib/session-cookie-host';

const PROTECTED_PREFIXES = ['/aktywnosci', '/moje', '/powiadomienia'] as const;

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:4000';
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // Session cookie is host-only on the API origin. On split public hosts the
  // browser never sends it to WWW, so the client SessionProvider probes
  // /session/me with credentials: include instead.
  if (!shouldUseServerSessionGate(request.nextUrl.hostname, getApiBaseUrl())) {
    return NextResponse.next();
  }

  const cookie = request.headers.get('cookie') ?? '';
  if (cookie.trim() === '') {
    const login = new URL('/logowanie', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  try {
    const probe = await fetch(`${getApiBaseUrl().replace(/\/$/, '')}/session/me`, {
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
      login.searchParams.set('next', pathname);
      return NextResponse.redirect(login);
    }
  } catch {
    // Network failure — let the client layout show unavailable/error after paint.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/aktywnosci', '/aktywnosci/:path*', '/moje', '/powiadomienia'],
};
