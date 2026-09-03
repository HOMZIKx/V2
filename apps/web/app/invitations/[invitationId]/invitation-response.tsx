'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { usePlayerStore } from '../../../src/player-store-react';
import { AppShell } from '../../app-shell';
import { DiscordEntryScreen } from '../../discord-entry';

export function InvitationResponse() {
  const params = useParams<{ invitationId: string }>();
  const { state, hydrated, acceptInvitation, loadDemo } = usePlayerStore();
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!hydrated || state.authStatus !== 'authenticated') return;
    if (state.workspaces.length === 0) loadDemo();
  }, [hydrated, state.authStatus, state.workspaces.length, loadDemo]);

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

  const workspaceId = state.lastOpenedWorkspaceId ?? state.workspaces[0]?.id ?? 'asteria';

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="invitation-page" id="main-content">
        <span className="eyebrow">Zaproszenie do przestrzeni</span>
        <h1>Asteria</h1>
        <p>
          Zalogowano przez Discord jako <strong>{state.viewer.discordDisplayName}</strong>. Dostęp do
          prywatnych danych pojawia się dopiero po akceptacji.
        </p>
        {!accepted ? (
          <button
            className="primary-button"
            onClick={() => {
              acceptInvitation(params.invitationId);
              setAccepted(true);
            }}
            type="button"
          >
            Akceptuję i dołączam
          </button>
        ) : (
          <div className="entry-status">
            <p>Dostęp do zespołu został przyznany po Twoim potwierdzeniu.</p>
            <a href={`/teams/${workspaceId}`}>Otwórz przestrzeń zespołu</a>
          </div>
        )}
        <div className="mock-notice">
          Akceptacja aktualizuje lokalny store. Prawdziwe membership wymaga API.
        </div>
      </main>
    </AppShell>
  );
}
