'use client';

import { mapHuntingFixture } from '../../src/map-hunting';
import { PartyHunt } from '../maps/party-hunt';

export default function GeneralsMetinsPage() {
  return <PartyHunt initialSnapshot={mapHuntingFixture} />;
}
