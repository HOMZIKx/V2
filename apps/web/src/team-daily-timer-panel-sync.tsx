'use client';

import { useEffect, useRef } from 'react';

import { listTeamNotifyDiscordRecipients } from './player-store';
import { usePlayerStore } from './player-store-react';
import { syncTeamDailyTimerPanelRecipients } from './team-daily-timer-panel-api';

/** Keep daily timer-panel membership in sync with the authoritative workspace roster. */
export function TeamDailyTimerPanelSync(): null {
  const { state, hydrated } = usePlayerStore();
  const lastSyncedRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!hydrated || state.authStatus !== 'authenticated' || !state.viewer) return;

    for (const workspace of state.workspaces) {
      const recipients = workspace.archived
        ? []
        : listTeamNotifyDiscordRecipients(workspace, 'characterTimers', state.viewer).sort();
      const signature = JSON.stringify(recipients);
      if (lastSyncedRef.current.get(workspace.id) === signature) continue;
      void syncTeamDailyTimerPanelRecipients(workspace.id).then((ok) => {
        if (ok) lastSyncedRef.current.set(workspace.id, signature);
        else console.warn('daily-timer-panel: recipient sync failed', { workspaceId: workspace.id });
      });
    }
  }, [hydrated, state.authStatus, state.viewer, state.workspaces]);

  return null;
}
