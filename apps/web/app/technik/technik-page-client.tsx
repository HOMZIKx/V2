'use client';

import { useEffect, type ReactNode } from 'react';

import { useRouter } from 'next/navigation';

import { usePlayerStore } from '../../src/player-store-react';
import { useTechnikAccess } from '../../src/technik-access';
import { TechnikShell, type TechnikNavId } from '../../src/technik/technik-shell';
import { AppShell } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';

export function TechnikPageFrame({
  active,
  children,
}: {
  readonly active: TechnikNavId;
  readonly children: ReactNode;
}) {
  const { state, hydrated } = usePlayerStore();
  const access = useTechnikAccess();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && state.authStatus === 'authenticated' && access === 'denied') {
      router.replace('/');
    }
  }, [access, hydrated, router, state.authStatus]);

  if (!hydrated || access === 'checking') {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Sprawdzanie dostępu…</p>
      </main>
    );
  }

  if (state.authStatus !== 'authenticated' || !state.viewer) {
    return <DiscordEntryScreen />;
  }

  if (access === 'denied') {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Brak uprawnień do panelu Technik.</p>
      </main>
    );
  }

  if (access === 'unavailable') {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Nie udało się zweryfikować uprawnień Technik. Spróbuj ponownie.</p>
      </main>
    );
  }

  return (
    <AppShell activeSection="technik" viewerName={state.viewer.displayName}>
      <main className="technik-page" id="main-content">
        <TechnikShell active={active}>{children}</TechnikShell>
      </main>
    </AppShell>
  );
}
