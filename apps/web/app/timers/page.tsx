'use client';

import { mapHuntingFixture } from '../../src/map-hunting';
import { MapHunting } from '../maps/map-hunting';

export default function TimersPage() {
  return <MapHunting initialSnapshot={mapHuntingFixture} initialView="timers" />;
}
