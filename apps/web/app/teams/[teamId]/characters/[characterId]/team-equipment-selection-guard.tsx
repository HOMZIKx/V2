'use client';

import { useEffect } from 'react';

function visibleInventoryTiles(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[aria-pressed][draggable="true"]'),
  );
}

function findInventoryTile(itemName: string, characterName: string, setName: string) {
  const candidates = visibleInventoryTiles();
  const exact = candidates.find((button) => {
    const text = button.textContent ?? '';
    return text.includes(itemName) && text.includes(characterName) && text.includes(setName);
  });
  if (exact) return exact;
  return candidates.find((button) => (button.textContent ?? '').includes(itemName)) ?? null;
}

function revealEquippedInventoryItems() {
  const allTab = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')).find(
    (button) => (button.textContent ?? '').trim().startsWith('Wszystkie'),
  );
  allTab?.click();

  const showAssigned = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => (button.textContent ?? '').trim() === 'Pokaż założone',
  );
  showAssigned?.click();
}

/**
 * Occupied slots are selection targets. Empty + slots keep the category picker
 * behaviour provided by TeamEquipmentEnhancements.
 */
export function TeamEquipmentSelectionGuard() {
  useEffect(() => {
    const onOccupiedSlotClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('article button[title]');
      if (!button) return;

      const itemName = (button.getAttribute('title') ?? '').trim();
      if (!itemName || itemName.includes('— pusty slot')) return;

      const card = button.closest('article');
      const setSelect = card?.querySelector<HTMLSelectElement>('select[aria-label^="Aktywny set "]') ?? null;
      const characterName = (setSelect?.getAttribute('aria-label') ?? '')
        .replace(/^Aktywny set\s+/, '')
        .trim();
      const setName = setSelect?.selectedOptions[0]?.textContent?.trim() ?? '';
      if (!characterName || !setName) return;

      const choose = () => {
        const tile = findInventoryTile(itemName, characterName, setName);
        if (!tile) return false;
        tile.click();
        tile.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return true;
      };

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (choose()) return;
      revealEquippedInventoryItems();
      window.setTimeout(() => {
        choose();
      }, 60);
    };

    document.addEventListener('click', onOccupiedSlotClick, true);
    return () => document.removeEventListener('click', onOccupiedSlotClick, true);
  }, []);

  return null;
}
