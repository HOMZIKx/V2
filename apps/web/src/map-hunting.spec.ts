import { describe, expect, it } from 'vitest';

import {
  confirmHuntMarker,
  filterHuntMarkers,
  getMapHuntingSummary,
  mapHuntingFixture,
} from './map-hunting.js';

describe('map hunting domain', () => {
  it('keeps map sessions independent from characters and teams', () => {
    expect(getMapHuntingSummary(mapHuntingFixture)).toEqual({
      sessionCount: 2,
      readyMarkers: 1,
      runningMarkers: 2,
      participantCount: 8,
    });
  });

  it('filters map markers by their own respawn state', () => {
    const session = mapHuntingFixture.sessions[0]!;

    expect(filterHuntMarkers(session.markers, 'unknown')).toHaveLength(1);
    expect(filterHuntMarkers(session.markers, 'ready')[0]?.name).toBe('Drzewiec');
  });

  it('records a confirmation against the map marker rather than equipment or a character', () => {
    const session = mapHuntingFixture.sessions[0]!;
    const updated = confirmHuntMarker(session, 'red-forest-boss-1', 'Mateusz');
    const marker = updated.markers.find((entry) => entry.id === 'red-forest-boss-1');

    expect(marker).toMatchObject({
      status: 'running',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedLabel: 'teraz',
    });
    expect(session.markers.find((entry) => entry.id === 'red-forest-boss-1')?.status).toBe('ready');
  });
});
