'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import {
  isDiscordAuthSimulateEnabled,
  isIdentityAuthClientEnabled,
  resolveDiscordViewerFromSession,
} from '../src/identity-auth-client';
import { usePlayerStore } from '../src/player-store-react';
import { DiscordEntryScreen } from './discord-entry';

/**
 * Production auth boundary.
 *
 * Browser localStorage is only a cache for player data. It is never accepted as
 * proof of authentication. Every fresh app load verifies the real Identity
 * session before private pages are rendered.
 */
export function AuthGate({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const { state, finishAuth, resetStore } = usePlayerStore();
  const [identityChecked, setIdentityChecked] = useState(false);
  const storeRef = useRef({ state, finishAuth, resetStore });
  storeRef.current = { state, finishAuth, resetStore };

  const isCallback = pathname === '/auth/callback';

  useEffect(() => {
    if (isCallback) return;

    setIdentityChecked(false);

    if (process.env.NODE_ENV !== 'production' && isDiscordAuthSimulateEnabled()) {
      setIdentityChecked(true);
      return;
    }

    if (!isIdentityAuthClientEnabled()) {
      storeRef.current.resetStore();
      setIdentityChecked(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveDiscordViewerFromSession();
        if (cancelled) return;

        const store = storeRef.current;
        if (!resolved) {
          store.resetStore();
          setIdentityChecked(true);
          return;
        }

        if (store.state.viewer && store.state.viewer.id !== resolved.viewer.id) {
          store.resetStore();
        }
        store.finishAuth('authenticated', resolved.viewer);
        setIdentityChecked(true);
      } catch {
        if (cancelled) return;
        storeRef.current.resetStore();
        setIdentityChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCallback]);

  if (isCallback) return children;

  if (!identityChecked) {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Sprawdzanie sesji Discord…</p>
      </main>
    );
  }

  if (state.authStatus !== 'authenticated' || !state.viewer) {
    return <DiscordEntryScreen />;
  }

  return children;
}
