'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { usePlayerStore } from '../../src/player-store-react';
import { AppShell } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';

function monogramFrom(name: string, fallback: string): string {
  const source = (name.trim() || fallback.trim() || '?').replace(/\s+/g, ' ');
  const parts = source.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function ProfilPage() {
  const router = useRouter();
  const { state, hydrated, writesEnabled, updateViewerProfile } = usePlayerStore();
  const [nick, setNick] = useState('');
  const [avatarNote, setAvatarNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!state.viewer) return;
    setNick(state.viewer.displayName ?? '');
    setAvatarNote(state.viewer.avatarNote ?? '');
  }, [state.viewer]);

  useEffect(() => {
    if (!saved) return;
    setToastVisible(true);
    const t = window.setTimeout(() => setToastVisible(false), 3200);
    return () => window.clearTimeout(t);
  }, [saved]);

  const isFirstSetup = Boolean(state.viewer && !state.viewer.profileSetupDone);

  const previewName = useMemo(() => {
    const trimmed = nick.trim();
    if (trimmed.length >= 1) return trimmed;
    return state.viewer?.displayName?.trim() || 'Twój nick';
  }, [nick, state.viewer]);

  const discordNick = state.viewer?.discordDisplayName?.trim() || 'Discord';

  const monogram = useMemo(
    () =>
      monogramFrom(
        nick.trim() || state.viewer?.displayName || '',
        state.viewer?.discordDisplayName || state.viewer?.initials || '?',
      ),
    [nick, state.viewer],
  );

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
    const wasFirstSetup = isFirstSetup;
    updateViewerProfile({
      displayName: trimmed,
      avatarNote: avatarNote.trim(),
      profileSetupDone: true,
    });
    setError(null);
    setSaved(true);
    if (wasFirstSetup) {
      window.setTimeout(() => router.replace('/'), 650);
    }
  };

  return (
    <AppShell activeSection="profil" viewerName={state.viewer.displayName}>
      <main className="account-dashboard profil-page" id="main-content">
        <section className="profil-hero panel">
          <div className="profil-hero-glow" aria-hidden="true" />
          <div className="profil-monogram-wrap">
            <div className="profil-monogram" aria-hidden="true">
              <span>{monogram}</span>
            </div>
          </div>
          <div className="profil-hero-copy">
            <span className="eyebrow">Mój profil</span>
            <h1>{isFirstSetup ? 'Witaj w DESTILED' : `Cześć, ${previewName}`}</h1>
            <p>
              {isFirstSetup
                ? 'Ustaw swój nick — tak Cię zobaczą w aplikacji'
                : 'Nick widać na Pulpicie, w zespole i przy Twojej aktywności.'}
            </p>
            <div className="profil-discord-badge" title="Konto Discord powiązane">
              <span className="profil-discord-dot" aria-hidden="true" />
              <span>
                Discord · <strong>{state.viewer.discordDisplayName}</strong>
              </span>
            </div>
          </div>
        </section>

        <section className="profil-form-card panel">
          <header className="profil-form-header">
            <div>
              <span className="eyebrow">Wygląd w aplikacji</span>
              <h2>Jak Cię widać</h2>
            </div>
            <div className="profil-pulpit-preview" aria-live="polite">
              <span className="profil-pulpit-preview-label">Podgląd Pulpit</span>
              <div className="profil-pulpit-chip">
                <span className="profil-pulpit-avatar">{monogram.slice(0, 1)}</span>
                <span className="profil-pulpit-meta">
                  <strong>{previewName}</strong>
                  <small>
                    <span className="profil-pulpit-discord-label">Discord</span>
                    {discordNick}
                  </small>
                </span>
              </div>
            </div>
          </header>

          <label className="field profil-nick-field">
            <span>Nick wyświetlany</span>
            <input
              className="profil-nick-input"
              value={nick}
              onChange={(e) => {
                setNick(e.target.value);
                setSaved(false);
                setError(null);
              }}
              placeholder="np. Mateusz"
              maxLength={32}
              autoComplete="nickname"
              autoFocus={isFirstSetup}
            />
            <small className="profil-field-hint profil-field-hint-game">
              Najlepiej ustaw nick z gry (postać), żeby wszędzie było spójnie.
            </small>
            <small className="profil-field-hint">
              Min. 2 znaki · tak pojawisz się na liście i w nagłówku
            </small>
          </label>

          <label className="field profil-note-field">
            <span>Notatka (opcjonalnie)</span>
            <input
              value={avatarNote}
              onChange={(e) => {
                setAvatarNote(e.target.value);
                setSaved(false);
              }}
              placeholder="np. krótka notatka przy profilu"
              maxLength={120}
            />
          </label>

          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="first-use-actions profil-actions">
            <button
              className="primary-button"
              type="button"
              onClick={onSave}
              disabled={!writesEnabled}
            >
              {isFirstSetup ? 'Zapisz i wejdź do aplikacji' : 'Zapisz profil'}
            </button>
            {!isFirstSetup ? (
              <a className="secondary-button" href="/">
                Wróć na Pulpit
              </a>
            ) : (
              <span className="profil-gate-hint">
                Najpierw zapisz nick — potem otworzy się Pulpit.
              </span>
            )}
          </div>
        </section>

        <p className="profil-footer-meta">
          Discord powiązany
          {state.viewer.discordAccountId ? (
            <>
              {' '}
              · ID <code>{state.viewer.discordAccountId}</code>
            </>
          ) : null}
        </p>

        {toastVisible ? (
          <div className="profil-toast" role="status" aria-live="polite">
            <span className="profil-toast-check" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>Profil zapisany</strong>
              <span>Nick „{previewName}” jest widoczny na Pulpicie.</span>
            </div>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
