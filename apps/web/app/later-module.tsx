'use client';

import { usePlayerStore } from '../src/player-store-react';
import { AppShell } from './app-shell';
import { DiscordEntryScreen } from './discord-entry';

function LaterModulePage({ title, summary }: { readonly title: string; readonly summary: string }) {
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
    <AppShell activeSection="later" viewerName={state.viewer.displayName}>
      <main className="later-module-page" id="main-content">
        <span className="eyebrow">Późniejszy moduł</span>
        <h1>{title}</h1>
        <p>{summary}</p>
        <p>
          First-player slice musi być stabilny zanim ten obszar wróci do głównej nawigacji (D-049 /
          D-059).
        </p>
        <a className="primary-button" href="/">
          Wróć na pulpit
        </a>
      </main>
    </AppShell>
  );
}

export function MapsLaterPage() {
  return (
    <LaterModulePage
      title="Mapy i metiny"
      summary="Główna powierzchnia to /timers (nav Timery) — katalog respawnów jak w starej app. /maps otwiera atlas top-down + party."
    />
  );
}

export function MarketLaterPage() {
  return (
    <LaterModulePage
      title="Targ"
      summary="Targ to ogłoszenia kupna/sprzedaży i ceny między graczami — nie baza przedmiotów. Karty EQ z ulepszeniem 0–9 dodajesz przy postaci w przestrzeni zespołu."
    />
  );
}

export function ActivityLaterPage() {
  return (
    <LaterModulePage
      title="Aktywność"
      summary="Eventy i RSVP nie zastępują historii zmian w przestrzeni (EQ, lokalizacje, timery)."
    />
  );
}
