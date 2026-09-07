'use client';

import { mapHuntingFixture } from '../../src/map-hunting';
import { MapHunting } from '../maps/map-hunting';

export default function GeneralsMetinsPage() {
  return (
    <MapHunting
      initialSnapshot={mapHuntingFixture}
      shellSection="generaly-metki"
      title="Generały / Metiny"
    />
  );
}
