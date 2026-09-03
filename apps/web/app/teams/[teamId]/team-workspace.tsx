'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { characterClassLabels } from '../../../src/character-profile';
import { equipmentSlots, getSlotReadiness } from '../../../src/player-store';
import { usePlayerStore } from '../../../src/player-store-react';
import { AppShell, Icon } from '../../app-shell';
import { DiscordEntryScreen } from '../../discord-entry';

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

  const summary = useMemo(() => {
    if (!workspace) return null;
    const incompleteSets = workspace.characters.filter((character) => {
      const set = character.sets.find((entry) => entry.id === character.activeSetId);
      if (!set) return true;
      return equipmentSlots.some((slot) => {
        const readiness = getSlotReadiness(workspace, character, set, slot);
        return readiness !== 'ready' && set.assignments[slot] !== null;
      });
    }).length;
    return {
      totalCharacters: workspace.characters.length,
      readyTasks: workspace.tasks.filter((task) => task.status === 'ready').length,
      incompleteSets,
      memberCount: workspace.members.length,
    };
  }, [workspace]);

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

  if (!workspace || !summary) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="team-workspace" id="main-content">
          <section className="panel">
            <h1>Nie znaleziono przestrzeni</h1>
            <p>ID „{teamId}” nie istnieje w lokalnym store.</p>
            <a href="/">Wróć na pulpit</a>
          </section>
        </main>
      </AppShell>
    );
  }

  const isSolo = workspace.members.length === 1;

  const handleNoteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!writesEnabled) return;
    addNote(workspace.id, noteDraft);
    setNoteDraft('');
    setAnnouncement('Notatka zapisana w przestrzeni.');
  };

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="team-workspace" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href="/">Przestrzenie</a>
          <Icon name="chevron" size={13} />
          <strong>{workspace.name}</strong>
        </nav>

        <section className="workspace-hero">
          <div className="workspace-hero-copy">
            <span className="eyebrow">{isSolo ? 'Moja przestrzeń' : 'Przestrzeń zespołu'}</span>
            <h1>{workspace.name}</h1>
            <p>{workspace.description}</p>
            <div className="workspace-sync">
              <strong>
                {workspace.members.length} {workspace.members.length === 1 ? 'osoba' : 'osób'}
              </strong>
              <span>Zapis lokalny · {workspace.updatedLabel}</span>
            </div>
          </div>
          <div className="workspace-member-fan" aria-label="Członkowie przestrzeni">
            {workspace.members.map((member) => (
              <span className="member-avatar is-unknown" key={member.id} title={member.displayName}>
                {member.initials}
              </span>
            ))}
          </div>
        </section>

        <nav aria-label="Sekcje przestrzeni" className="workspace-tabs">
          <a aria-current="page" href={`/teams/${workspace.id}`}>
            Przegląd
          </a>
          <a href={`/teams/${workspace.id}#characters`}>Postacie</a>
          <a href={`/teams/${workspace.id}#tasks`}>Akcje zespołu</a>
          <a href={`/teams/${workspace.id}#notes`}>Notatki</a>
          <a href={`/teams/${workspace.id}/members`}>Członkowie</a>
          <a href={`/teams/${workspace.id}/history`}>Historia</a>
        </nav>

        <section aria-label="Podsumowanie" className="workspace-metrics">
          <article>
            <strong>{summary.totalCharacters}</strong>
            <span>postacie</span>
          </article>
          <article>
            <strong>{summary.readyTasks}</strong>
            <span>gotowe akcje</span>
          </article>
          <article>
            <strong>{summary.incompleteSets}</strong>
            <span>sety do sprawdzenia</span>
          </article>
          <article>
            <strong>{summary.memberCount}</strong>
            <span>członków</span>
          </article>
        </section>

        <section className="workspace-grid">
          <section className="panel" id="characters">
            <header>
              <h2>Postacie i sety</h2>
              <a className="primary-button" href={`/teams/${workspace.id}/characters/new`}>
                <Icon name="plus" size={16} /> Dodaj postać
              </a>
            </header>
            {workspace.characters.length === 0 ? (
              <div className="empty-workspace">
                <h3>Dodaj pierwszą postać</h3>
                <p>Nazwa i klasa wystarczą. EQ i timery dodasz na karcie postaci.</p>
                <a className="primary-button" href={`/teams/${workspace.id}/characters/new`}>
                  Dodaj postać
                </a>
              </div>
            ) : (
              <div className="character-cards">
                {workspace.characters.map((character) => {
                  const set =
                    character.sets.find((entry) => entry.id === character.activeSetId) ??
                    character.sets[0];
                  const confirmed = set
                    ? equipmentSlots.filter(
                        (slot) => getSlotReadiness(workspace, character, set, slot) === 'ready',
                      ).length
                    : 0;
                  const readyTimers = workspace.timers.filter(
                    (timer) => timer.characterId === character.id && timer.status === 'ready',
                  ).length;
                  const nextTimer = workspace.timers.find(
                    (timer) => timer.characterId === character.id,
                  );
                  return (
                    <article key={character.id}>
                      <div className="character-card-visual">
                        {character.imagePath ? (
                          <img alt="" src={character.imagePath} />
                        ) : (
                          <span className="missing-render">Brak zatwierdzonego renderu</span>
                        )}
                      </div>
                      <div className="character-card-copy">
                        <h3>{character.name}</h3>
                        <p>
                          {characterClassLabels[character.characterClass]}
                          {character.level ? ` · poziom ${character.level}` : ''}
                        </p>
                        <small>
                          Set {set?.name ?? 'brak'} · {confirmed}/8 slotów na tej postaci
                        </small>
                        <small>
                          {readyTimers > 0
                            ? readyTimers === 1
                              ? '1 timer gotowy'
                              : readyTimers < 5
                                ? `${readyTimers} timery gotowe`
                                : `${readyTimers} timerów gotowych`
                            : (nextTimer?.remainingLabel ?? 'Brak timerów')}
                        </small>
                        <a href={`/teams/${workspace.id}/characters/${character.id}`}>
                          Otwórz kartę EQ
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
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

          <section className="panel" id="notes">
            <header>
              <h2>Notatki przestrzeni</h2>
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

          <aside className="panel">
            <header>
              <h2>Członkowie</h2>
              <a href={`/teams/${workspace.id}/members`}>Zarządzaj członkami</a>
            </header>
            <ul className="member-list">
              {workspace.members.map((member) => (
                <li key={member.id}>
                  <span className="member-avatar">{member.initials}</span>
                  <div>
                    <strong>{member.displayName}</strong>
                    <small>
                      {member.role === 'owner' ? 'Właściciel' : 'Członek'} · obecność live wyłączona
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {announcement ? <p className="entry-status">{announcement}</p> : null}
        <div className="mock-notice">
          Zmiany z tej przestrzeni zapisują się lokalnie i w dzienniku historii. Przypomnienia
          Discord wrócą z botem.
        </div>
      </main>
    </AppShell>
  );
}
