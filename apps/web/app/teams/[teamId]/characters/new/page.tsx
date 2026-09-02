import { newCharacterProfileFixture } from '../../../../../src/character-profile';
import { CharacterProfileForm } from '../character-profile-form';

export default function NewCharacterPage() {
  return <CharacterProfileForm initialSnapshot={newCharacterProfileFixture} />;
}
