'use client';

import { useState } from 'react';

import { getReadyTimers } from '../src/player-store';
import { usePlayerStore } from '../src/player-store-react';
import { AppShell, Icon } from './app-shell';
import { DiscordEntryScreen } from './discord-entry';

function readyTimerLabel(count: number): string {
  if (count === 1) return '1 gotowy timer';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} gotowe timery`;
  }
  return `${count} gotowych timerów`;
}

export function MemberDashboard() {
  const { state, hydrated, createWorkspace, loadDemo, resetStore, writesEnabled } =
    usePlayerStore();
  const [workspaceName, setWorkspaceName] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  if (!hydrated) {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Ładowanie sesji…</p>
      </main>
    );
  }

  if (state.authStatus !== 'authenticated' || !state.viewer) {
    return <DiscordEntryScreen />;
  }

  const readyTimers = getReadyTimers(state);
  const recentHistory = state.workspaces
    .flatMap((workspace) =>
      workspace.history.slice(0, 3).map((entry) => ({
        ...entry,
        workspaceName: workspace.name,
        workspaceId: workspace.id,
      })),
    )
    .slice(0, 5);
  const lastWorkspace = state.workspaces.find(
    (workspace) => workspace.id === state.lastOpenedWorkspaceId,
  );
  const lastCharacter =
    lastWorkspace?.characters.find((character) => character.id === state.lastOpenedCharacterId) ??
    null;
  const isFirstUse = state.workspaces.length === 0;
  const pendingInvites = state.pendingIncomingInvitations.filter(
    (entry) => entry.status === 'pending',
  );

  const onCreateWorkspace = () => {
    if (!writesEnabled) return;
    const trimmed = workspaceName.trim();
    if (trimmed.length < 2) {
      setCreateError('Podaj nazwę przestrzeni (min. 2 znaki).');
      return;
    }
    const id = createWorkspace(trimmed);
    setCreateError(null);
    setCreatedId(id);
    setWorkspaceName('');
    setSessionNotice(null);
  };

  const onLoadDemo = () => {
    if (!writesEnabled) return;
    if (state.workspaces.length > 0) {
      const ok = window.confirm(
        'Wczytać demo Asteria? Istniejące przestrzenie zostaną zachowane; Asteria zostanie odświeżona.',
      );
      if (!ok) return;
      loadDemo({ replace: false });
    } else {
      loadDemo({ replace: true });
    }
    setCreatedId(null);
    setSessionNotice('Wczytano demo Asteria.');
  };

  const onResetSession = () => {
    const ok = window.confirm(
      'Wyczyścić lokalną sesję? Usunie przestrzenie, EQ i timery z tej przeglądarki.',
    );
    if (!ok) return;
    resetStore();
  };

  return (
    <AppShell activeSection="dashboard" viewerName={state.viewer.displayName}>
      <main className="account-dashboard" id="main-content">
        <section className="account-hero">
          <div className="account-hero-copy">
            <span className="eyebrow">Centrum gracza</span>
            <h1>Witaj, {state.viewer.displayName}</h1>
            <p>
              Timery gotowe do oddania, ostatnia przestrzeń i co zmienił zespół — w jednym miejscu.
            </p>
          </div>
          <div className="account-identity-card">
            <span className="profile-avatar">
              {state.viewer.discordDisplayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <small>Konto Discord</small>
              <strong>{state.viewer.discordDisplayName}</strong>
              <span>
                Sesja lokalna ·{' '}
                {state.connection === 'connected' ? 'zapis w tej przeglądarce' : state.connection}
              </span>
            </div>
          </div>
        </section>

        {createdId ? (
          <p className="entry-status" role="status">
            Utworzono przestrzeń. <a href={`/teams/${createdId}`}>Otwórz i dodaj pierwszą postać</a>
          </p>
        ) : null}
        {sessionNotice ? (
          <p className="entry-status" role="status">
            {sessionNotice} <a href="/teams/asteria">Otwórz Asteria</a>
          </p>
        ) : null}

        {isFirstUse ? (
          <section className="first-use-panel" id="first-use">
            <div>
              <span className="eyebrow">Pierwsze uruchomienie</span>
              <h2>Utwórz swoją przestrzeń</h2>
              <p>
                Solo i zespół używają tego samego modelu. Na start wystarczy nazwa. Potem dodasz
                pierwszą postać.
              </p>
              <label className="field">
                <span>Nazwa przestrzeni</span>
                <input
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="np. Moja przestrzeń"
                  value={workspaceName}
                />
              </label>
              {createError ? <p className="field-error">{createError}</p> : null}
              <div className="first-use-actions">
                <button className="primary-button" onClick={onCreateWorkspace} type="button">
                  Utwórz przestrzeń
                </button>
                <button className="secondary-button" onClick={onLoadDemo} type="button">
                  Wczytaj przykładowe Asteria (demo)
                </button>
              </div>
            </div>
            <aside>
              <h3>Albo zaakceptuj zaproszenie</h3>
              {pendingInvites.length === 0 ? (
                <p>Brak oczekujących zaproszeń w tej sesji.</p>
              ) : (
                <ul className="invite-list">
                  {pendingInvites.map((invitation) => (
                    <li key={invitation.id}>
                      <strong>{invitation.teamName}</strong>
                      <span>od {invitation.inviterName}</span>
                      <a href={`/invitations/${invitation.id}`}>Otwórz zaproszenie</a>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </section>
        ) : (
          <section className="account-dashboard-grid home-priorities">
            <section className="panel">
              <header>
                <h2>Wymaga uwagi</h2>
                <span>{readyTimerLabel(readyTimers.length)}</span>
              </header>
              {pendingInvites.length > 0 ? (
                <ul className="attention-list" style={{ marginBottom: 12 }}>
                  {pendingInvites.map((invitation) => (
                    <li key={invitation.id}>
                      <div>
                        <strong>Zaproszenie: {invitation.teamName}</strong>
                        <small>od {invitation.inviterName}</small>
                      </div>
                      <a href={`/invitations/${invitation.id}`}>Otwórz</a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {readyTimers.length === 0 ? (
                <p className="empty-copy">
                  {pendingInvites.length > 0
                    ? 'Brak gotowych timerów do oddania.'
                    : 'Nic nie czeka na oddanie.'}
                </p>
              ) : (
                <ul className="attention-list">
                  {readyTimers.map((entry) => (
                    <li key={entry.timer.id}>
                      <div>
                        <strong>{entry.timer.label}</strong>
                        <small>
                          {entry.characterName} · {entry.workspaceName}
                        </small>
                      </div>
                      <a href={`/teams/${entry.workspaceId}/characters/${entry.timer.characterId}`}>
                        Otwórz
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <header>
                <h2>Ostatnio używane</h2>
              </header>
              {lastWorkspace ? (
                <div className="last-opened">
                  <p>
                    <strong>{lastWorkspace.name}</strong>
                    <small>
                      {lastWorkspace.members.length === 1
                        ? 'Moja przestrzeń'
                        : 'Przestrzeń zespołu'}{' '}
                      · {lastWorkspace.characters.length} postaci
                    </small>
                  </p>
                  {lastCharacter ? (
                    <a href={`/teams/${lastWorkspace.id}/characters/${lastCharacter.id}`}>
                      Wróć do {lastCharacter.name}
                    </a>
                  ) : (
                    <a href={`/teams/${lastWorkspace.id}`}>Otwórz przestrzeń</a>
                  )}
                </div>
              ) : (
                <p className="empty-copy">Wejdź w przestrzeń, żeby tu wrócić.</p>
              )}
            </section>

            <section className="panel">
              <header>
                <h2>Moje przestrzenie</h2>
                <span>{state.workspaces.length}</span>
              </header>
              <ul className="workspace-list">
                {state.workspaces.map((workspace) => (
                  <li key={workspace.id}>
                    <div>
                      <strong>{workspace.name}</strong>
                      <small>
                        {workspace.members.length === 1
                          ? 'Solo'
                          : `${workspace.members.length} członków`}{' '}
                        · {workspace.updatedLabel}
                      </small>
                    </div>
                    <a className="primary-button" href={`/teams/${workspace.id}`}>
                      Otwórz
                    </a>
                  </li>
                ))}
              </ul>
              <div className="inline-create">
                <input
                  aria-label="Nazwa nowej przestrzeni"
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Nowa przestrzeń…"
                  value={workspaceName}
                />
                <button onClick={onCreateWorkspace} type="button">
                  <Icon name="plus" size={16} /> Utwórz
                </button>
              </div>
              {createError ? <p className="field-error">{createError}</p> : null}
              <div className="first-use-actions" style={{ marginTop: 12 }}>
                <button className="secondary-button" onClick={onLoadDemo} type="button">
                  Wczytaj / odśwież demo Asteria
                </button>
              </div>
            </section>

            <section className="panel">
              <header>
                <h2>Ostatnie zmiany</h2>
              </header>
              {recentHistory.length === 0 ? (
                <p className="empty-copy">Po pierwszej zmianie w EQ lub timerze pojawi się wpis.</p>
              ) : (
                <ul className="attention-list">
                  {recentHistory.map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <strong>{entry.title}</strong>
                        <small>
                          {entry.workspaceName} · {entry.actorName} · {entry.occurredAtLabel}
                        </small>
                      </div>
                      <a href={`/teams/${entry.workspaceId}/history`}>Historia</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>
        )}

        <div className="mock-notice">
          Podgląd lokalny: dane zostają w tej przeglądarce. Discord OAuth, API i bot przyjdą
          później. Targ i Aktywność są celowo schowane; <a href="/maps">Mapy</a> są już dostępne.{' '}
          <button className="text-button" onClick={onResetSession} type="button">
            Wyczyść sesję lokalną
          </button>
        </div>
      </main>
    </AppShell>
  );
}
