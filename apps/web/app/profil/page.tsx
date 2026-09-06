'use client';

import { useEffect, useState } from 'react';

import { usePlayerStore } from '../../src/player-store-react';
import { AppShell } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';

export default function ProfilPage() {
  const { state, hydrated, writesEnabled, updateViewerProfile } = usePlayerStore();
  const [nick, setNick] = useState('');
  const [avatarNote, setAvatarNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.viewer) return;
    setNick(state.viewer.displayName ?? '');
    setAvatarNote(state.viewer.avatarNote ?? '');
  }, [state.viewer]);

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

  const onSave = () => {
    if (!writesEnabled) return;
    const trimmed = nick.trim();
    if (trimmed.length < 2) {
      setError('Podaj nick wyświetlany (min. 2 znaki).');
      setSaved(false);
      return;
    }
    updateViewerProfile({
      displayName: trimmed,
      avatarNote: avatarNote.trim() || undefined,
      profileSetupDone: true,
    });
    setError(null);
    setSaved(true);
  };

  return (
    <AppShell activeSection="dashboard" viewerName={state.viewer.displayName}>
      <main className="account-dashboard" id="main-content">
        <section className="panel" style={{ maxWidth: 520 }}>
          <header>
            <span className="eyebrow">Konto</span>
            <h1>Mój profil</h1>
            <p className="empty-copy">
              Nick widać na Pulpicie i w zespole. Avatar z Discorda podłączymy później — na razie
              możesz dodać krótką notatkę.
            </p>
          </header>

          <label className="field">
            <span>Nick wyświetlany *</span>
            <input
              value={nick}
              onChange={(e) => {
                setNick(e.target.value);
                setSaved(false);
              }}
              placeholder="np. Mateusz"
              maxLength={32}
            />
          </label>

          <label className="field">
            <span>Notatka do avatara (opcjonalnie)</span>
            <input
              value={avatarNote}
              onChange={(e) => {
                setAvatarNote(e.target.value);
                setSaved(false);
              }}
              placeholder="np. używam avatara z Discorda"
              maxLength={120}
            />
          </label>

          {error ? <p className="field-error">{error}</p> : null}
          {saved ? (
            <p className="entry-status" role="status">
              Zapisano profil.
            </p>
          ) : null}

          <div className="first-use-actions" style={{ marginTop: '1rem' }}>
            <button className="primary-button" type="button" onClick={onSave} disabled={!writesEnabled}>
              Zapisz profil
            </button>
            <a className="secondary-button" href="/">
              Wróć na Pulpit
            </a>
          </div>

          <p className="empty-copy" style={{ marginTop: '1.25rem' }}>
            Logowanie Discord ograniczone do serwerów z botem — egzekucja Auth osobno.
          </p>
          <p className="empty-copy">
            Discord: <strong>{state.viewer.discordDisplayName}</strong>
            {state.viewer.discordAccountId ? (
              <>
                {' '}
                · ID <code>{state.viewer.discordAccountId}</code>
              </>
            ) : null}
          </p>
        </section>
      </main>
    </AppShell>
  );
}
