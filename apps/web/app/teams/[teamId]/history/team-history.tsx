'use client';

import { useMemo, useState } from 'react';

import {
  buildResolveConflictCommand,
  connectionStateCopy,
  filterTeamHistory,
  type ConflictResolution,
  type TeamHistoryFilters,
  type TeamHistoryResource,
  type TeamHistorySnapshot,
} from '../../../../src/team-history';
import { AppShell, Icon, type IconName } from '../../../app-shell';

const resourceLabels: Record<TeamHistoryResource, string> = {
  equipment: 'Ekwipunek i sety',
  timer: 'Timery postaci',
  note: 'Notatki',
  member: 'Członkowie',
  character: 'Postacie',
};

const resourceIcons: Record<TeamHistoryResource, IconName> = {
  equipment: 'equipment',
  timer: 'clock',
  note: 'note',
  member: 'team',
  character: 'character',
};

export function TeamHistory({ initialSnapshot }: { initialSnapshot: TeamHistorySnapshot }) {
  const [filters, setFilters] = useState<TeamHistoryFilters>({
    query: '',
    resource: 'all',
    actorId: 'all',
    characterId: 'all',
  });
  const [conflictResolved, setConflictResolved] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const entries = useMemo(
    () => filterTeamHistory(initialSnapshot.entries, filters),
    [filters, initialSnapshot.entries],
  );
  const connectionCopy = connectionStateCopy[initialSnapshot.connection];
  const actors = useMemo(
    () =>
      Array.from(
        new Map(initialSnapshot.entries.map((entry) => [entry.actorId, entry.actorName])).entries(),
      ),
    [initialSnapshot.entries],
  );
  const characters = useMemo(
    () =>
      Array.from(
        new Map(
          initialSnapshot.entries
            .filter((entry) => entry.characterId && entry.characterName)
            .map((entry) => [entry.characterId as string, entry.characterName as string]),
        ).entries(),
      ),
    [initialSnapshot.entries],
  );

  const resolveConflict = (resolution: ConflictResolution) => {
    if (!initialSnapshot.conflict) return;
    const command = buildResolveConflictCommand(
      initialSnapshot.conflict,
      resolution,
      `local-${initialSnapshot.conflict.id}-${resolution}`,
    );
    setConflictResolved(true);
    setAnnouncement(
      command.resolution === 'preserve_draft'
        ? 'Wersja robocza została zachowana. Przed zapisem zostanie ponownie porównana z najnowszą wersją.'
        : 'Wczytano najnowszą wersję zespołu. Poprzednia wersja robocza nie została opublikowana.',
    );
  };

  return (
    <AppShell activeSection="teams" viewerName={initialSnapshot.viewerName}>
      <main className="team-history-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${initialSnapshot.teamId}`}>{initialSnapshot.teamName}</a>
          <Icon name="chevron" size={13} />
          <strong>Historia</strong>
        </nav>

        <header className="history-page-header">
          <div>
            <span className="eyebrow">Pamięć zespołu</span>
            <h1>Dziennik zmian</h1>
            <p>
              Sprawdź kto, co i kiedy zmienił. Wpisy są dopisywane — nie zastępują poprzedniej
              historii.
            </p>
          </div>
          <div className={`connection-state is-${initialSnapshot.connection}`}>
            <span className="connection-state-dot" />
            <div>
              <strong>{connectionCopy.title}</strong>
              <span>{connectionCopy.detail}</span>
              <small>Ostatnia synchronizacja: {initialSnapshot.lastSynchronizedLabel}</small>
            </div>
          </div>
        </header>

        <nav aria-label="Sekcje zespołu" className="workspace-tabs">
          <a href={`/teams/${initialSnapshot.teamId}`}>Przegląd</a>
          <a href={`/teams/${initialSnapshot.teamId}#characters`}>Postacie</a>
          <a href={`/teams/${initialSnapshot.teamId}#tasks`}>Akcje i timery</a>
          <a href={`/teams/${initialSnapshot.teamId}#notes`}>Notatki</a>
          <a href={`/teams/${initialSnapshot.teamId}/members`}>Członkowie</a>
          <a aria-current="page" href={`/teams/${initialSnapshot.teamId}/history`}>
            Historia
          </a>
        </nav>

        <section aria-label="Aktywna edycja" className="edit-lease-bar">
          <span className="member-avatar is-online">
            {initialSnapshot.editLeases[0]?.editorInitials}
          </span>
          <div>
            <strong>{initialSnapshot.editLeases[0]?.editorName} edytuje teraz</strong>
            <span>{initialSnapshot.editLeases[0]?.resourceLabel}</span>
          </div>
          <small>Blokada wygasa {initialSnapshot.editLeases[0]?.expiresLabel}</small>
        </section>

        <div className="history-layout">
          <section className="panel history-log-panel">
            <header className="panel-header history-log-heading">
              <div>
                <span className="section-kicker">Zapis działań</span>
                <h2>Historia zespołu</h2>
              </div>
              <span className="history-result-count">{entries.length} wpisów</span>
            </header>

            <div className="history-filters">
              <label className="history-search">
                <span>Szukaj w historii</span>
                <div>
                  <Icon name="search" size={15} />
                  <input
                    onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                    placeholder="np. tarcza, set Wojna…"
                    type="search"
                    value={filters.query}
                  />
                </div>
              </label>
              <label>
                <span>Rodzaj zmiany</span>
                <select
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      resource: event.target.value as TeamHistoryFilters['resource'],
                    })
                  }
                  value={filters.resource}
                >
                  <option value="all">Wszystkie</option>
                  {Object.entries(resourceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Osoba</span>
                <select
                  onChange={(event) => setFilters({ ...filters, actorId: event.target.value })}
                  value={filters.actorId}
                >
                  <option value="all">Wszyscy</option>
                  {actors.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Postać</span>
                <select
                  onChange={(event) => setFilters({ ...filters, characterId: event.target.value })}
                  value={filters.characterId}
                >
                  <option value="all">Wszystkie</option>
                  {characters.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {entries.length > 0 ? (
              <div className="history-timeline">
                {entries.map((entry) => (
                  <article className={`history-timeline-entry is-${entry.resource}`} key={entry.id}>
                    <span className="history-timeline-icon">
                      <Icon name={resourceIcons[entry.resource]} size={17} />
                    </span>
                    <div className="history-timeline-copy">
                      <div>
                        <strong>{entry.title}</strong>
                        <time>{entry.occurredAtLabel}</time>
                      </div>
                      <p>{entry.detail}</p>
                      <footer>
                        <span className="member-avatar">{entry.actorInitials}</span>
                        <span>{entry.actorName}</span>
                        {entry.characterName && <em>{entry.characterName}</em>}
                        <small>wersja {entry.revision}</small>
                      </footer>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="history-empty-state">
                <Icon name="history" size={24} />
                <strong>Brak pasujących zmian</strong>
                <span>Zmień filtry lub wyszukiwaną frazę.</span>
              </div>
            )}
          </section>

          <aside className="history-side-column">
            <section className="panel conflict-panel">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Ochrona zmian</span>
                  <h2>Konflikt wersji</h2>
                </div>
                {!conflictResolved && initialSnapshot.conflict && (
                  <span className="count-badge">1</span>
                )}
              </header>
              {!conflictResolved && initialSnapshot.conflict ? (
                <div className="conflict-content">
                  <p className="conflict-explanation">
                    W czasie Twojej edycji{' '}
                    <strong>{initialSnapshot.conflict.serverActorName}</strong> zapisał nowszą
                    zmianę. Nic nie zostało nadpisane.
                  </p>
                  <div className="conflict-resource">
                    <span>{initialSnapshot.conflict.characterName}</span>
                    <strong>{initialSnapshot.conflict.resourceLabel}</strong>
                  </div>
                  <div className="conflict-comparison">
                    <article className="is-local">
                      <span>Twój zachowany szkic</span>
                      <strong>{initialSnapshot.conflict.localDraft}</strong>
                      <small>wersja oczekiwana {initialSnapshot.conflict.expectedRevision}</small>
                    </article>
                    <article className="is-server">
                      <span>Najnowsza wersja zespołu</span>
                      <strong>{initialSnapshot.conflict.serverValue}</strong>
                      <small>wersja {initialSnapshot.conflict.serverRevision}</small>
                    </article>
                  </div>
                  <div className="conflict-actions">
                    <button onClick={() => resolveConflict('preserve_draft')} type="button">
                      Zachowaj mój szkic
                    </button>
                    <button onClick={() => resolveConflict('accept_server')} type="button">
                      Wczytaj najnowszą wersję
                    </button>
                  </div>
                  <small className="conflict-hint">
                    Zachowanie szkicu nie publikuje go automatycznie. Najpierw zobaczysz ponowne
                    porównanie.
                  </small>
                </div>
              ) : (
                <div className="conflict-resolved">
                  <Icon name="check" size={22} />
                  <strong>Konflikt obsłużony</strong>
                  <p>{announcement}</p>
                </div>
              )}
            </section>

            <section className="panel collaboration-rules">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Wspólna praca</span>
                  <h2>Co chroni dane</h2>
                </div>
              </header>
              <ul>
                <li>
                  <Icon name="check" size={14} /> Każdy zapis ma osobę, czas i wersję.
                </li>
                <li>
                  <Icon name="check" size={14} /> Cudze zmiany nie nadpisują szkicu po cichu.
                </li>
                <li>
                  <Icon name="check" size={14} /> Utrata połączenia nie udaje udanego zapisu.
                </li>
                <li>
                  <Icon name="check" size={14} /> Utrata dostępu natychmiast zatrzymuje
                  synchronizację.
                </li>
              </ul>
            </section>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div className="mock-notice">
          Interfejs produkcyjny · dane demonstracyjne z adaptera. Realtime zastąpi adapter, ale nie
          zmieni reguł konfliktu i historii.
        </div>
      </main>
    </AppShell>
  );
}
