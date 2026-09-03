import { parsePlayerStore, type PlayerStoreState } from './player-store';

export function shouldApplyServerSnapshot(input: {
  readonly localState: PlayerStoreState;
  readonly localSyncedRevision: number | null;
  readonly serverState: Record<string, unknown> | null;
  readonly serverRevision: number | null;
}): boolean {
  if (input.serverState === null || input.serverRevision === null) {
    return false;
  }

  const parsed = parsePlayerStore(JSON.stringify(input.serverState));
  if (parsed === null) {
    return false;
  }

  const serverEmpty = parsed.workspaces.length === 0 && !parsed.seededDemo;
  const localHasData =
    input.localState.seededDemo || input.localState.workspaces.length > 0;

  if (serverEmpty && localHasData) {
    return false;
  }

  const syncedRevision = input.localSyncedRevision ?? -1;
  return input.serverRevision > syncedRevision;
}

export function mergeServerSnapshot(
  localState: PlayerStoreState,
  serverState: PlayerStoreState,
): PlayerStoreState {
  return {
    ...serverState,
    authStatus: localState.authStatus,
    connection: localState.connection,
    viewer: serverState.viewer ?? localState.viewer,
  };
}
