'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { findInvitation } from '../../../src/player-store';
import { usePlayerStore } from '../../../src/player-store-react';
import { AppShell } from '../../app-shell';
import { DiscordEntryScreen } from '../../discord-entry';

export function InvitationResponse() {
  const params = useParams<{ invitationId: string }>();
  const { state, hydrated, acceptInvitation, declineInvitation } = usePlayerStore();
  const [outcome, setOutcome] = useState<'accepted' | 'declined' | null>(null);

  const invitation = useMemo(
    () => (hydrated ? findInvitation(state, params.invitationId) : null),
    [hydrated, state, params.invitationId],
  );

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

  // Keep local outcome even if invitation moves off the pending list after accept.
  const alreadyHandled =
    outcome !== null || (invitation !== null && invitation.status !== 'pending');

  if (!invitation && outcome === null) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="invitation-page" id="main-content">
          <span className="eyebrow">Zaproszenie</span>
          <h1>Nie znaleziono zaproszenia</h1>
          <p>
            ID <code>{params.invitationId}</code> nie ma w tej sesji. Wczytaj demo albo wyślij
            zaproszenie z poziomu członków przestrzeni.
          </p>
          <a className="primary-button" href="/">
            Wróć na pulpit
          </a>
        </main>
      </AppShell>
    );
  }

  const teamName = invitation?.teamName ?? 'Przestrzeń';
  const workspaceId = invitation?.teamId ?? state.lastOpenedWorkspaceId ?? '/';
  const inviterName = invitation?.inviterName ?? '—';
  const recipientName = invitation?.recipientDisplayName ?? '—';
  const isRecipient =
    !!invitation &&
    (invitation.recipientDisplayName === state.viewer.displayName ||
      invitation.recipientDisplayName === state.viewer.discordDisplayName);

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="invitation-page" id="main-content">
        <span className="eyebrow">Zaproszenie do przestrzeni</span>
        <h1>{teamName}</h1>
        <p>
          Od <strong>{inviterName}</strong> dla <strong>{recipientName}</strong>. Zalogowano jako{' '}
          <strong>{state.viewer.discordDisplayName}</strong>. Dane prywatne pojawią się dopiero po
          akceptacji.
        </p>

        {!alreadyHandled && invitation && !isRecipient ? (
          <p className="entry-status" role="status">
            To zaproszenie jest dla <strong>{recipientName}</strong>. Zaloguj się na to konto
            Discord, żeby je przyjąć albo odrzucić.
          </p>
        ) : null}

        {!alreadyHandled && invitation && isRecipient ? (
          <div className="invitation-actions">
            <button
              className="primary-button"
              onClick={() => {
                acceptInvitation(invitation.id);
                setOutcome('accepted');
              }}
              type="button"
            >
              Akceptuję i dołączam
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                declineInvitation(invitation.id);
                setOutcome('declined');
              }}
              type="button"
            >
              Odrzuć
            </button>
          </div>
        ) : null}

        {alreadyHandled ? (
          <div className="entry-status" role="status">
            {outcome === 'declined' || invitation?.status === 'declined' ? (
              <>
                <h2>Zaproszenie odrzucone</h2>
                <p>Nic się nie zmieniło w członkostwie zespołu.</p>
              </>
            ) : (
              <>
                <h2>Zaproszenie zaakceptowane</h2>
                <p>Dostęp do zespołu został przyznany po Twoim potwierdzeniu.</p>
              </>
            )}
            <a href={`/teams/${workspaceId}`}>Otwórz przestrzeń zespołu</a>
          </div>
        ) : null}

        <div className="mock-notice">
          Lokalny podgląd zaproszeń. Produkcja będzie wymagać API i prawdziwego Discord OAuth.
        </div>
      </main>
    </AppShell>
  );
}
