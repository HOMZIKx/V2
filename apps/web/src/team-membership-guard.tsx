'use client';

import { useEffect, useRef } from 'react';

import {
  PLAYER_STORE_KEY,
  parsePlayerStore,
  serializePlayerStore,
  type PlayerStoreState,
} from './player-store';
import {
  getMyPlayerTeamState,
  putMyPlayerTeamState,
  resolvePlayerTeamDemoViewerId,
} from './player-team-online-api';
import { usePlayerStore } from './player-store-react';

function withoutWorkspace(state: PlayerStoreState, workspaceId: string): PlayerStoreState {
  const workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId);
  const removedWasLast = state.lastOpenedWorkspaceId === workspaceId;
  return {
    ...state,
    workspaces,
    lastOpenedWorkspaceId: removedWasLast ? (workspaces[0]?.id ?? null) : state.lastOpenedWorkspaceId,
    lastOpenedCharacterId: removedWasLast ? null : state.lastOpenedCharacterId,
  };
}

async function isMembershipRevoked(workspaceId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `/player-team/v1/workspaces/${encodeURIComponent(workspaceId)}/state`,
      { method: 'GET', cache: 'no-store', credentials: 'include' },
    );
    if (response.status !== 401) return false;
    const body = (await response.json().catch(() => null)) as {
      readonly error?: { readonly code?: string; readonly message?: string };
    } | null;
    return (
      body?.error?.code === 'UNAUTHORIZED' &&
      (body.error.message === 'viewer is not a shared workspace member' ||
        body.error.message === 'viewer is not authorised for shared workspace')
    );
  } catch {
    return false;
  }
}

export function TeamMembershipGuard() {
  const { state, hydrated } = usePlayerStore();
  const cleaningRef = useRef(false);
  const workspaceIdsKey = state.workspaces
    .filter((workspace) => !workspace.archived)
    .map((workspace) => workspace.id)
    .sort()
    .join('|');

  useEffect(() => {
    if (
      !hydrated ||
      state.authStatus !== 'authenticated' ||
      !state.viewer ||
      workspaceIdsKey.length === 0
    ) {
      return;
    }

    const check = async () => {
      if (cleaningRef.current) return;
      const activeIds = state.workspaces
        .filter((workspace) => !workspace.archived)
        .map((workspace) => workspace.id);

      for (const workspaceId of activeIds) {
        if (!(await isMembershipRevoked(workspaceId))) continue;
        cleaningRef.current = true;
        try {
          const viewerId = resolvePlayerTeamDemoViewerId(state.viewer!);
          let latest = await getMyPlayerTeamState({ viewerId });
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const parsed = latest.state ? parsePlayerStore(JSON.stringify(latest.state)) : null;
            const next = withoutWorkspace(parsed ?? state, workspaceId);
            const result = await putMyPlayerTeamState({
              viewerId,
              state: next as unknown as Record<string, unknown>,
              expectedRevision: latest.revision,
            });
            if (result.ok) {
              window.localStorage.setItem(PLAYER_STORE_KEY, serializePlayerStore(next));
              window.location.assign('/');
              return;
            }
            if (!result.conflict || attempt === 1) return;
            latest = await getMyPlayerTeamState({ viewerId });
          }
        } finally {
          cleaningRef.current = false;
        }
        return;
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), 5_000);
    return () => window.clearInterval(interval);
  }, [hydrated, state, state.authStatus, state.viewer, workspaceIdsKey]);

  return null;
}
