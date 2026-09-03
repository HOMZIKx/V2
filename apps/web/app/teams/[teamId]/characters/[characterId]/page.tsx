import { getCharacterEquipmentFixture } from '../../../../../src/character-equipment';
import { CharacterEquipment } from './character-equipment';

export default async function CharacterEquipmentPage({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  const snapshot = getCharacterEquipmentFixture(characterId);
  if (!snapshot) return <main className="page-empty"><h1>Nie znaleziono postaci</h1><a href="/characters">Wróć do postaci</a></main>;
  return <CharacterEquipment initialSnapshot={snapshot} />;
}
