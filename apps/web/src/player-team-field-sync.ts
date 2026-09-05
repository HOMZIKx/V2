import {
  getMyPlayerTeamState,
  putMyPlayerTeamState,
} from './player-team-online-api';
import {
  mergeHuntFieldsIntoState,
  parseMapHuntSnapshot,
  parsePartyHuntSnapshot,
  type MapHuntSnapshotV1,
  type PartyHuntSnapshotV1,
} from './hunt-snapshot';

export type HuntFieldSyncResult =
  | { readonly ok: true; readonly revision: number | null }
  | { readonly ok: false; readonly error: string };

async function putMergedField(input: {
  readonly viewerId: string;
  readonly mapHunt?: MapHuntSnapshotV1 | null;
  readonly partyHunt?: PartyHuntSnapshotV1 | null;
}): Promise<HuntFieldSyncResult> {
  const attempt = async (): Promise<HuntFieldSyncResult> => {
    let latest;
    try {
      latest = await getMyPlayerTeamState({ viewerId: input.viewerId });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    const base: Record<string, unknown> = latest.state ?? {};
    const merged = mergeHuntFieldsIntoState(base, {
      ...(input.mapHunt !== undefined ? { mapHunt: input.mapHunt } : {}),
      ...(input.partyHunt !== undefined ? { partyHunt: input.partyHunt } : {}),
    });

    const result = await putMyPlayerTeamState({
      viewerId: input.viewerId,
      state: merged,
      expectedRevision: latest.revision,
    });

    if (result.ok) {
      return { ok: true, revision: result.revision };
    }

    if (result.conflict) {
      return { ok: false, error: 'conflict' };
    }

    return { ok: false, error: result.error };
  };

  const first = await attempt();
  if (first.ok || first.error !== 'conflict') return first;

  // OCC conflict: retry once with a fresh GET.
  return attempt();
}

export async function putMapHuntField(input: {
  readonly viewerId: string;
  readonly mapHunt: MapHuntSnapshotV1;
}): Promise<HuntFieldSyncResult> {
  return putMergedField({ viewerId: input.viewerId, mapHunt: input.mapHunt });
}

export async function putPartyHuntField(input: {
  readonly viewerId: string;
  readonly partyHunt: PartyHuntSnapshotV1;
}): Promise<HuntFieldSyncResult> {
  return putMergedField({ viewerId: input.viewerId, partyHunt: input.partyHunt });
}

export async function loadHuntFieldsFromServer(input: {
  readonly viewerId: string;
}): Promise<{
  readonly mapHunt: MapHuntSnapshotV1 | null;
  readonly partyHunt: PartyHuntSnapshotV1 | null;
  readonly revision: number | null;
  readonly ok: boolean;
  readonly error?: string;
}> {
  try {
    const latest = await getMyPlayerTeamState({ viewerId: input.viewerId });
    const state = latest.state ?? {};
    return {
      ok: true,
      revision: latest.revision,
      mapHunt: parseMapHuntSnapshot(state.mapHunt),
      partyHunt: parsePartyHuntSnapshot(state.partyHunt),
    };
  } catch (e) {
    return {
      ok: false,
      revision: null,
      mapHunt: null,
      partyHunt: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
