'use client';

import { useState } from 'react';

import { getReadyTimers } from '../src/player-store';
import { usePlayerStore } from '../src/player-store-react';
import { AppShell, Icon } from './app-shell';
import { DiscordEntryScreen } from './discord-entry';

export function MemberDashboard() {
  const { state, hydrated, createWorkspace, loadDemo, writesEnabled } = usePlayerStore();
  const [workspaceName, setWorkspaceName] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

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
    lastWorkspace?.characters.find(
      (character) => character.id === state.lastOpenedCharacterId,
    ) ?? null;
  const isFirstUse = state.workspaces.length === 0;

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
  };

  return (
    <AppShell activeSection="dashboard" viewerName={state.viewer.displayName}>
      <main className="account-dashboard" id="main-content">
        <section className="account-hero">
          <div className="account-hero-copy">
            <span className="eyebrow">Centrum gracza</span>
            <h1>Witaj, {state.viewer.displayName}</h1>
            <p>
              Co wymaga uwagi, gdzie byłeś ostatnio i co możesz zrobić dalej — bez udawania żywego
              syncu Discord/API.
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
                Sesja lokalna · {state.connection === 'connected' ? 'zapis w tej przeglądarce' : state.connection}
              </span>
            </div>
          </div>
        </section>

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
                <button className="secondary-button" onClick={loadDemo} type="button">
                  Wczytaj przykładowe Asteria (demo)
                </button>
              </div>
              {createdId ? (
                <p className="entry-status">
                  Utworzono.{' '}
                  <a href={`/teams/${createdId}`}>Otwórz przestrzeń i dodaj pierwszą postać</a>
                </p>
              ) : null}
            </div>
            <aside>
              <h3>Albo zaakceptuj zaproszenie</h3>
              {state.pendingIncomingInvitations.length === 0 ? (
                <p>Brak oczekujących zaproszeń w tej sesji.</p>
              ) : (
                <ul className="invite-list">
                  {state.pendingIncomingInvitations.map((invitation) => (
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
                <span>{readyTimers.length} gotowych timerów</span>
              </header>
              {readyTimers.length === 0 ? (
                <p className="empty-copy">Brak gotowych timerów w dostępnych przestrzeniach.</p>
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
                      {lastWorkspace.members.length === 1 ? 'Moja przestrzeń' : 'Przestrzeń zespołu'} ·{' '}
                      {lastWorkspace.characters.length} postaci
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
                <p className="empty-copy">Nie otwarto jeszcze przestrzeni w tej sesji.</p>
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
                        {workspace.members.length === 1 ? 'Solo' : `${workspace.members.length} członków`}{' '}
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
            </section>

            <section className="panel">
              <header>
                <h2>Ostatnie zmiany</h2>
              </header>
              {recentHistory.length === 0 ? (
                <p className="empty-copy">Historia pojawi się po pierwszej zmianie.</p>
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
          Podgląd lokalny first-slice · dane w localStorage tej przeglądarki. Discord OAuth, API,
          realtime i bot nie są jeszcze podpięte. Mapy / Targ / Aktywność są celowo poza nawigacją.
        </div>
      </main>
    </AppShell>
  );
}
