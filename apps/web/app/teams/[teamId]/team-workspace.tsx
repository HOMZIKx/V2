'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { getReadyTimers } from '../../../src/player-store';
import { usePlayerStore } from '../../../src/player-store-react';
import {
  progressionTimerIcons,
  progressionTimerLabels,
} from '../../../src/project-hard-progression';
import { AppShell, Icon } from '../../app-shell';
import { DiscordEntryScreen } from '../../discord-entry';
import { WorkspaceSectionNav } from './workspace-section-nav';

function taskStatusLabel(status: string, dueLabel: string): string {
  if (status === 'done') return 'Zrobione';
  if (status === 'snoozed') return 'Później';
  if (status === 'unavailable') return 'Nie mogę';
  return dueLabel;
}

export function TeamWorkspace() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const { state, hydrated, openWorkspace, applyTaskOutcome, addNote, writesEnabled } =
    usePlayerStore();
  const [noteDraft, setNoteDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const workspace = state.workspaces.find((entry) => entry.id === teamId) ?? null;

  useEffect(() => {
    if (workspace) openWorkspace(workspace.id);
  }, [workspace, openWorkspace]);

  const livingCharacters = useMemo(
    () => workspace?.characters.filter((character) => !character.archived) ?? [],
    [workspace],
  );

  const readyTimers = useMemo(
    () => (workspace ? getReadyTimers(state).filter((entry) => entry.workspaceId === workspace.id) : []),
    [state, workspace],
  );

  const recentHistory = useMemo(() => workspace?.history.slice(0, 8) ?? [], [workspace]);

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
        <main className="team-workspace" id="main-content">
          <section className="panel">
            <h1>Nie znaleziono zespołu</h1>
            <p>ID „{teamId}” nie istnieje w lokalnym store.</p>
            <a href="/">Wróć na pulpit</a>
          </section>
        </main>
      </AppShell>
    );
  }

  const isSolo = workspace.members.length === 1;
  const openTasks = workspace.tasks.filter(
    (task) => task.status === 'ready' || task.status === 'upcoming',
  );

  const handleNoteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!writesEnabled) return;
    addNote(workspace.id, noteDraft);
    setNoteDraft('');
    setAnnouncement('Notatka zapisana w zespole.');
  };

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="team-workspace" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <strong>Zespół</strong>
        </nav>

        <section className="workspace-hero">
          <div className="workspace-hero-copy">
            <span className="eyebrow">{isSolo ? 'Zespół (solo)' : 'Zespół'}</span>
            <h1>{workspace.name}</h1>
            <p>
              Notatki, zmiany i akcje w jednym miejscu. Postacie i EQ są w module{' '}
              <a href="/characters">Postacie</a>.
            </p>
            <div className="workspace-sync">
              <strong>
                {workspace.members.length} {workspace.members.length === 1 ? 'osoba' : 'osób'}
              </strong>
              <span>Zapis lokalny · {workspace.updatedLabel}</span>
            </div>
          </div>
          <div className="workspace-member-fan" aria-label="Członkowie zespołu">
            {workspace.members.map((member) => (
              <span className="member-avatar is-unknown" key={member.id} title={member.displayName}>
                {member.initials}
              </span>
            ))}
          </div>
        </section>

        {state.workspaces.length > 1 ? (
          <ul className="workspace-switcher" aria-label="Twoje zespoły">
            {state.workspaces.map((entry) => (
              <li key={entry.id}>
                <a
                  aria-current={entry.id === workspace.id ? 'page' : undefined}
                  href={`/teams/${entry.id}`}
                >
                  {entry.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <WorkspaceSectionNav active="overview" workspaceId={workspace.id} />

        <section aria-label="Podsumowanie" className="workspace-metrics">
          <article>
            <strong>{livingCharacters.length}</strong>
            <span>postacie</span>
          </article>
          <article>
            <strong>{readyTimers.length}</strong>
            <span>gotowe timery</span>
          </article>
          <article>
            <strong>{openTasks.length}</strong>
            <span>otwarte akcje</span>
          </article>
          <article>
            <strong>{workspace.members.length}</strong>
            <span>członków</span>
          </article>
        </section>

        <section className="workspace-grid">
          <section className="panel" id="changes">
            <header>
              <h2>Ostatnie zmiany</h2>
              <a href={`/teams/${workspace.id}/history`}>Pełna historia</a>
            </header>
            {recentHistory.length === 0 ? (
              <p className="empty-copy">Po pierwszej zmianie w EQ, składzie lub timerze pojawi się wpis.</p>
            ) : (
              <ul className="attention-list">
                {recentHistory.map((entry) => (
                  <li key={entry.id}>
                    <div className="attention-item-copy">
                      <strong className="attention-item-title">{entry.title}</strong>
                      <span className="attention-item-meta">
                        {entry.characterName ? `${entry.characterName} · ` : ''}
                        {entry.actorName} · {entry.occurredAtLabel}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <header>
              <h2>Wymaga uwagi</h2>
              <span>{readyTimers.length}</span>
            </header>
            {readyTimers.length === 0 ? (
              <p className="empty-copy">Brak gotowych timerów w tym zespole.</p>
            ) : (
              <ul className="attention-list">
                {readyTimers.slice(0, 8).map((entry) => {
                  const kindLabel =
                    entry.timer.kind && progressionTimerLabels[entry.timer.kind]
                      ? progressionTimerLabels[entry.timer.kind]
                      : entry.timer.label;
                  const iconPath =
                    entry.timer.iconPath ??
                    (entry.timer.kind ? progressionTimerIcons[entry.timer.kind] : null);
                  return (
                    <li key={entry.timer.id}>
                      <div className="attention-item-copy">
                        <strong className="attention-item-title">{entry.characterName}</strong>
                        <span className="attention-item-meta">{kindLabel}</span>
                      </div>
                      {iconPath ? (
                        <img alt="" className="attention-kind-icon" src={iconPath} />
                      ) : null}
                      <a
                        className="attention-item-action"
                        href={`/teams/${workspace.id}/characters/${entry.timer.characterId}?view=timers`}
                      >
                        Otwórz
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel" id="notes">
            <header>
              <h2>Notatki zespołu</h2>
            </header>
            <form className="note-form" onSubmit={handleNoteSubmit}>
              <label>
                Nowa notatka
                <textarea
                  maxLength={280}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  value={noteDraft}
                />
              </label>
              <button disabled={!writesEnabled || noteDraft.trim().length === 0} type="submit">
                Dodaj notatkę
              </button>
            </form>
            {workspace.notes.length === 0 ? (
              <p className="empty-copy">Brak notatek. Zostaw krótką informację dla zespołu.</p>
            ) : (
              <ul className="note-list">
                {workspace.notes.map((note) => (
                  <li key={note.id}>
                    <strong>{note.authorName}</strong>
                    <span>{note.createdAtLabel}</span>
                    <p>{note.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" id="tasks">
            <header>
              <h2>Akcje zespołu</h2>
            </header>
            {workspace.tasks.length === 0 ? (
              <p className="empty-copy">Brak otwartych akcji.</p>
            ) : (
              <div className="task-list">
                {workspace.tasks.map((task) => (
                  <article key={task.id}>
                    <div>
                      <h3>{task.title}</h3>
                      <p>{task.detail}</p>
                      <small>
                        {task.characterName} · {task.assigneeName} ·{' '}
                        {taskStatusLabel(task.status, task.dueLabel)}
                      </small>
                    </div>
                    {task.status === 'ready' || task.status === 'upcoming' ? (
                      <div className="task-actions">
                        <button
                          disabled={!writesEnabled}
                          onClick={() => {
                            applyTaskOutcome(workspace.id, task.id, 'done');
                            setAnnouncement(`${task.title}: potwierdzono wykonanie.`);
                          }}
                          type="button"
                        >
                          Zrobione
                        </button>
                        <button
                          disabled={!writesEnabled}
                          onClick={() => {
                            applyTaskOutcome(workspace.id, task.id, 'snoozed');
                            setAnnouncement(`${task.title}: odłożono na później.`);
                          }}
                          type="button"
                        >
                          Później
                        </button>
                        <button
                          disabled={!writesEnabled}
                          onClick={() => {
                            applyTaskOutcome(workspace.id, task.id, 'unavailable');
                            setAnnouncement(`${task.title}: zgłoszono brak możliwości.`);
                          }}
                          type="button"
                        >
                          Nie mogę
                        </button>
                      </div>
                    ) : (
                      <strong>{taskStatusLabel(task.status, task.dueLabel)}</strong>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="panel workspace-roster-panel">
            <header className="workspace-roster-header">
              <div>
                <h2>Członkowie</h2>
                <p>
                  {workspace.members.length === 1
                    ? '1 osoba w zespole'
                    : `${workspace.members.length} osób w zespole`}
                </p>
              </div>
              <a className="secondary-button" href={`/teams/${workspace.id}/members`}>
                Zarządzaj
              </a>
            </header>
            <ul className="workspace-roster">
              {workspace.members.map((member) => (
                <li key={member.id}>
                  <span className="member-avatar is-idle" aria-hidden>
                    {member.initials}
                  </span>
                  <div className="workspace-roster-copy">
                    <div className="workspace-roster-name">
                      <strong>{member.displayName}</strong>
                      <span
                        className={`workspace-role-pill${member.role === 'owner' ? ' is-owner' : ''}`}
                      >
                        {member.role === 'owner' ? 'Właściciel' : 'Członek'}
                      </span>
                    </div>
                    <small>Obecność na żywo — wyłączona</small>
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          <section className="panel">
            <header>
              <h2>Postacie</h2>
              <a href="/characters">Otwórz listę</a>
            </header>
            {livingCharacters.length === 0 ? (
              <p className="empty-copy">
                Skład jest pusty. Dodawanie i usuwanie postaci jest w module Postacie.
              </p>
            ) : (
              <p className="empty-copy">
                {livingCharacters.length === 1
                  ? '1 karta w składzie.'
                  : `${livingCharacters.length} kart w składzie.`}{' '}
                EQ i timery PH otwierasz z listy postaci.
              </p>
            )}
          </section>
        </section>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {announcement ? <p className="entry-status">{announcement}</p> : null}
        <div className="mock-notice">
          Zmiany z tego zespołu zapisują się lokalnie i w dzienniku historii. Przypomnienia Discord
          wrócą z botem.
        </div>
      </main>
    </AppShell>
  );
}
