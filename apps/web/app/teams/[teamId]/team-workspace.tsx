'use client';

import { useMemo, useState, type FormEvent } from 'react';

import {
  appendTeamNote,
  applyTeamTaskOutcome,
  getTeamWorkspaceSummary,
  type TeamNote,
  type TeamTask,
  type TeamTaskOutcome,
  type TeamWorkspaceSnapshot,
} from '../../../src/team-workspace';
import { AppShell, Icon } from '../../app-shell';

function taskStatusLabel(task: TeamTask): string {
  const labels: Record<TeamTask['status'], string> = {
    ready: task.dueLabel,
    upcoming: task.dueLabel,
    done: 'Zrobione',
    snoozed: 'Później',
    unavailable: 'Nie mogę',
  };
  return labels[task.status];
}

export function TeamWorkspace({ initialSnapshot }: { initialSnapshot: TeamWorkspaceSnapshot }) {
  const [tasks, setTasks] = useState(initialSnapshot.tasks);
  const [notes, setNotes] = useState(initialSnapshot.notes);
  const [noteDraft, setNoteDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const snapshot = useMemo(
    () => ({ ...initialSnapshot, tasks, notes }),
    [initialSnapshot, notes, tasks],
  );
  const summary = useMemo(() => getTeamWorkspaceSummary(snapshot), [snapshot]);

  const handleTaskOutcome = (task: TeamTask, outcome: TeamTaskOutcome) => {
    setTasks((current) => applyTeamTaskOutcome(current, task.id, outcome));
    const messages: Record<TeamTaskOutcome, string> = {
      done: `${task.title}: potwierdzono wykonanie.`,
      snoozed: `${task.title}: odłożono na później.`,
      unavailable: `${task.title}: zgłoszono brak możliwości wykonania.`,
    };
    setAnnouncement(messages[outcome]);
  };

  const handleNoteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note: TeamNote = {
      id: `local-note-${notes.length + 1}`,
      authorName: initialSnapshot.viewerName,
      body: noteDraft,
      createdLabel: 'teraz',
      pinned: false,
    };
    const nextNotes = appendTeamNote(notes, note);
    if (nextNotes === notes) return;
    setNotes(nextNotes);
    setNoteDraft('');
    setAnnouncement('Notatka została dodana do przestrzeni zespołu.');
  };

  return (
    <AppShell activeSection="teams" viewerName={initialSnapshot.viewerName}>
      <main className="team-workspace" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <span>Zespoły</span>
          <Icon name="chevron" size={13} />
          <strong>{initialSnapshot.teamName}</strong>
        </nav>

        <section className="workspace-hero">
          <div className="workspace-hero-copy">
            <span className="eyebrow">Przestrzeń zespołu</span>
            <h1>{initialSnapshot.teamName}</h1>
            <p>{initialSnapshot.teamDescription}</p>
            <div className="workspace-sync">
              <span className="live-dot" />
              <strong>{summary.onlineMembers} osoby online</strong>
              <span>Stan zespołu odświeżony {initialSnapshot.lastSynchronizedLabel}</span>
            </div>
          </div>
          <div className="workspace-member-fan" aria-label="Członkowie przestrzeni">
            {initialSnapshot.members.map((member) => (
              <span
                className={`member-avatar is-${member.state}`}
                key={member.id}
                title={member.displayName}
              >
                {member.initials}
              </span>
            ))}
          </div>
        </section>

        <nav aria-label="Sekcje zespołu" className="workspace-tabs">
          <a aria-current="page" href="#overview">
            Przegląd
          </a>
          <a href="#characters">Postacie</a>
          <a href="#tasks">Akcje i timery</a>
          <a href="#notes">Notatki</a>
          <button disabled type="button">
            Historia
          </button>
        </nav>

        <section aria-label="Podsumowanie przestrzeni" className="workspace-metrics" id="overview">
          <article>
            <Icon name="character" />
            <div>
              <strong>{summary.totalCharacters}</strong>
              <span>postacie</span>
            </div>
            <small>wspólnie prowadzone</small>
          </article>
          <article>
            <Icon name="clock" />
            <div>
              <strong>{summary.readyTasks}</strong>
              <span>gotowe akcje</span>
            </div>
            <small>czekają na człowieka</small>
          </article>
          <article>
            <Icon name="equipment" />
            <div>
              <strong>{summary.incompleteSets}</strong>
              <span>niepełne sety</span>
            </div>
            <small>wymagają sprawdzenia</small>
          </article>
          <article>
            <Icon name="team" />
            <div>
              <strong>{summary.onlineMembers}</strong>
              <span>osoby online</span>
            </div>
            <small>na Discordzie</small>
          </article>
        </section>

        <div className="workspace-grid">
          <div className="workspace-main-column">
            <section className="panel workspace-characters-panel" id="characters">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Wspólne postacie</span>
                  <h2>Stan postaci i zestawów</h2>
                </div>
                <button className="secondary-button" disabled type="button">
                  <Icon name="plus" size={15} /> Dodaj postać
                </button>
              </header>
              <div className="workspace-character-list">
                {initialSnapshot.characters.map((character) => {
                  const setComplete = character.equipmentConfirmed === character.equipmentCapacity;
                  const progress = Math.round(
                    (character.equipmentConfirmed / character.equipmentCapacity) * 100,
                  );
                  return (
                    <article className="workspace-character-row" key={character.id}>
                      <div className="workspace-character-figure">
                        <img
                          alt={`${character.classLabel} — ${character.name}`}
                          src={character.imagePath}
                        />
                      </div>
                      <div className="workspace-character-copy">
                        <div className="workspace-character-heading">
                          <div>
                            <span>
                              {character.classLabel} · poziom {character.level}
                            </span>
                            <h3>{character.name}</h3>
                          </div>
                          {character.collaboratorLabel && (
                            <span className="collaborator-pill">
                              <span className="live-dot" /> {character.collaboratorLabel}
                            </span>
                          )}
                        </div>
                        <p>
                          Prowadzi: <strong>{character.responsibleMember}</strong>
                        </p>
                        <div className="set-progress-heading">
                          <span>Set: {character.activeSetName}</span>
                          <strong className={setComplete ? 'is-complete' : ''}>
                            {character.equipmentConfirmed}/{character.equipmentCapacity}{' '}
                            potwierdzone
                          </strong>
                        </div>
                        <div
                          aria-label={`Kompletność zestawu ${progress}%`}
                          className="set-progress-track"
                        >
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <div className="workspace-character-actions">
                          <span
                            className={
                              character.readyTimers > 0 ? 'timer-chip is-ready' : 'timer-chip'
                            }
                          >
                            <Icon name="clock" size={14} /> {character.nextTimerLabel}
                          </span>
                          <button disabled type="button">
                            Otwórz kartę EQ
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="panel workspace-tasks-panel" id="tasks">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Wspólne ustalenia</span>
                  <h2>Akcje zespołu</h2>
                </div>
                <span className="count-badge">{summary.readyTasks}</span>
              </header>
              <div className="workspace-task-list">
                {tasks.map((task) => (
                  <article className={`workspace-task is-${task.source}`} key={task.id}>
                    <span className="workspace-task-icon">
                      <Icon
                        name={
                          task.source === 'equipment'
                            ? 'equipment'
                            : task.source === 'timer'
                              ? 'clock'
                              : 'team'
                        }
                      />
                    </span>
                    <div className="workspace-task-copy">
                      <div className="workspace-task-heading">
                        <div>
                          <strong>{task.title}</strong>
                          <span>
                            {task.characterName} · {task.assigneeName}
                          </span>
                        </div>
                        <span className={`status-pill is-${task.status}`}>
                          {taskStatusLabel(task)}
                        </span>
                      </div>
                      <p>{task.detail}</p>
                      {task.status === 'ready' && (
                        <div className="action-controls">
                          <button
                            className="text-button is-confirm"
                            onClick={() => handleTaskOutcome(task, 'done')}
                            type="button"
                          >
                            <Icon name="check" size={15} /> Zrobione
                          </button>
                          <button
                            className="text-button"
                            onClick={() => handleTaskOutcome(task, 'snoozed')}
                            type="button"
                          >
                            <Icon name="clock" size={15} /> Później
                          </button>
                          <button
                            className="text-button"
                            onClick={() => handleTaskOutcome(task, 'unavailable')}
                            type="button"
                          >
                            Nie mogę
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="workspace-side-column">
            <section className="panel workspace-members-panel">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Dostęp</span>
                  <h2>Członkowie</h2>
                </div>
                <button
                  aria-label="Zarządzaj członkami"
                  className="quiet-icon-button"
                  disabled
                  type="button"
                >
                  <Icon name="settings" size={16} />
                </button>
              </header>
              <div className="workspace-member-list">
                {initialSnapshot.members.map((member) => (
                  <div className="workspace-member-row" key={member.id}>
                    <span className={`member-avatar is-${member.state}`}>{member.initials}</span>
                    <div>
                      <strong>{member.displayName}</strong>
                      <span>{member.roleLabel}</span>
                    </div>
                    <span className={`presence is-${member.state}`}>
                      {member.state === 'online'
                        ? 'online'
                        : member.state === 'away'
                          ? 'zaraz wracam'
                          : 'offline'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel workspace-notes-panel" id="notes">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Pamięć zespołu</span>
                  <h2>Notatki</h2>
                </div>
                <Icon name="note" size={17} />
              </header>
              <form className="team-note-form" onSubmit={handleNoteSubmit}>
                <label htmlFor="team-note">Nowa notatka</label>
                <textarea
                  id="team-note"
                  maxLength={280}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Zapisz krótką informację dla zespołu…"
                  rows={3}
                  value={noteDraft}
                />
                <div>
                  <small>{noteDraft.length}/280</small>
                  <button disabled={noteDraft.trim().length === 0} type="submit">
                    Dodaj notatkę
                  </button>
                </div>
              </form>
              <div className="team-note-list">
                {notes.map((note) => (
                  <article
                    className={note.pinned ? 'team-note is-pinned' : 'team-note'}
                    key={note.id}
                  >
                    <div>
                      <strong>{note.authorName}</strong>
                      <time>{note.createdLabel}</time>
                    </div>
                    <p>{note.body}</p>
                    {note.pinned && <span>Przypięta</span>}
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div className="mock-notice">
          Interfejs produkcyjny · dane demonstracyjne z adaptera. API, realtime i Discord zastąpią
          adapter bez zmiany logiki tego widoku.
        </div>
      </main>
    </AppShell>
  );
}
