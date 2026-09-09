'use client';

import { Suspense } from 'react';

import { EquipmentScreenshotAdd } from './equipment-screenshot-add';
import { TeamEquipmentEnhancements } from './team-equipment-enhancements';
import { TeamEquipmentSelectionGuard } from './team-equipment-selection-guard';
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
      <EquipmentScreenshotAdd />
      <TeamEquipmentEnhancements />
      <TeamEquipmentSelectionGuard />
    </Suspense>
  );
}
