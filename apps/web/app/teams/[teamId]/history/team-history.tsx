'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { usePlayerStore } from '../../../../src/player-store-react';
import type { TeamHistoryResource } from '../../../../src/team-history';
import { AppShell, Icon } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';

export function TeamHistory() {
  const params = useParams<{ teamId: string }>();
  const { state, hydrated } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const [query, setQuery] = useState('');
  const [resource, setResource] = useState<TeamHistoryResource | 'all'>('all');
  const [conflictResolved, setConflictResolved] = useState(false);

  const entries = useMemo(() => {
    if (!workspace) return [];
    const normalized = query.trim().toLocaleLowerCase('pl');
    return workspace.history.filter((entry) => {
      const resourceMatches = resource === 'all' || entry.resource === resource;
      const queryMatches =
        normalized.length === 0 ||
        entry.title.toLocaleLowerCase('pl').includes(normalized) ||
        entry.detail.toLocaleLowerCase('pl').includes(normalized);
      return resourceMatches && queryMatches;
    });
  }, [workspace, query, resource]);

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

  if (!workspace) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="team-history-page" id="main-content">
          <h1>Brak przestrzeni</h1>
          <a href="/">Wróć</a>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="team-history-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${workspace.id}`}>{workspace.name}</a>
          <Icon name="chevron" size={13} />
          <strong>Historia</strong>
        </nav>

        <header>
          <span className="eyebrow">Historia przestrzeni</span>
          <h1>Dziennik zmian</h1>
          <p>Kto co zmienił w EQ, timerach, notatkach i członkach — bez cofania wpisów.</p>
        </header>

        <section className="panel">
          <label>
            Szukaj w historii
            <input onChange={(event) => setQuery(event.target.value)} value={query} />
          </label>
          <label>
            Zasób
            <select
              onChange={(event) => setResource(event.target.value as TeamHistoryResource | 'all')}
              value={resource}
            >
              <option value="all">Wszystkie</option>
              <option value="equipment">EQ</option>
              <option value="timer">Timery</option>
              <option value="note">Notatki</option>
              <option value="character">Postacie</option>
              <option value="member">Członkowie</option>
            </select>
          </label>
        </section>

        {!conflictResolved ? (
          <details className="panel conflict-panel">
            <summary>Symulator konfliktu rewizji (opcjonalny)</summary>
            <p>
              Lokalny szkic i nowsza wersja nie nadpisują się cicho. To nie jest błąd Twoich danych
              — tylko podgląd zachowania na produkcję.
            </p>
            <button onClick={() => setConflictResolved(true)} type="button">
              Zachowaj mój szkic
            </button>
          </details>
        ) : (
          <p className="entry-status">Konflikt obsłużony — szkic zachowany lokalnie.</p>
        )}

        <ol className="history-timeline">
          {entries.length === 0 ? (
            <li>
              <p className="empty-copy">Brak wpisów dla wybranych filtrów.</p>
            </li>
          ) : (
            entries.map((entry) => (
              <li className={`history-timeline-entry is-${entry.resource}`} key={entry.id}>
                <strong>{entry.title}</strong>
                <p>{entry.detail}</p>
                <small>
                  {entry.actorName} · {entry.characterName ?? 'przestrzeń'} ·{' '}
                  {entry.occurredAtLabel} · rev {entry.revision}
                </small>
              </li>
            ))
          )}
        </ol>

        <div className="mock-notice">
          Dziennik tylko dopisuje wpisy (bez cofania). Live sync wróci z backendem.
        </div>
      </main>
    </AppShell>
  );
}
