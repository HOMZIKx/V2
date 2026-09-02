import { editCharacterProfileFixture } from '../../../../../../src/character-profile';
import { CharacterProfileForm } from '../../character-profile-form';

export default function EditCharacterPage() {
  return <CharacterProfileForm initialSnapshot={editCharacterProfileFixture} />;
}
