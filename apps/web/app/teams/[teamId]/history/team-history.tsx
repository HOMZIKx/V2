'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { usePlayerStore } from '../../../../src/player-store-react';
import type { TeamHistoryResource } from '../../../../src/team-history';
import { AppShell, Icon, type IconName } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';
import { WorkspaceSectionNav } from '../workspace-section-nav';

const resourceIcon: Record<TeamHistoryResource, IconName> = {
  equipment: 'equipment',
  timer: 'clock',
  note: 'note',
  character: 'character',
  member: 'team',
};

const resourceLabel: Record<TeamHistoryResource, string> = {
  equipment: 'EQ',
  timer: 'Timer',
  note: 'Notatka',
  character: 'Postać',
  member: 'Skład',
};

export function TeamHistory() {
  const params = useParams<{ teamId: string }>();
  const { state, hydrated } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const [query, setQuery] = useState('');
  const [resource, setResource] = useState<TeamHistoryResource | 'all'>('all');
  const entries = useMemo(() => {
    if (!workspace) return [];
    const normalized = query.trim().toLocaleLowerCase('pl');
    return workspace.history.filter((entry) => {
      const resourceMatches = resource === 'all' || entry.resource === resource;
      const queryMatches =
        normalized.length === 0 ||
        entry.title.toLocaleLowerCase('pl').includes(normalized) ||
        entry.detail.toLocaleLowerCase('pl').includes(normalized) ||
        entry.actorName.toLocaleLowerCase('pl').includes(normalized) ||
        (entry.characterName ?? '').toLocaleLowerCase('pl').includes(normalized);
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

  if (!workspace || workspace.archived) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="team-history-page" id="main-content">
          <h1>Brak przestrzeni</h1>
          <a className="secondary-button" href="/">
            Wróć na pulpit
          </a>
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

        <div className="team-section-back">
          <a className="secondary-button" href={`/teams/${workspace.id}/members`}>
            ← Zarządzanie zespołem
          </a>
          <a className="panel-text-link" href={`/teams/${workspace.id}`}>
            Przegląd zespołu
          </a>
        </div>

        <WorkspaceSectionNav active="history" workspaceId={workspace.id} />

        <header className="history-page-header">
          <div>
            <span className="eyebrow">Historia przestrzeni</span>
            <h1>Dziennik zmian</h1>
            <p>Kto co zmienił w EQ, timerach, notatkach i członkach — bez cofania wpisów.</p>
          </div>
        </header>

        <section className="panel history-log-panel">
          <div className="history-filters">
            <label className="history-search">
              <span>Szukaj w historii</span>
              <div>
                <Icon name="search" size={14} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tytuł, osoba, postać…"
                  value={query}
                />
              </div>
            </label>
            <label>
              <span>Zasób</span>
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
          </div>

          {entries.length === 0 ? (
            <div className="history-empty-state">
              <Icon name="history" size={28} />
              <strong>Brak wpisów</strong>
              <p className="empty-copy">Brak wpisów dla wybranych filtrów.</p>
            </div>
          ) : (
            <ol className="history-timeline">
              {entries.map((entry) => (
                <li className={`history-timeline-entry is-${entry.resource}`} key={entry.id}>
                  <div className="history-timeline-icon" aria-hidden>
                    <Icon name={resourceIcon[entry.resource]} size={16} />
                  </div>
                  <div className="history-timeline-copy">
                    <div>
                      <strong>{entry.title}</strong>
                      <time>{entry.occurredAtLabel}</time>
                    </div>
                    <p>{entry.detail}</p>
                    <footer>
                      <span className="member-avatar is-idle" aria-hidden>
                        {entry.actorInitials}
                      </span>
                      <span>{entry.actorName}</span>
                      <em>{resourceLabel[entry.resource]}</em>
                      {entry.characterName ? <em>{entry.characterName}</em> : <em>przestrzeń</em>}
                      <small>rev {entry.revision}</small>
                    </footer>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

      </main>
    </AppShell>
  );
}
