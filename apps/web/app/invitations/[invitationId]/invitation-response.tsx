'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  PLAYER_STORE_KEY,
  findInvitation,
  parsePlayerStore,
  serializePlayerStore,
  type PlayerStoreState,
  type WorkspaceRecord,
} from '../../../src/player-store';
import {
  getMyPlayerTeamState,
  putMyPlayerTeamState,
  resolvePlayerTeamDemoViewerId,
} from '../../../src/player-team-online-api';
import {
  acceptTeamInvitation,
  declineTeamInvitation,
  getTeamInvitation,
  TeamInvitationApiError,
} from '../../../src/team-invitations-api';
import { usePlayerStore } from '../../../src/player-store-react';
import { AppShell } from '../../app-shell';
import { DiscordEntryScreen } from '../../discord-entry';

function withAcceptedWorkspace(
  current: PlayerStoreState,
  workspace: WorkspaceRecord,
  invitationId: string,
): PlayerStoreState {
  return {
    ...current,
    workspaces: [workspace, ...current.workspaces.filter((entry) => entry.id !== workspace.id)],
    pendingIncomingInvitations: current.pendingIncomingInvitations.filter(
      (entry) => entry.id !== invitationId,
    ),
    lastOpenedWorkspaceId: workspace.id,
    lastOpenedCharacterId: null,
  };
}

export function InvitationResponse() {
  const params = useParams<{ invitationId: string }>();
  const { state, hydrated, acceptInvitation, declineInvitation } = usePlayerStore();
  const [outcome, setOutcome] = useState<'accepted' | 'declined' | null>(null);
  const [serverInvitation, setServerInvitation] = useState<Awaited<ReturnType<typeof getTeamInvitation>> | null>(null);
  const [serverChecked, setServerChecked] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const localInvitation = useMemo(
    () => (hydrated ? findInvitation(state, params.invitationId) : null),
    [hydrated, state, params.invitationId],
  );

  useEffect(() => {
    if (!hydrated || state.authStatus !== 'authenticated' || !state.viewer) return;

    let cancelled = false;
    setServerChecked(false);
    setServerError(null);
    setServerInvitation(null);

    void getTeamInvitation(params.invitationId)
      .then((invitation) => {
        if (!cancelled) setServerInvitation(invitation);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof TeamInvitationApiError && error.status === 404) {
          setServerInvitation(null);
          return;
        }
        setServerError('Nie udało się zweryfikować zaproszenia z serwerem. Spróbuj ponownie.');
      })
      .finally(() => {
        if (!cancelled) setServerChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, params.invitationId, state.authStatus, state.viewer]);

  const allowLocalDemoFallback =
    process.env.NODE_ENV !== 'production' &&
    serverChecked &&
    serverError === null &&
    serverInvitation === null;
  const invitation = serverInvitation ?? (allowLocalDemoFallback ? localInvitation : null);

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

  if (!serverChecked) {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Sprawdzanie zaproszenia…</p>
      </main>
    );
  }

  if (serverError) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="invitation-page" id="main-content">
          <span className="eyebrow">Zaproszenie</span>
          <h1>Nie można zweryfikować zaproszenia</h1>
          <p>{serverError}</p>
          <button className="primary-button" onClick={() => window.location.reload()} type="button">
            Spróbuj ponownie
          </button>
        </main>
      </AppShell>
    );
  }

  const alreadyHandled =
    outcome !== null || (invitation !== null && invitation.status !== 'pending');

  if (!invitation && outcome === null) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="invitation-page" id="main-content">
          <span className="eyebrow">Zaproszenie</span>
          <h1>Nie znaleziono zaproszenia</h1>
          <p>
            Zaproszenie nie istnieje, wygasło albo jest przypisane do innego konta Discord.
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
  const viewerDiscordId = state.viewer.discordAccountId?.trim() ?? '';
  const legacyViewerDiscordId = /^\d{17,20}$/.test(state.viewer.id) ? state.viewer.id : '';
  const isRecipient =
    !!invitation &&
    (invitation.recipientDiscordId === viewerDiscordId ||
      invitation.recipientDiscordId === legacyViewerDiscordId);

  const persistAcceptedWorkspace = async (workspace: WorkspaceRecord): Promise<void> => {
    const viewerId = resolvePlayerTeamDemoViewerId(state.viewer!);
    let latest = await getMyPlayerTeamState({ viewerId });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const parsed = latest.state ? parsePlayerStore(JSON.stringify(latest.state)) : null;
      const base = parsed ?? state;
      const next = withAcceptedWorkspace(base, workspace, params.invitationId);
      const put = await putMyPlayerTeamState({
        viewerId,
        state: next as unknown as Record<string, unknown>,
        expectedRevision: latest.revision,
      });
      if (put.ok) {
        window.localStorage.setItem(PLAYER_STORE_KEY, serializePlayerStore(next));
        return;
      }
      if (!put.conflict || attempt === 1) {
        throw new Error(put.conflict ? 'Konflikt zapisu zespołu.' : put.error);
      }
      latest = await getMyPlayerTeamState({ viewerId });
    }
  };

  const handleAccept = async () => {
    if (!invitation || !isRecipient || working) return;
    setWorking(true);
    setActionError(null);
    try {
      if (serverInvitation !== null) {
        const result = await acceptTeamInvitation(invitation.id);
        await persistAcceptedWorkspace(result.workspace);
        setOutcome('accepted');
        window.location.assign(`/teams/${result.workspaceId}`);
        return;
      }

      // Development-only compatibility for explicitly seeded local demo invitations.
      acceptInvitation(invitation.id);
      setOutcome('accepted');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Nie udało się przyjąć zaproszenia.');
    } finally {
      setWorking(false);
    }
  };

  const handleDecline = async () => {
    if (!invitation || !isRecipient || working) return;
    setWorking(true);
    setActionError(null);
    try {
      if (serverInvitation !== null) {
        await declineTeamInvitation(invitation.id);
        declineInvitation(invitation.id);
      } else {
        // Development-only compatibility for explicitly seeded local demo invitations.
        declineInvitation(invitation.id);
      }
      setOutcome('declined');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Nie udało się odrzucić zaproszenia.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="invitation-page" id="main-content">
        <span className="eyebrow">Zaproszenie do przestrzeni</span>
        <h1>{teamName}</h1>
        <p>
          Od <strong>{inviterName}</strong> dla <strong>{recipientName}</strong>. Zalogowano jako{' '}
          <strong>{state.viewer.discordDisplayName}</strong>. Dostęp zostanie przyznany dopiero po
          akceptacji przez właściwe konto Discord.
        </p>

        {actionError ? (
          <p className="field-error" role="alert">
            {actionError}
          </p>
        ) : null}

        {!alreadyHandled && invitation && !isRecipient ? (
          <p className="entry-status" role="status">
            To zaproszenie jest przypisane do innego konta Discord. Zaloguj się na właściwe konto,
            żeby je przyjąć albo odrzucić.
          </p>
        ) : null}

        {!alreadyHandled && invitation && isRecipient ? (
          <div className="invitation-actions">
            <button
              className="primary-button"
              disabled={working}
              onClick={() => void handleAccept()}
              type="button"
            >
              {working ? 'Zapisywanie…' : 'Akceptuję i dołączam'}
            </button>
            <button
              className="secondary-button"
              disabled={working}
              onClick={() => void handleDecline()}
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
                <p>Dostęp do zespołu został przyznany Twojemu kontu Discord.</p>
              </>
            )}
            <a href={`/teams/${workspaceId}`}>Otwórz przestrzeń zespołu</a>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
