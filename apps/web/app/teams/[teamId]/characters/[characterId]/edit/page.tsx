import { getEditCharacterProfileFixture } from '../../../../../../src/character-profile';
import { CharacterProfileForm } from '../../character-profile-form';

export default async function EditCharacterPage({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  const snapshot = getEditCharacterProfileFixture(characterId);
  if (!snapshot) return <main className="page-empty"><h1>Nie znaleziono postaci</h1><a href="/characters">Wróć do postaci</a></main>;
  return <CharacterProfileForm initialSnapshot={snapshot} />;
}
