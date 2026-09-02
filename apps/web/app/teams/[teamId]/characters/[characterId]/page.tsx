import { characterEquipmentFixture } from '../../../../../src/character-equipment';
import { CharacterEquipment } from './character-equipment';

export default function CharacterEquipmentPage() {
  return <CharacterEquipment initialSnapshot={characterEquipmentFixture} />;
}
