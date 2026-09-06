'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  normalizeTeamNotifyPrefs,
  resolveEffectiveNotifyPrefs,
} from '../../../../src/player-store';
import { usePlayerStore } from '../../../../src/player-store-react';
import {
  discordDirectoryFixture,
  isDiscordUserId,
  resolveInviteDiscordIdentity,
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
    updateNotifyPrefs,
    updateMyNotifyPrefs,
    writesEnabled,
  } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const [discordId, setDiscordId] = useState('');
  const [displayNameHint, setDisplayNameHint] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [justSentDiscordId, setJustSentDiscordId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const isOwner = useMemo(() => {
    if (!workspace || !state.viewer) return false;
    return workspace.members.some(
      (member) => member.id === state.viewer?.id && member.role === 'owner',
    );
  }, [workspace, state.viewer]);

  const myMember = useMemo(() => {
    if (!workspace || !state.viewer) return null;
    return workspace.members.find((member) => member.id === state.viewer?.id) ?? null;
  }, [workspace, state.viewer]);

  const teamPrefs = useMemo(
    () => normalizeTeamNotifyPrefs(workspace?.notifyPrefs),
    [workspace?.notifyPrefs],
  );
  const effectivePrefs = useMemo(
    () => resolveEffectiveNotifyPrefs(workspace ?? { notifyPrefs: undefined }, myMember),
    [workspace, myMember],
  );

  useEffect(() => {
    if (workspace) setRenameDraft(workspace.name);
  }, [workspace?.id, workspace?.name]);

  const pending = workspace?.invitations.filter((entry) => entry.status === 'pending') ?? [];
  const justSent =
    pending.find((entry) => entry.recipientDiscordId === justSentDiscordId) ?? null;

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

  const handleInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!writesEnabled || !isOwner) return;
    const result = resolveInviteDiscordIdentity(
      discordDirectoryFixture,
      discordId,
      displayNameHint,
    );
    if (!result.ok || !result.identity) {
      setInviteError(
        result.error === 'invalid_discord_id'
          ? 'Podaj prawidłowy Discord ID (17–20 cyfr).'
          : 'Nie udało się przygotować zaproszenia.',
      );
      return;
    }
    const identity = result.identity;
    sendInvitation(workspace.id, {
      discordUserId: identity.discordUserId,
      displayName: identity.displayName,
      initials: identity.initials,
    });
    setInviteError(null);
    setJustSentDiscordId(identity.discordUserId);
    setDiscordId('');
    setDisplayNameHint('');
    setAnnouncement(
      `Wysłano zaproszenie do ${identity.displayName}. Przekaż link z listy poniżej.`,
    );
  };

  const writesTitle = writesEnabled ? undefined : 'Zapis niedostępny — sesja offline.';

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
              Tu zmienisz nazwę, skład, zaproszenia i powiadomienia Discord (PW). Zaproszenie działa
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
                title={writesTitle}
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
                    title={writesTitle}
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

        <section className="panel team-notify-prefs-panel">
          <header>
            <h2>Powiadomienia Discord (PW)</h2>
          </header>
          <p className="empty-copy">
            Możesz wyłączyć PW timerów postaci i PW wojny królestw. Twoje ustawienie osobiste ma
            pierwszeństwo przed domyślnymi zespołu. Brak ustawienia = włączone.
          </p>

          <div className="team-notify-prefs-grid">
            <label className="team-notify-toggle">
              <input
                checked={effectivePrefs.characterTimers}
                disabled={!writesEnabled}
                onChange={(event) => {
                  updateMyNotifyPrefs(workspace.id, {
                    characterTimers: event.target.checked,
                  });
                  setAnnouncement(
                    event.target.checked
                      ? 'Włączono Twoje PW timerów postaci.'
                      : 'Wyłączono Twoje PW timerów postaci.',
                  );
                }}
                title={writesTitle}
                type="checkbox"
              />
              <span>
                <strong>PW timerów postaci</strong>
                <small>Start / przypomnienie z karty EQ · Twoje ustawienie</small>
              </span>
            </label>
            <label className="team-notify-toggle">
              <input
                checked={effectivePrefs.kingdomWar}
                disabled={!writesEnabled}
                onChange={(event) => {
                  updateMyNotifyPrefs(workspace.id, {
                    kingdomWar: event.target.checked,
                  });
                  setAnnouncement(
                    event.target.checked
                      ? 'Włączono Twoje PW wojny królestw.'
                      : 'Wyłączono Twoje PW wojny królestw.',
                  );
                }}
                title={writesTitle}
                type="checkbox"
              />
              <span>
                <strong>PW wojny królestw</strong>
                <small>Przypomnienie przed wojną · Twoje ustawienie</small>
              </span>
            </label>
          </div>

          {isOwner ? (
            <div className="team-notify-team-defaults">
              <h3>Domyślne zespołu</h3>
              <p className="empty-copy">
                Dla członków bez własnego przełącznika. Obecnie: timery{' '}
                {teamPrefs.characterTimers ? 'wł.' : 'wył.'}, wojna{' '}
                {teamPrefs.kingdomWar ? 'wł.' : 'wył.'}.
              </p>
              <div className="team-notify-prefs-grid">
                <label className="team-notify-toggle">
                  <input
                    checked={teamPrefs.characterTimers}
                    disabled={!writesEnabled}
                    onChange={(event) => {
                      updateNotifyPrefs(workspace.id, {
                        characterTimers: event.target.checked,
                      });
                      setAnnouncement('Zapisano domyślne PW timerów postaci dla zespołu.');
                    }}
                    title={writesTitle}
                    type="checkbox"
                  />
                  <span>
                    <strong>PW timerów postaci (zespół)</strong>
                  </span>
                </label>
                <label className="team-notify-toggle">
                  <input
                    checked={teamPrefs.kingdomWar}
                    disabled={!writesEnabled}
                    onChange={(event) => {
                      updateNotifyPrefs(workspace.id, {
                        kingdomWar: event.target.checked,
                      });
                      setAnnouncement('Zapisano domyślne PW wojny dla zespołu.');
                    }}
                    title={writesTitle}
                    type="checkbox"
                  />
                  <span>
                    <strong>PW wojny (zespół)</strong>
                  </span>
                </label>
              </div>
            </div>
          ) : null}
        </section>

        {isOwner ? (
          <section className="panel">
            <h2>Dodaj członka — wyślij zaproszenie</h2>
            <p className="empty-copy">
              Wpisz Discord ID (17–20 cyfr). Opcjonalnie podaj wyświetlaną nazwę — zaproszenie
              zapisuje się w zespole i działa przez link akceptacji.
            </p>
            <form className="team-invite-form" onSubmit={handleInvite}>
              <label className="field">
                <span>Discord ID</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => {
                    setDiscordId(event.target.value);
                    setInviteError(null);
                  }}
                  placeholder="np. 808066932753563668"
                  value={discordId}
                />
              </label>
              <label className="field">
                <span>Nazwa wyświetlana (opcjonalnie)</span>
                <input
                  onChange={(event) => setDisplayNameHint(event.target.value)}
                  placeholder="np. Kuzyn"
                  value={displayNameHint}
                />
              </label>
              {inviteError ? <p className="field-error">{inviteError}</p> : null}
              {!writesEnabled ? (
                <p className="field-error">Zapis niedostępny (sesja offline).</p>
              ) : null}
              <button
                className="primary-button"
                disabled={!writesEnabled || !isDiscordUserId(discordId)}
                title={
                  writesTitle ??
                  (!isDiscordUserId(discordId) ? 'Podaj prawidłowy Discord ID.' : undefined)
                }
                type="submit"
              >
                Wyślij zaproszenie
              </button>
            </form>
            {justSent ? (
              <p className="entry-status" role="status">
                Wysłano. Link:{' '}
                <a href={`/invitations/${justSent.id}`}>{`/invitations/${justSent.id}`}</a>
              </p>
            ) : null}
          </section>
        ) : (
          <p className="empty-copy">Tylko właściciel zarządza zaproszeniami i składem.</p>
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
                    <span>
                      Discord {entry.recipientDiscordId} · oczekuje · {entry.createdLabel}
                    </span>
                  </div>
                  <a className="secondary-button" href={`/invitations/${entry.id}`}>
                    Otwórz link
                  </a>
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
              Archiwizacja ukrywa zespół z aktywnej listy. Dane zostają w tej sesji — bez kasowania
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
              title={writesTitle}
              type="button"
            >
              Zamknij / archiwizuj zespół
            </button>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
