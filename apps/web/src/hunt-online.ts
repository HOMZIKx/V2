'use client';

import { useMemo } from 'react';

import { usePlayerStore } from './player-store-react';

export type HuntConnectionStatus = 'offline' | 'connecting' | 'online' | 'error';

export function playerTeamOnlineEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_PLAYER_TEAM_ONLINE_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_PLAYER_TEAM_ONLINE_ENABLED !== 'false')
  );
}

/** Resolve demo viewer for Timers/Party shared rooms + personal snapshot fields. */
export function useHuntViewer(): {
  readonly viewerId: string | null;
  readonly displayName: string;
  readonly onlineEnabled: boolean;
  readonly hydrated: boolean;
} {
  const store = usePlayerStore();
  const onlineEnabled = playerTeamOnlineEnabled();
  return useMemo(
    () => ({
      viewerId:
        store.state.authStatus === 'authenticated' && store.state.viewer
          ? store.state.viewer.id
          : null,
      displayName: store.state.viewer?.displayName ?? 'Gracz',
      onlineEnabled,
      hydrated: store.hydrated,
    }),
    [
      onlineEnabled,
      store.hydrated,
      store.state.authStatus,
      store.state.viewer,
    ],
  );
}

export function huntStatusLabel(status: HuntConnectionStatus): string {
  switch (status) {
    case 'online':
      return 'ONLINE';
    case 'connecting':
      return 'ONLINE';
    case 'error':
      return 'OFFLINE';
    default:
      return 'OFFLINE';
  }
}
