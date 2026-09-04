'use client';

import { useState } from 'react';

import { usePlayerStore } from '../src/player-store-react';
import { AppShell } from './app-shell';
import { DiscordEntryScreen } from './discord-entry';


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

  const lastWorkspace =
    state.workspaces.find((workspace) => workspace.id === state.lastOpenedWorkspaceId) ??
    state.workspaces[0];
  const isFirstUse = state.workspaces.length === 0;
  const pendingInvites = (state.pendingIncomingInvitations ?? []).filter(
    (entry) => entry.status === 'pending',
  );

  const onCreateWorkspace = () => {
    if (!writesEnabled) return;
    const trimmed = workspaceName.trim();
    if (trimmed.length < 2) {
      setCreateError('Podaj nazwę zespołu (min. 2 znaki).');
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
              Konto i pierwsze uruchomienie. Notatki, zmiany i akcje zespołu są w{' '}
              <strong>Zespół</strong>; EQ na kartach w <strong>Postacie</strong>.
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
            Utworzono zespół.{' '}
            <a href={`/teams/${createdId}`}>Otwórz Zespół</a>
            {' · '}
            <a href="/characters">Dodaj postać</a>
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
              <h2>Utwórz swój zespół</h2>
              <p>
                Solo i grupa używają tego samego modelu. Na start wystarczy nazwa. Postacie dodasz w
                module Postacie.
              </p>
              <label className="field">
                <span>Nazwa zespołu</span>
                <input
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="np. Asteria"
                  value={workspaceName}
                />
              </label>
              {createError ? <p className="field-error">{createError}</p> : null}
              <div className="first-use-actions">
                <button className="primary-button" onClick={onCreateWorkspace} type="button">
                  Utwórz zespół
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
                <h2>Twój zespół</h2>
              </header>
              {lastWorkspace ? (
                <div className="last-opened">
                  <p>
                    <strong>{lastWorkspace.name}</strong>
                    <small>
                      Notatki, zmiany i akcje · {lastWorkspace.updatedLabel}
                    </small>
                  </p>
                  <a className="primary-button" href={`/teams/${lastWorkspace.id}`}>
                    Otwórz zespół
                  </a>
                </div>
              ) : (
                <p className="empty-copy">Utwórz zespół, żeby tu wrócić.</p>
              )}
            </section>
            <section className="panel">
              <header>
                <h2>Postacie i EQ</h2>
              </header>
              <p className="empty-copy">
                Skład, kasowanie kart i ekwipunek są w osobnym module.
              </p>
              <a className="secondary-button" href="/characters">
                Otwórz postacie
              </a>
            </section>
          </section>
        )}

        <div className="mock-notice">
          Podgląd lokalny: dane zostają w tej przeglądarce. Discord OAuth, API i bot przyjdą
          później. Targ i Aktywność są celowo schowane; <a href="/timers">Timery</a> (metiny/bossy)
          są już dostępne.{' '}
          <button className="text-button" onClick={onLoadDemo} type="button">
            Wczytaj / odśwież demo Asteria
          </button>{' '}
          <button className="text-button" onClick={onResetSession} type="button">
            Wyczyść sesję lokalną
          </button>
        </div>
      </main>
    </AppShell>
  );
}
