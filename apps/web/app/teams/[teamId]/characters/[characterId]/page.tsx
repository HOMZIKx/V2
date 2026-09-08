'use client';

import { Suspense } from 'react';

import { CharacterEquipment } from './character-equipment';
import { EquipmentScreenshotAdd } from './equipment-screenshot-add';
import styles from './team-equipment-board.module.css';

export default function CharacterEquipmentPage() {
  return (
    <div className={styles.boardScope}>
      <Suspense
        fallback={
          <main className="discord-entry" id="main-content">
            <p className="entry-status">Ładowanie…</p>
          </main>
        }
      >
        <CharacterEquipment />
        <EquipmentScreenshotAdd />
      </Suspense>
    </div>
  );
}
