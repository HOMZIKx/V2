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

function mergeViewerProfile(
  localViewer: PlayerStoreState['viewer'],
  serverViewer: PlayerStoreState['viewer'],
): PlayerStoreState['viewer'] {
  if (!serverViewer) return localViewer;
  if (!localViewer) return serverViewer;
  if (localViewer.id !== serverViewer.id) return serverViewer;

  // A stale server snapshot must never turn a profile that was already
  // completed on this device back into the first-login setup state.
  if (localViewer.profileSetupDone === true && serverViewer.profileSetupDone !== true) {
    return {
      ...serverViewer,
      displayName: localViewer.displayName,
      initials: localViewer.initials,
      profileSetupDone: true,
      ...(localViewer.avatarNote !== undefined
        ? { avatarNote: localViewer.avatarNote }
        : {}),
    };
  }

  return serverViewer;
}

export function mergeServerSnapshot(
  localState: PlayerStoreState,
  serverState: PlayerStoreState,
): PlayerStoreState {
  return {
    ...serverState,
    authStatus: localState.authStatus,
    connection: localState.connection,
    viewer: mergeViewerProfile(localState.viewer, serverState.viewer),
  };
}
