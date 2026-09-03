'use client';

import { useState } from 'react';

import { PlayerWorkspaceConflictError } from '../../../src/lib/player-workspace-api';
import {
  invitationStatusLabel,
  type TeamInvitation,
  type TeamMembershipAdapter,
} from '../../../src/team-membership';
import { AppShell, Icon } from '../../app-shell';

export function InvitationResponse({
  initialInvitation,
  adapter,
  onConflict,
}: {
  initialInvitation: TeamInvitation;
  adapter: TeamMembershipAdapter;
  onConflict?: () => void;
}) {
  const [invitation, setInvitation] = useState(initialInvitation);
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPending = invitation.status === 'pending';

  const respond = async (decision: 'accept' | 'decline') => {
    setBusy(true);
    setError('');
    try {
      const next = await adapter.respondToInvitation({
        invitationId: invitation.id,
        expectedRevision: invitation.revision,
        decision,
        operationId: crypto.randomUUID(),
      });
      setInvitation(next);
      setAnnouncement(
        decision === 'accept'
          ? `Dołączono do przestrzeni ${invitation.teamName}.`
          : `Odrzucono zaproszenie do przestrzeni ${invitation.teamName}.`,
      );
    } catch (err) {
      if (err instanceof PlayerWorkspaceConflictError) {
        setError('Konflikt wersji — odśwież stronę i spróbuj ponownie.');
        onConflict?.();
      } else {
        setError('Nie udało się odpowiedzieć na zaproszenie.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell activeSection="teams" viewerName={invitation.recipient.displayName}>
      <main className="invitation-page" id="main-content">
        <section className={`invitation-card is-${invitation.status}`}>
          <div className="invitation-emblem">
            <Icon name={invitation.status === 'accepted' ? 'check' : 'team'} size={30} />
          </div>
          <span className="eyebrow">Prywatne zaproszenie zespołu</span>
          <h1>{invitation.teamName}</h1>
          <p className="invitation-lead">
            <strong>{invitation.inviterName}</strong> zaprasza Cię do wspólnej przestrzeni postaci,
            ekwipunku, timerów i notatek.
          </p>

          <div className="invitation-identity">
            <span className="member-avatar is-online">{invitation.recipient.initials}</span>
            <div>
              <span>Zalogowano przez Discord jako</span>
              <strong>{invitation.recipient.displayName}</strong>
              <small>
                @{invitation.recipient.username} · ID {invitation.recipient.discordUserId}
              </small>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          {isPending ? (
            <>
              <ul className="invitation-access-list">
                <li>
                  <Icon name="check" size={15} /> zobaczysz wspólne postacie i sety EQ;
                </li>
                <li>
                  <Icon name="check" size={15} /> będziesz współdzielić timery i akcje zespołu;
                </li>
                <li>
                  <Icon name="check" size={15} /> zmiany zapiszą autora i historię;
                </li>
                <li>
                  <Icon name="x" size={15} /> nie otrzymasz rangi Lidera ani Technika.
                </li>
              </ul>
              <div className="invitation-actions">
                <button
                  className="primary-invitation-button"
                  disabled={busy}
                  onClick={() => void respond('accept')}
                  type="button"
                >
                  Akceptuję i dołączam
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void respond('decline')}
                  type="button"
                >
                  Odrzuć
                </button>
              </div>
              <small className="invitation-expiry">
                Zaproszenie wygasa {invitation.expiresLabel}.
              </small>
            </>
          ) : (
            <div className={`invitation-result is-${invitation.status}`}>
              <Icon name={invitation.status === 'accepted' ? 'check' : 'x'} size={20} />
              <div>
                <strong>{invitationStatusLabel(invitation.status)}</strong>
                <p>
                  {invitation.status === 'accepted'
                    ? 'Dostęp do zespołu został przyznany po Twoim potwierdzeniu.'
                    : 'Dane zespołu nie zostały udostępnione.'}
                </p>
              </div>
              {invitation.status === 'accepted' && (
                <a href={`/teams/${invitation.teamId}`}>Otwórz przestrzeń zespołu</a>
              )}
            </div>
          )}
        </section>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </main>
    </AppShell>
  );
}
