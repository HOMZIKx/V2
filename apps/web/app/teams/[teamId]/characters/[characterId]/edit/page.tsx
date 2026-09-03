'use client';

import { useParams } from 'next/navigation';

import { CharacterProfileForm } from '../../character-profile-form';

export default function EditCharacterPage() {
  const params = useParams<{ characterId: string }>();
  return <CharacterProfileForm characterId={params.characterId} mode="edit" />;
}
