'use client';

import { Suspense } from 'react';

import { CharacterEquipment } from './character-equipment';

export default function CharacterEquipmentPage() {
  return (
    <Suspense
      fallback={
        <main className="discord-entry" id="main-content">
          <p className="entry-status">Ładowanie…</p>
        </main>
      }
    >
      <CharacterEquipment />
    </Suspense>
  );
}
