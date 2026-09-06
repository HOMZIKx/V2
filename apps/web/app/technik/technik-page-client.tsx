'use client';

import type { ReactNode } from 'react';

import { usePlayerStore } from '../../src/player-store-react';
import { AppShell } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';
import { TechnikShell, type TechnikNavId } from '../../src/technik/technik-shell';

export function TechnikPageFrame({
  active,
  children,
}: {
  readonly active: TechnikNavId;
  readonly children: ReactNode;
}) {
  const { state, hydrated } = usePlayerStore();

  if (!hydrated) {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Ładowanie…</p>
      </main>
    );
  }

  if (state.authStatus !== 'authenticated' || !state.viewer) {
    return <DiscordEntryScreen />;
  }

  return (
    <AppShell activeSection="technik" viewerName={state.viewer.displayName}>
      <main className="technik-page" id="main-content">
        <TechnikShell active={active}>{children}</TechnikShell>
      </main>
    </AppShell>
  );
}
