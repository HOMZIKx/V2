'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { buildDiscordLoginUrl, isLoginConfigured } from '../lib/env';
import { UnavailableState } from './StateViews';

export function LoginPage() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');
  const loginUrl = useMemo(() => {
    const callback =
      nextPath !== null && nextPath.startsWith('/') && !nextPath.startsWith('//')
        ? nextPath
        : '/aktywnosci';
    return buildDiscordLoginUrl(callback);
  }, [nextPath]);

  if (!isLoginConfigured()) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="web-brand">V2</p>
          <UnavailableState title="Logowanie niedostępne">
            Spróbuj ponownie później.
          </UnavailableState>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>V2</h1>
        <p>Aktywności, zapisy i powiadomienia Twojego serwera.</p>
        <a className="v2-btn v2-btn-primary" href={loginUrl}>
          Zaloguj przez Discord
        </a>
      </div>
    </div>
  );
}
