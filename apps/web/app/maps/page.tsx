import { mapHuntingFixture } from '../../src/map-hunting';

import { MapHunting } from './map-hunting';

export default function MapsPage() {
  return <MapHunting initialSnapshot={mapHuntingFixture} />;
}
