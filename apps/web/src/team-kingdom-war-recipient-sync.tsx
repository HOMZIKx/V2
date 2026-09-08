'use client';

import { useEffect, useRef } from 'react';

import { syncKingdomWarRecipients } from './discord-notify-api';
import { listTeamNotifyDiscordRecipients } from './player-store';
import { usePlayerStore } from './player-store-react';

/**
 * Keep the gateway's kingdom-war recipient registry isolated per workspace.
 * Only recipient-set changes are synced; ordinary EQ/timer edits do not spam the gateway.
 */
export function TeamKingdomWarRecipientSync(): null {
  const { state, hydrated } = usePlayerStore();
  const lastSyncedRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!hydrated || state.authStatus !== 'authenticated' || !state.viewer) return;

    for (const workspace of state.workspaces) {
      const recipients = workspace.archived
        ? []
        : listTeamNotifyDiscordRecipients(workspace, 'kingdomWar', state.viewer).sort();
      const signature = JSON.stringify(recipients);
      if (lastSyncedRef.current.get(workspace.id) === signature) continue;

      void syncKingdomWarRecipients(workspace.id, recipients).then((result) => {
        if (result.ok) {
          lastSyncedRef.current.set(workspace.id, signature);
        } else {
          console.warn('kingdom-war: team recipient sync failed', {
            workspaceId: workspace.id,
            error: result.error,
          });
        }
      });
    }
  }, [hydrated, state.authStatus, state.viewer, state.workspaces]);

  return null;
}
