'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { resolveDiscordViewerFromSession } from '../../../src/identity-auth-client';
import { usePlayerStore } from '../../../src/player-store-react';

/**
 * Landing after Identity web-bridge redirect.
 *
 * Security boundary: callback query parameters are never trusted as proof of
 * authentication. The browser must still present a valid Identity session and
 * the viewer is always rebuilt from that authoritative session.
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
            Weryfikacja sesji Discord…
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
