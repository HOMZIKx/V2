'use client';

import { Suspense } from 'react';

import { TeamEquipmentV2 } from './team-equipment-v2';

export default function CharacterEquipmentPage() {
  return (
    <Suspense
      fallback={
        <main className="discord-entry" id="main-content">
          <p className="entry-status">Ładowanie…</p>
        </main>
      }
    >
      <TeamEquipmentV2 />
    </Suspense>
  );
}
