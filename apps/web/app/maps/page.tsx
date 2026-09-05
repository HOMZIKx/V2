'use client';

import { mapHuntingFixture } from '../../src/map-hunting';
import { PartyHunt } from './party-hunt';

export default function MapsPage() {
  return <PartyHunt initialSnapshot={mapHuntingFixture} />;
}
