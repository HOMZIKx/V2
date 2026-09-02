'use client';

import { useMemo, useState, type FormEvent } from 'react';

import {
  cancelInvitation,
  createPendingInvitation,
  discordDirectoryFixture,
  invitationStatusLabel,
  resolveDiscordIdentity,
  type DiscordIdentity,
  type TeamInvitation,
  type TeamMembershipSnapshot,
} from '../../../../src/team-membership';
import { AppShell, Icon } from '../../../app-shell';

export function TeamMembershipManagement({
  initialSnapshot,
}: {
  initialSnapshot: TeamMembershipSnapshot;
}) {
  const [discordId, setDiscordId] = useState('');
  const [resolvedIdentity, setResolvedIdentity] = useState<DiscordIdentity | null>(null);
  const [invitations, setInvitations] = useState(initialSnapshot.invitations);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === 'pending'),
    [invitations],
  );
  const canManage = initialSnapshot.viewerRole === 'owner';

  const handleIdentityResolve = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = resolveDiscordIdentity(discordDirectoryFixture, discordId);
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
  };

  const handleInvitationCreate = () => {
    if (!resolvedIdentity) return;
    const operationId = `invite-${resolvedIdentity.discordUserId}-ui`;
    const next = createPendingInvitation(invitations, {
      teamId: initialSnapshot.teamId,
      teamName: initialSnapshot.teamName,
      inviterName: initialSnapshot.viewerName,
      recipient: resolvedIdentity,
      createdLabel: 'teraz',
      expiresLabel: 'za 7 dni',
      operationId,
    });
    setInvitations(next);
    setAnnouncement(
      next === invitations
        ? `Zaproszenie dla ${resolvedIdentity.displayName} już oczekuje.`
        : `Zaproszenie dla ${resolvedIdentity.displayName} zostało utworzone.`,
    );
    setDiscordId('');
    setResolvedIdentity(null);
  };

  const handleInvitationCancel = (invitation: TeamInvitation) => {
    setInvitations((current) =>
      current.map((candidate) =>
        candidate.id === invitation.id ? cancelInvitation(candidate) : candidate,
      ),
    );
    setAnnouncement(`Zaproszenie dla ${invitation.recipient.displayName} anulowano.`);
  };

  return (
    <AppShell activeSection="teams" viewerName={initialSnapshot.viewerName}>
      <main className="membership-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${initialSnapshot.teamId}`}>{initialSnapshot.teamName}</a>
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
          <span className={`connection-badge is-${initialSnapshot.connectionState}`}>
            <span className="live-dot" />
            {initialSnapshot.connectionState === 'connected' ? 'Połączono' : 'Brak połączenia'}
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
                <span className="count-badge">{initialSnapshot.members.length}</span>
              </header>
              <div className="membership-member-list">
                {initialSnapshot.members.map((member) => (
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
                {invitations.map((invitation) => (
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
                        onClick={() => handleInvitationCancel(invitation)}
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
                <form onSubmit={handleIdentityResolve}>
                  <label htmlFor="discord-id">Discord ID osoby</label>
                  <input
                    autoComplete="off"
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
                  <button className="secondary-button" disabled={!discordId.trim()} type="submit">
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
                    <button onClick={handleInvitationCreate} type="button">
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
        <div className="mock-notice">
          Produkcyjny kontrakt interfejsu · dane demonstracyjne. Docelowy adapter rozwiąże tożsamość
          przez Discord/Authorization i zapisze wersjonowane zaproszenie bez zmiany tego przepływu.
        </div>
      </main>
    </AppShell>
  );
}
