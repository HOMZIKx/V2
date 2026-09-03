'use client';

import { mapHuntingFixture } from '../../src/map-hunting';
import { MapHunting } from './map-hunting';

/** Atlas + party entry; primary Timers surface lives at `/timers`. */
export default function MapsPage() {
  return <MapHunting initialSnapshot={mapHuntingFixture} initialView="map" />;
}
