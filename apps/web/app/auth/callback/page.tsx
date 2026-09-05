'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { viewerFromCallbackSearchParams } from '../../../src/identity-auth-client';
import { usePlayerStore } from '../../../src/player-store-react';

/**
 * Landing after Identity web-bridge redirect.
 * Query: viewerId, displayName, optional discordAccountId.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { finishAuth, hydrated } = usePlayerStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const viewer = viewerFromCallbackSearchParams(params);
    if (!viewer) {
      setError('Brak danych sesji po Discord. Wróć i spróbuj ponownie.');
      return;
    }
    const snowflake =
      params.get('discordAccountId')?.trim() || viewer.discordAccountId || undefined;
    finishAuth('authenticated', {
      displayName: viewer.displayName,
      v2UserId: params.get('viewerId')?.trim() || viewer.id,
      ...(snowflake ? { discordUserId: snowflake } : {}),
    });
    router.replace('/');
  }, [hydrated, finishAuth, router]);

  return (
    <main className="discord-entry" id="main-content">
      <section className="discord-entry-card">
        <span className="eyebrow">DESTILED</span>
        <h1>Kończenie logowania…</h1>
        {error ? (
          <p className="entry-status is-warn" role="alert">
            {error}
          </p>
        ) : (
          <p className="entry-status" role="status">
            Przetwarzanie sesji Discord…
          </p>
        )}
        {error ? (
          <a className="primary-button entry-primary" href="/">
            Wróć do startu
          </a>
        ) : null}
      </section>
    </main>
  );
}
