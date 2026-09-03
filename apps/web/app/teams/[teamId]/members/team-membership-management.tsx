'use client';

import { useMemo, useState, type FormEvent } from 'react';

import { PlayerWorkspaceConflictError } from '../../../../src/lib/player-workspace-api';
import {
  invitationStatusLabel,
  type DiscordIdentity,
  type TeamInvitation,
  type TeamMembershipAdapter,
  type TeamMembershipSnapshot,
} from '../../../../src/team-membership';
import { AppShell, Icon } from '../../../app-shell';

export function TeamMembershipManagement({
  initialSnapshot,
  adapter,
}: {
  initialSnapshot: TeamMembershipSnapshot;
  adapter: TeamMembershipAdapter;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [discordId, setDiscordId] = useState('');
  const [resolvedIdentity, setResolvedIdentity] = useState<DiscordIdentity | null>(null);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingInvitations = useMemo(
    () => snapshot.invitations.filter((invitation) => invitation.status === 'pending'),
    [snapshot.invitations],
  );
  const canManage = snapshot.viewerRole === 'owner';

  const refreshSnapshot = async () => {
    const next = await adapter.getTeamMembership(snapshot.teamId);
    setSnapshot(next);
  };

  const handleIdentityResolve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await adapter.resolveDiscordIdentity(discordId);
      setResolvedIdentity(result.identity);
      setError(
        result.error === 'invalid_discord_id'
          ? 'Wpisz prawidłowe Discord ID — 17–20 cyfr.'
          : result.error === 'identity_not_found'
            ? 'Nie znaleziono tej osoby w katalogu Discord dostępnym dla aplikacji.'
            : '',
      );
      if (result.identity) {
        setAnnouncement(`Rozpoznano konto Discord: ${result.identity.displayName}.`);
      }
    } catch {
      setError('Nie udało się rozwiązać tożsamości Discord.');
    } finally {
      setBusy(false);
    }
  };

  const handleInvitationCreate = async () => {
    if (!resolvedIdentity) return;
    setBusy(true);
    setError('');
    try {
      await adapter.createInvitation({
        teamId: snapshot.teamId,
        expectedTeamRevision: snapshot.teamRevision,
        recipient: resolvedIdentity,
        operationId: crypto.randomUUID(),
      });
      await refreshSnapshot();
      setAnnouncement(`Zaproszenie dla ${resolvedIdentity.displayName} zostało utworzone.`);
      setDiscordId('');
      setResolvedIdentity(null);
    } catch (err) {
      if (err instanceof PlayerWorkspaceConflictError) {
        setError(err.message);
      } else {
        setError('Nie udało się utworzyć zaproszenia.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleInvitationCancel = async (invitation: TeamInvitation) => {
    setBusy(true);
    setError('');
    try {
      await adapter.cancelInvitation(invitation.id, invitation.revision, crypto.randomUUID());
      await refreshSnapshot();
      setAnnouncement(`Zaproszenie dla ${invitation.recipient.displayName} anulowano.`);
    } catch {
      setError('Nie udało się anulować zaproszenia.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (userId: string, displayName: string) => {
    setBusy(true);
    setError('');
    try {
      await adapter.removeMember(snapshot.teamId, userId, snapshot.teamRevision);
      await refreshSnapshot();
      setAnnouncement(`${displayName} został usunięty z zespołu.`);
    } catch (err) {
      if (err instanceof PlayerWorkspaceConflictError) {
        setError(err.message);
        try {
          await refreshSnapshot();
        } catch {
          // ignore refresh failure after conflict
        }
      } else {
        setError('Nie udało się usunąć członka.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell activeSection="teams" viewerName={snapshot.viewerName}>
      <main className="membership-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${snapshot.teamId}`}>{snapshot.teamName}</a>
          <Icon name="chevron" size={13} />
          <strong>Członkowie</strong>
        </nav>

        <header className="membership-hero">
          <div>
            <span className="eyebrow">Prywatna przestrzeń zespołu</span>
            <h1>Członkowie i zaproszenia</h1>
            <p>
              Dostęp do postaci, EQ, timerów i notatek zespołu pojawia się dopiero po świadomej
              akceptacji zaproszenia.
            </p>
          </div>
          <span className={`connection-badge is-${snapshot.connectionState}`}>
            <span className="live-dot" />
            {snapshot.connectionState === 'connected' ? 'Połączono' : 'Brak połączenia'}
          </span>
        </header>

        <div className="membership-grid">
          <div className="membership-main">
            <section className="panel membership-members-panel">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Aktualny dostęp</span>
                  <h2>Członkowie zespołu</h2>
                </div>
                <span className="count-badge">{snapshot.members.length}</span>
              </header>
              <div className="membership-member-list">
                {snapshot.members.map((member) => (
                  <article className="membership-member" key={member.id}>
                    <span className={`member-avatar is-${member.state}`}>
                      {member.identity.initials}
                    </span>
                    <div>
                      <strong>{member.identity.displayName}</strong>
                      <span>@{member.identity.username}</span>
                      <small>{member.joinedLabel}</small>
                    </div>
                    <span className={`role-badge is-${member.role}`}>
                      {member.role === 'owner' ? 'Właściciel' : 'Członek'}
                    </span>
                    {canManage && member.role === 'member' ? (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void handleRemoveMember(member.id, member.identity.displayName)
                        }
                        type="button"
                      >
                        Usuń
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="panel membership-invitations-panel">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Bez dostępu do czasu decyzji</span>
                  <h2>Zaproszenia</h2>
                </div>
                <span className="count-badge">{pendingInvitations.length}</span>
              </header>
              <div className="membership-invitation-list">
                {snapshot.invitations.map((invitation) => (
                  <article
                    className={`membership-invitation is-${invitation.status}`}
                    key={invitation.id}
                  >
                    <span className="member-avatar">{invitation.recipient.initials}</span>
                    <div>
                      <strong>{invitation.recipient.displayName}</strong>
                      <span>@{invitation.recipient.username}</span>
                      <small>
                        {invitationStatusLabel(invitation.status)} · {invitation.expiresLabel}
                      </small>
                    </div>
                    {invitation.status === 'pending' ? (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void handleInvitationCancel(invitation)}
                        type="button"
                      >
                        Anuluj
                      </button>
                    ) : (
                      <span className={`status-pill is-${invitation.status}`}>
                        {invitationStatusLabel(invitation.status)}
                      </span>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="panel invite-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Krok 1 z 2</span>
                <h2>Zaproś przez Discord ID</h2>
              </div>
              <Icon name="team" size={18} />
            </header>

            {canManage ? (
              <div className="invite-flow">
                <p className="invite-explanation">
                  Najpierw sprawdzamy dokładne konto. Samo wpisanie ID nie nadaje dostępu i nie
                  tworzy członka zespołu.
                </p>
                <form onSubmit={(event) => void handleIdentityResolve(event)}>
                  <label htmlFor="discord-id">Discord ID osoby</label>
                  <input
                    autoComplete="off"
                    disabled={busy}
                    id="discord-id"
                    inputMode="numeric"
                    onChange={(event) => {
                      setDiscordId(event.target.value);
                      setResolvedIdentity(null);
                      setError('');
                    }}
                    placeholder="np. 994001220033445566"
                    value={discordId}
                  />
                  {error && <p className="form-error">{error}</p>}
                  <button
                    className="secondary-button"
                    disabled={!discordId.trim() || busy}
                    type="submit"
                  >
                    <Icon name="search" size={15} /> Sprawdź konto Discord
                  </button>
                </form>

                {resolvedIdentity && (
                  <section className="resolved-identity" aria-label="Rozpoznane konto Discord">
                    <span className="member-avatar is-online">{resolvedIdentity.initials}</span>
                    <div>
                      <span>Rozpoznane konto</span>
                      <strong>{resolvedIdentity.displayName}</strong>
                      <small>
                        @{resolvedIdentity.username} · ID {resolvedIdentity.discordUserId}
                      </small>
                    </div>
                    <Icon name="check" size={18} />
                    <p>
                      Potwierdź tylko wtedy, gdy to właściwa osoba. Odbiorca nadal musi zalogować
                      się przez Discord i zaakceptować zaproszenie.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() => void handleInvitationCreate()}
                      type="button"
                    >
                      Wyślij zaproszenie
                    </button>
                  </section>
                )}

                <div className="membership-boundary-note">
                  <Icon name="settings" size={16} />
                  <p>
                    Zaproszenie do zespołu nie dodaje osoby do allowlisty całej platformy i nie
                    nadaje rangi Lidera ani Technika.
                  </p>
                </div>
              </div>
            ) : (
              <p className="invite-explanation">Tylko właściciel zespołu zarządza członkostwem.</p>
            )}
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </main>
    </AppShell>
  );
}
