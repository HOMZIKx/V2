'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  resolveDiscordViewerFromSession,
  viewerFromCallbackSearchParams,
} from '../../../src/identity-auth-client';
import { usePlayerStore } from '../../../src/player-store-react';

/**
 * Landing after Identity web-bridge redirect.
 * Query: viewerId, displayName, optional discordAccountId.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { finishAuth } = usePlayerStore();
  const finishAuthRef = useRef(finishAuth);
  finishAuthRef.current = finishAuth;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const complete = async (): Promise<void> => {
      const params = new URLSearchParams(window.location.search);
      const callbackViewer = viewerFromCallbackSearchParams(params);

      if (callbackViewer) {
        finishAuthRef.current('authenticated', callbackViewer);
        router.replace('/');
        return;
      }

      try {
        const resolved = await resolveDiscordViewerFromSession();
        if (cancelled) return;
        if (!resolved) {
          setError('Brak aktywnej sesji Discord. Wróć i spróbuj ponownie.');
          return;
        }
        finishAuthRef.current('authenticated', resolved.viewer);
        router.replace('/');
      } catch {
        if (cancelled) return;
        setError('Nie udało się potwierdzić sesji Discord. Wróć i spróbuj ponownie.');
      }
    };

    void complete();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
