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
  const { state, hydrated, finishAuth, resetStore } = usePlayerStore();
  const [identityChecked, setIdentityChecked] = useState(false);
  const checkedPathRef = useRef<string | null>(null);

  const isCallback = pathname === '/auth/callback';

  useEffect(() => {
    if (!hydrated || isCallback) return;
    if (checkedPathRef.current === 'session') return;
    checkedPathRef.current = 'session';

    // The simulator is a development-only escape hatch. Production always
    // requires a real Identity/Discord session.
    if (process.env.NODE_ENV !== 'production' && isDiscordAuthSimulateEnabled()) {
      setIdentityChecked(true);
      return;
    }

    if (!isIdentityAuthClientEnabled()) {
      resetStore();
      setIdentityChecked(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveDiscordViewerFromSession();
        if (cancelled) return;

        if (!resolved) {
          // A cached `authenticated` flag must never bypass Discord OAuth.
          resetStore();
          setIdentityChecked(true);
          return;
        }

        // Never expose one Discord user's cached team data to another user on
        // the same browser profile.
        if (state.viewer && state.viewer.id !== resolved.viewer.id) {
          resetStore();
        }
        finishAuth('authenticated', resolved.viewer);
        setIdentityChecked(true);
      } catch {
        if (cancelled) return;
        resetStore();
        setIdentityChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finishAuth, hydrated, isCallback, resetStore, state.viewer]);

  if (isCallback) return children;

  if (!hydrated || !identityChecked) {
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
