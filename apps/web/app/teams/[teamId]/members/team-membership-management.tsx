'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  discordDirectoryFixture,
  resolveDiscordIdentity,
  type DiscordIdentity,
} from '../../../../src/team-membership';
import { usePlayerStore } from '../../../../src/player-store-react';
import { AppShell, Icon } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';

export function TeamMembershipManagement() {
  const params = useParams<{ teamId: string }>();
  const { state, hydrated } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const [discordId, setDiscordId] = useState('');
  const [resolved, setResolved] = useState<DiscordIdentity | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [pending, setPending] = useState<DiscordIdentity[]>([]);

  const isOwner = useMemo(() => {
    if (!workspace || !state.viewer) return false;
    return workspace.members.some(
      (member) => member.id === state.viewer?.id && member.role === 'owner',
    );
  }, [workspace, state.viewer]);

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
        <main id="main-content">
          <h1>Brak przestrzeni</h1>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="membership-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${workspace.id}`}>{workspace.name}</a>
          <Icon name="chevron" size={13} />
          <strong>Członkowie</strong>
        </nav>

        <header>
          <h1>Członkowie i zaproszenia</h1>
          <p>
            Zaproszenie nie daje od razu dostępu. Najpierw rozpoznaj Discord ID, potwierdź tożsamość,
            potem wyślij — odbiorca musi zaakceptować.
          </p>
        </header>

        <section className="panel">
          <h2>Obecni członkowie</h2>
          <ul className="member-list">
            {workspace.members.map((member) => (
              <li key={member.id}>
                <strong>{member.displayName}</strong>
                <small>{member.role === 'owner' ? 'Właściciel' : 'Członek'}</small>
              </li>
            ))}
          </ul>
        </section>

        {isOwner ? (
          <section className="panel">
            <h2>Wyślij zaproszenie</h2>
            <label className="field">
              <span>Discord ID osoby</span>
              <input
                onChange={(event) => setDiscordId(event.target.value)}
                value={discordId}
              />
            </label>
            <button
              onClick={() => {
                const result = resolveDiscordIdentity(discordDirectoryFixture, discordId);
                if (!result.ok || !result.identity) {
                  setResolved(null);
                  setResolveError('Nie znaleziono tożsamości Discord dla podanego ID.');
                  return;
                }
                setResolveError(null);
                setResolved(result.identity);
              }}
              type="button"
            >
              Sprawdź konto Discord
            </button>
            {resolveError ? <p className="field-error">{resolveError}</p> : null}
            {resolved ? (
              <div>
                <label>
                  Rozpoznane konto Discord
                  <input readOnly value={`${resolved.displayName} (@${resolved.username})`} />
                </label>
                <p>{resolved.displayName}</p>
                <button
                  onClick={() => {
                    setPending((current) =>
                      current.some((entry) => entry.discordUserId === resolved.discordUserId)
                        ? current
                        : [...current, resolved],
                    );
                  }}
                  type="button"
                >
                  Wyślij zaproszenie
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <p className="empty-copy">Tylko właściciel przestrzeni zarządza zaproszeniami.</p>
        )}

        <section className="panel">
          <h2>Oczekujące</h2>
          {pending.length === 0 ? (
            <p className="empty-copy">Brak lokalnych oczekujących zaproszeń.</p>
          ) : (
            <ul>
              {pending.map((identity) => (
                <li key={identity.discordUserId}>
                  <strong>{identity.displayName}</strong>
                  <span>Oczekuje na akceptację</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mock-notice">
          Produkcyjny kontrakt interfejsu · rozpoznawanie Discord ID jest demonstracyjne; trwałe
          zaproszenia wymagają API.
        </div>
      </main>
    </AppShell>
  );
}
