import { describe, expect, it } from 'vitest';

import {
  extractHuntFieldsFromState,
  mergeHuntFieldsIntoState,
  parseMapHuntSnapshot,
  parsePartyHuntSnapshot,
  preserveHuntFieldsOnPut,
  type MapHuntSnapshotV1,
  type PartyHuntSnapshotV1,
} from './hunt-snapshot';

const mapHunt: MapHuntSnapshotV1 = {
  version: 1,
  mapKey: 'Yongbi',
  channel: 2,
  filter: 'all',
  miniMode: false,
  store: {
    'Yongbi:ch2': [
      {
        key: 'Yongbi:ch2:metin:1',
        mapKey: 'Yongbi',
        channel: 2,
        kind: 'metin',
        entity: {
          id: 'metin-1',
          name: 'Metin',
          respawnTimeMin: 5,
          respawnTimeMax: 10,
        },
        confirmedAt: 1,
        confirmedBy: 'Mateusz',
        location: { x: 10, y: 20 },
      },
    ],
  },
  metinCounts: { Yongbi: { stone: 3 } },
  updatedAtIso: '2026-09-04T12:00:00.000Z',
};

const partyHunt: PartyHuntSnapshotV1 = {
  version: 1,
  mapKey: 'Yongbi',
  channel: 1,
  miniMode: true,
  partyRoomId: 'party-abc',
  lastJoinCode: '4242',
  party: null,
  pins: [],
  savedClosedParty: null,
  updatedAtIso: '2026-09-04T12:00:00.000Z',
};

describe('hunt-snapshot', () => {
  it('parses versioned mapHunt and partyHunt', () => {
    expect(parseMapHuntSnapshot(mapHunt)?.mapKey).toBe('Yongbi');
    expect(parsePartyHuntSnapshot(partyHunt)?.partyRoomId).toBe('party-abc');
    expect(parseMapHuntSnapshot({ version: 99, mapKey: 'x', channel: 1 })).toBeNull();
  });

  it('merges hunt fields without dropping EQ keys', () => {
    const base = {
      authStatus: 'authenticated',
      workspaces: [{ id: 'ws-1', items: [{ id: 'sword' }] }],
      seededDemo: true,
    };
    const merged = mergeHuntFieldsIntoState(base, { mapHunt, partyHunt });
    expect(merged.workspaces).toEqual(base.workspaces);
    expect(merged.mapHunt).toEqual(mapHunt);
    expect(merged.partyHunt).toEqual(partyHunt);
  });

  it('preserves server hunt fields when local EQ put omits them', () => {
    const server = {
      authStatus: 'authenticated',
      workspaces: [],
      mapHunt,
      partyHunt,
    };
    const local = {
      authStatus: 'authenticated',
      workspaces: [{ id: 'ws-2' }],
      seededDemo: true,
    };
    const put = preserveHuntFieldsOnPut(local, server);
    expect(put.workspaces).toEqual([{ id: 'ws-2' }]);
    expect(put.mapHunt).toEqual(mapHunt);
    expect(put.partyHunt).toEqual(partyHunt);
  });

  it('extracts hunt fields from raw state objects', () => {
    const extracted = extractHuntFieldsFromState({
      mapHunt,
      partyHunt,
      workspaces: [],
    });
    expect(extracted.mapHunt?.channel).toBe(2);
    expect(extracted.partyHunt?.lastJoinCode).toBe('4242');
  });

  it('round-trips through JSON like parsePlayerStore / serialize', () => {
    const state = {
      authStatus: 'authenticated',
      connection: 'connected',
      viewer: { id: 'mateusz' },
      workspaces: [],
      pendingIncomingInvitations: [],
      lastOpenedWorkspaceId: null,
      lastOpenedCharacterId: null,
      intendedDestination: null,
      seededDemo: false,
      mapHunt,
      partyHunt,
    };
    const raw = JSON.stringify(state);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parseMapHuntSnapshot(parsed.mapHunt)?.store['Yongbi:ch2']?.[0]?.key).toBe(
      'Yongbi:ch2:metin:1',
    );
    expect(parsePartyHuntSnapshot(parsed.partyHunt)?.miniMode).toBe(true);
  });
});
