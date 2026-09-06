'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { usePlayerStore } from '../../../../src/player-store-react';
import {
  discordDirectoryFixture,
  resolveDiscordIdentity,
  type DiscordIdentity,
} from '../../../../src/team-membership';
import { AppShell, Icon } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';
import { WorkspaceSectionNav } from '../workspace-section-nav';

export function TeamMembershipManagement() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const {
    state,
    hydrated,
    sendInvitation,
    renameWorkspace,
    removeWorkspaceMember,
    archiveWorkspace,
    writesEnabled,
  } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const [discordId, setDiscordId] = useState('');
  const [resolved, setResolved] = useState<DiscordIdentity | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [justSentDiscordId, setJustSentDiscordId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const isOwner = useMemo(() => {
    if (!workspace || !state.viewer) return false;
    return workspace.members.some(
      (member) => member.id === state.viewer?.id && member.role === 'owner',
    );
  }, [workspace, state.viewer]);

  useEffect(() => {
    if (workspace) setRenameDraft(workspace.name);
  }, [workspace?.id, workspace?.name]);

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

  if (!workspace || workspace.archived) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="membership-page" id="main-content">
          <h1>Nie znaleziono przestrzeni</h1>
          <p>
            {workspace?.archived
              ? 'Ten zespół został zamknięty.'
              : `Ta sesja nie ma przestrzeni o ID „${params.teamId}”.`}
          </p>
          <a className="primary-button" href="/">
            Wróć na pulpit
          </a>
        </main>
      </AppShell>
    );
  }

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!writesEnabled || !isOwner) return;
    const trimmed = renameDraft.trim();
    if (trimmed.length < 2) {
      setAnnouncement('Nazwa zespołu musi mieć co najmniej 2 znaki.');
      return;
    }
    renameWorkspace(workspace.id, trimmed);
    setAnnouncement(`Zmieniono nazwę zespołu na „${trimmed}”.`);
  };

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="membership-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${workspace.id}`}>{workspace.name}</a>
          <Icon name="chevron" size={13} />
          <strong>Zarządzanie</strong>
        </nav>

        <WorkspaceSectionNav active="members" workspaceId={workspace.id} />

        <header className="membership-hero">
          <div>
            <span className="eyebrow">Zarządzanie zespołem</span>
            <h1>{workspace.name}</h1>
            <p>
              Właściciel zarządza składem, nazwą i zamknięciem zespołu. Zaproszenie daje dostęp
              dopiero po akceptacji odbiorcy.
            </p>
          </div>
          <a className="secondary-button" href={`/teams/${workspace.id}`}>
            ← Wróć do przeglądu
          </a>
        </header>

        {announcement ? (
          <p className="entry-status" role="status">
            {announcement}
          </p>
        ) : null}

        {isOwner ? (
          <section className="panel team-manage-panel">
            <header>
              <h2>Nazwa zespołu</h2>
            </header>
            <form className="team-rename-form" onSubmit={handleRename}>
              <label className="field">
                <span>Nowa nazwa</span>
                <input
                  maxLength={64}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  value={renameDraft}
                />
              </label>
              <button
                className="secondary-button"
                disabled={!writesEnabled || renameDraft.trim().length < 2}
                type="submit"
              >
                Zmień nazwę
              </button>
            </form>
          </section>
        ) : null}

        <section className="panel">
          <header>
            <h2>Obecni członkowie</h2>
            <span>
              {workspace.members.length === 1
                ? '1 osoba'
                : `${workspace.members.length} osób`}
            </span>
          </header>
          <ul className="membership-member-list">
            {workspace.members.map((member) => (
              <li className="membership-member" key={member.id}>
                <span className="member-avatar is-idle" aria-hidden>
                  {member.initials}
                </span>
                <div>
                  <strong>{member.displayName}</strong>
                  <span>{member.role === 'owner' ? 'Właściciel' : 'Członek'}</span>
                </div>
                {isOwner && member.role !== 'owner' ? (
                  <button
                    className="secondary-button is-danger"
                    disabled={!writesEnabled}
                    onClick={() => {
                      const ok = window.confirm(
                        `Usunąć „${member.displayName}” z zespołu ${workspace.name}?`,
                      );
                      if (!ok) return;
                      removeWorkspaceMember(workspace.id, member.id);
                      setAnnouncement(`Usunięto „${member.displayName}” z zespołu.`);
                    }}
                    type="button"
                  >
                    Usuń
                  </button>
                ) : (
                  <span className={`role-badge${member.role === 'owner' ? ' is-owner' : ''}`}>
                    {member.role === 'owner' ? 'Właściciel' : 'Członek'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isOwner ? (
          <section className="panel">
            <h2>Dodaj członka — wyślij zaproszenie</h2>
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
                    setAnnouncement(`Wysłano zaproszenie do ${resolved.displayName}.`);
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
          <p className="empty-copy">Tylko właściciel przestrzeni zarządza zaproszeniami i składem.</p>
        )}

        <section className="panel">
          <h2>Oczekujące zaproszenia</h2>
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

        {isOwner ? (
          <section className="panel team-close-panel">
            <header>
              <h2>Zamknij zespół</h2>
            </header>
            <p className="empty-copy">
              Archiwizacja ukrywa zespół z listy aktywnych. Dane zostają lokalnie — bez usuwania
              historii. Tylko właściciel może zamknąć zespół.
            </p>
            <button
              className="secondary-button is-danger"
              disabled={!writesEnabled}
              onClick={() => {
                const ok = window.confirm(
                  `Zamknąć zespół „${workspace.name}”? Zniknie z aktywnej listy Zespół.`,
                );
                if (!ok) return;
                archiveWorkspace(workspace.id);
                setAnnouncement(`Zamknięto zespół „${workspace.name}”.`);
                router.push('/');
              }}
              type="button"
            >
              Zamknij / archiwizuj zespół
            </button>
          </section>
        ) : null}

        <div className="mock-notice">
          Rozpoznawanie Discord ID jest lokalną listą demo. Trwałe zaproszenia wrócą z API.
        </div>
      </main>
    </AppShell>
  );
}
