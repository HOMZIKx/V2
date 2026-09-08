'use client';

import { Suspense } from 'react';

import { CharacterEquipmentV2 } from './character-equipment-v2';

export default function CharacterEquipmentPage() {
  return (
    <Suspense
      fallback={
        <main className="discord-entry" id="main-content">
          <p className="entry-status">Ładowanie…</p>
        </main>
      }
    >
      <CharacterEquipmentV2 />
    </Suspense>
  );
}
