'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { usePlayerStore } from '../../../../src/player-store-react';
import {
  discordDirectoryFixture,
  resolveDiscordIdentity,
  type DiscordIdentity,
} from '../../../../src/team-membership';
import { AppShell, Icon } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';

export function TeamMembershipManagement() {
  const params = useParams<{ teamId: string }>();
  const { state, hydrated, sendInvitation, writesEnabled } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const [discordId, setDiscordId] = useState('');
  const [resolved, setResolved] = useState<DiscordIdentity | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [justSentDiscordId, setJustSentDiscordId] = useState<string | null>(null);

  const isOwner = useMemo(() => {
    if (!workspace || !state.viewer) return false;
    return workspace.members.some(
      (member) => member.id === state.viewer?.id && member.role === 'owner',
    );
  }, [workspace, state.viewer]);

  const pending = workspace?.invitations.filter((entry) => entry.status === 'pending') ?? [];
  const justSent =
    pending.find((entry) => entry.recipientDiscordId === justSentDiscordId) ?? pending[0] ?? null;

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
        <main className="membership-page" id="main-content">
          <h1>Nie znaleziono przestrzeni</h1>
          <p>Ta sesja nie ma przestrzeni o ID „{params.teamId}”.</p>
          <a className="primary-button" href="/">
            Wróć na pulpit
          </a>
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
            Najpierw rozpoznaj Discord ID, potem wyślij. Odbiorca musi otworzyć link i zaakceptować
            — samo wysłanie nie daje dostępu.
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
              <input onChange={(event) => setDiscordId(event.target.value)} value={discordId} />
            </label>
            <button
              disabled={!writesEnabled}
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
            {!writesEnabled ? (
              <p className="field-error">Zapis niedostępny (sesja offline).</p>
            ) : null}
            {resolved ? (
              <div>
                <label>
                  Rozpoznane konto Discord
                  <input readOnly value={`${resolved.displayName} (@${resolved.username})`} />
                </label>
                <p>{resolved.displayName}</p>
                <button
                  disabled={!writesEnabled}
                  onClick={() => {
                    sendInvitation(workspace.id, {
                      discordUserId: resolved.discordUserId,
                      displayName: resolved.displayName,
                      initials: resolved.initials,
                    });
                    setJustSentDiscordId(resolved.discordUserId);
                    setDiscordId('');
                    setResolved(null);
                  }}
                  type="button"
                >
                  Wyślij zaproszenie
                </button>
              </div>
            ) : null}
            {justSentDiscordId && justSent ? (
              <p className="entry-status">
                Wysłano. Link zaproszenia:{' '}
                <a href={`/invitations/${justSent.id}`}>{`/invitations/${justSent.id}`}</a>
              </p>
            ) : null}
          </section>
        ) : (
          <p className="empty-copy">Tylko właściciel przestrzeni zarządza zaproszeniami.</p>
        )}

        <section className="panel">
          <h2>Oczekujące</h2>
          {pending.length === 0 ? (
            <p className="empty-copy">Brak oczekujących zaproszeń.</p>
          ) : (
            <ul className="invite-list">
              {pending.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.recipientDisplayName}</strong>
                    <span>Oczekuje na akceptację · {entry.createdLabel}</span>
                  </div>
                  <a href={`/invitations/${entry.id}`}>Otwórz link zaproszenia</a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mock-notice">
          Rozpoznawanie Discord ID jest lokalną listą demo. Trwałe zaproszenia wrócą z API.
        </div>
      </main>
    </AppShell>
  );
}
