'use client';

import { mapHuntingFixture } from '../../src/map-hunting';
import { PartyHunt } from './party-hunt';

/** Party hunt session (DEC-067). SpawnTimers live at `/timers`. */
export default function MapsPage() {
  return <PartyHunt initialSnapshot={mapHuntingFixture} />;
}
