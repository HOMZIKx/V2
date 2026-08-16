'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { buildDiscordLoginUrl } from '../lib/env';

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

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.08em' }}>
          V2
        </p>
        <h1>Logowanie</h1>
        <p>
          Zaloguj się przez Discord, aby przeglądać aktywności, zmieniać status zapisu i czytać
          powiadomienia.
        </p>
        <a className="btn" href={loginUrl}>
          Zaloguj przez Discord
        </a>
        <div className="login-hint" role="note">
          Wymagane uprawnienie platformy <code>OWNER_LOGIN_REQUIRED</code> /{' '}
          <code>permission.platform.login.www</code>. Bez niego Identity nie utworzy sesji WWW.
        </div>
      </div>
    </div>
  );
}
