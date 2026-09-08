'use client';

import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';

import {
  equipmentSlots,
  slotLabels,
  type EquipmentItem,
  type EquipmentSlot,
  type WorkspaceRecord,
} from '../../../../../src/player-store';
import { usePlayerStore } from '../../../../../src/player-store-react';
import { Icon } from '../../../../app-shell';
import styles from './team-equipment-enhancements.module.css';

type PickerFilter = 'all' | 'bag' | 'equipped';

type PickerTarget = {
  readonly characterId: string;
  readonly setId: string;
  readonly slot: EquipmentSlot;
};

const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

function normalizeBagLocation(item: EquipmentItem): string {
  const value = item.lastConfirmedLocation?.trim().toLocaleLowerCase('pl') ?? '';
  if (value === 'torba ii' || value === 'torba 2') return 'Torba II';
  if (value === 'magazyn') return 'Magazyn';
  return 'Torba I';
}

function findEquipLocation(workspace: WorkspaceRecord, itemId: string) {
  for (const character of workspace.characters) {
    if (character.archived) continue;
    for (const set of character.sets) {
      for (const slot of equipmentSlots) {
        if (set.assignments[slot] === itemId) {
          return {
            characterId: character.id,
            characterName: character.name,
            setId: set.id,
            setName: set.name,
            slot,
          } as const;
        }
      }
    }
  }
  return null;
}

function imageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files)) {
    if (allowedImageTypes.has(file.type)) return file;
  }
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !allowedImageTypes.has(item.type)) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

function screenshotInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    'input[type="file"][accept*="image/png"][accept*="image/jpeg"]',
  );
}

function injectScreenshotFile(file: File): boolean {
  if (!allowedImageTypes.has(file.type)) return false;
  const input = screenshotInput();
  if (!input) return false;
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

function itemArtwork(item: EquipmentItem) {
  return item.iconPath ? (
    <img alt="" src={item.iconPath} />
  ) : (
    <span className={styles.itemFallback} aria-hidden>
      <Icon name="equipment" size={22} />
    </span>
  );
}

export function TeamEquipmentEnhancements() {
  const params = useParams<{ teamId: string; characterId: string }>();
  const { state, writesEnabled, assignItem, confirmLocation, createSet } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const livingCharacters = useMemo(
    () => workspace?.characters.filter((character) => !character.archived) ?? [],
    [workspace],
  );

  const [heroActionsTarget, setHeroActionsTarget] = useState<HTMLElement | null>(null);
  const [screenshotTarget, setScreenshotTarget] = useState<HTMLElement | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerFilter, setPickerFilter] = useState<PickerFilter>('all');
  const [pickerQuery, setPickerQuery] = useState('');
  const [setModalOpen, setSetModalOpen] = useState(false);
  const [setCharacterId, setSetCharacterId] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [setError, setSetError] = useState<string | null>(null);
  const [screenshotHint, setScreenshotHint] = useState('');

  const equipLocations = useMemo(() => {
    const result = new Map<string, ReturnType<typeof findEquipLocation>>();
    if (!workspace) return result;
    for (const item of workspace.items) {
      if (!item.archived) result.set(item.id, findEquipLocation(workspace, item.id));
    }
    return result;
  }, [workspace]);

  useEffect(() => {
    const discoverTargets = () => {
      const manualButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
        button.textContent?.includes('Dodaj ręcznie'),
      );
      setHeroActionsTarget(manualButton?.parentElement ?? null);

      const input = screenshotInput();
      setScreenshotTarget(input?.parentElement?.parentElement ?? null);
    };

    discoverTargets();
    const observer = new MutationObserver(discoverTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!workspace) return;

    const interceptEmptySlot = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('button[title]');
      if (!button) return;

      const title = button.getAttribute('title') ?? '';
      const slot = equipmentSlots.find((candidate) => title === `${slotLabels[candidate]} — pusty slot`);
      if (!slot) return;

      const card = button.closest('article');
      const setSelect = card?.querySelector<HTMLSelectElement>('select[aria-label^="Aktywny set "]') ?? null;
      const setId = setSelect?.value ?? '';
      if (!setId) return;

      const character = workspace.characters.find(
        (entry) => !entry.archived && entry.sets.some((set) => set.id === setId),
      );
      if (!character) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPickerTarget({ characterId: character.id, setId, slot });
      setPickerFilter('all');
      setPickerQuery('');
    };

    document.addEventListener('click', interceptEmptySlot, true);
    return () => document.removeEventListener('click', interceptEmptySlot, true);
  }, [workspace]);

  useEffect(() => {
    const pasteImage = (event: ClipboardEvent) => {
      if (!screenshotInput()) return;
      const file = imageFromClipboard(event.clipboardData);
      if (!file) return;
      if (injectScreenshotFile(file)) {
        event.preventDefault();
        setScreenshotHint(`Wklejono: ${file.name || 'obraz ze schowka'}`);
      }
    };

    document.addEventListener('paste', pasteImage, true);
    return () => document.removeEventListener('paste', pasteImage, true);
  }, []);

  useEffect(() => {
    if (!setModalOpen || livingCharacters.length === 0) return;
    const preferred = livingCharacters.some((character) => character.id === params.characterId)
      ? params.characterId
      : livingCharacters[0]!.id;
    setSetCharacterId((current) =>
      livingCharacters.some((character) => character.id === current) ? current : preferred,
    );
  }, [livingCharacters, params.characterId, setModalOpen]);

  const pickerCharacter = pickerTarget
    ? livingCharacters.find((character) => character.id === pickerTarget.characterId) ?? null
    : null;
  const pickerSet = pickerCharacter && pickerTarget
    ? pickerCharacter.sets.find((set) => set.id === pickerTarget.setId) ?? null
    : null;

  const pickerItems = useMemo(() => {
    if (!workspace || !pickerTarget) return [];
    const normalized = pickerQuery.trim().toLocaleLowerCase('pl');
    return workspace.items
      .filter((item) => !item.archived && item.category === pickerTarget.slot)
      .filter((item) => {
        const location = equipLocations.get(item.id) ?? null;
        if (pickerFilter === 'bag') return !location;
        if (pickerFilter === 'equipped') return Boolean(location);
        return true;
      })
      .filter((item) => {
        if (!normalized) return true;
        return `${item.name} ${item.bonuses.join(' ')}`.toLocaleLowerCase('pl').includes(normalized);
      })
      .sort((left, right) => {
        const leftEquipped = Boolean(equipLocations.get(left.id));
        const rightEquipped = Boolean(equipLocations.get(right.id));
        if (leftEquipped !== rightEquipped) return leftEquipped ? 1 : -1;
        return left.name.localeCompare(right.name, 'pl');
      });
  }, [equipLocations, pickerFilter, pickerQuery, pickerTarget, workspace]);

  const chooseItemForSlot = (item: EquipmentItem) => {
    if (!workspace || !pickerTarget || !pickerCharacter || !writesEnabled) return;
    assignItem(
      workspace.id,
      pickerTarget.characterId,
      pickerTarget.setId,
      item.id,
      pickerTarget.slot,
    );
    confirmLocation(workspace.id, item.id, pickerCharacter.name);
    setPickerTarget(null);
  };

  const createNewSet = () => {
    if (!workspace || !writesEnabled) return;
    const name = newSetName.trim();
    if (!setCharacterId) {
      setSetError('Wybierz postać.');
      return;
    }
    if (name.length < 2) {
      setSetError('Podaj nazwę seta.');
      return;
    }

    const id = createSet(workspace.id, setCharacterId, { name, makeActive: true });
    if (!id) {
      setSetError('Nie udało się utworzyć seta.');
      return;
    }

    setSetModalOpen(false);
    setNewSetName('');
    setSetError(null);
  };

  const dropScreenshot = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((entry) => allowedImageTypes.has(entry.type)) ?? null;
    if (!file) {
      setScreenshotHint('Upuść plik PNG, JPG/JPEG albo WEBP.');
      return;
    }
    if (injectScreenshotFile(file)) setScreenshotHint(`Dodano: ${file.name}`);
  };

  const openFilePicker = () => screenshotInput()?.click();

  const onPasteZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  };

  return (
    <>
      {heroActionsTarget
        ? createPortal(
            <button
              className={styles.newSetButton}
              disabled={!writesEnabled || livingCharacters.length === 0}
              onClick={() => {
                setNewSetName('');
                setSetError(null);
                setSetModalOpen(true);
              }}
              type="button"
            >
              <Icon name="plus" size={16} /> Nowy set
            </button>,
            heroActionsTarget,
          )
        : null}

      {screenshotTarget
        ? createPortal(
            <div
              className={styles.pasteZone}
              contentEditable
              onClick={openFilePicker}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={dropScreenshot}
              onInput={(event) => {
                event.currentTarget.textContent = '';
              }}
              onKeyDown={onPasteZoneKeyDown}
              role="button"
              suppressContentEditableWarning
              tabIndex={0}
            >
              <Icon name="equipment" size={22} />
              <strong>Wklej lub przeciągnij screen</strong>
              <span>Ctrl+V · PPM → Wklej · przeciągnij plik · kliknij, aby wybrać</span>
              {screenshotHint ? <small>{screenshotHint}</small> : null}
            </div>,
            screenshotTarget,
          )
        : null}

      {pickerTarget && pickerCharacter && pickerSet
        ? createPortal(
            <div className={styles.backdrop} onMouseDown={() => setPickerTarget(null)} role="presentation">
              <section
                aria-modal="true"
                className={styles.pickerModal}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
              >
                <header className={styles.modalHeader}>
                  <div>
                    <span>{pickerCharacter.name} · {pickerSet.name}</span>
                    <h2>Wybierz: {slotLabels[pickerTarget.slot]}</h2>
                  </div>
                  <button aria-label="Zamknij" onClick={() => setPickerTarget(null)} type="button">
                    <Icon name="x" size={18} />
                  </button>
                </header>

                <div className={styles.pickerControls}>
                  <div className={styles.filterTabs}>
                    {([
                      ['all', 'Wszystkie'],
                      ['bag', 'Tylko torba'],
                      ['equipped', 'Założone'],
                    ] as const).map(([value, label]) => (
                      <button
                        aria-pressed={pickerFilter === value}
                        className={pickerFilter === value ? styles.filterActive : styles.filterButton}
                        key={value}
                        onClick={() => setPickerFilter(value)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    aria-label={`Szukaj ${slotLabels[pickerTarget.slot]}`}
                    onChange={(event) => setPickerQuery(event.target.value)}
                    placeholder="Szukaj po nazwie albo bonusie…"
                    value={pickerQuery}
                  />
                </div>

                <div className={styles.pickerList}>
                  {pickerItems.length === 0 ? (
                    <div className={styles.emptyPicker}>
                      <Icon name="equipment" size={28} />
                      <strong>Brak pasujących przedmiotów</strong>
                      <span>Dodaj przedmiot ręcznie albo ze screena i wróć do tego slotu.</span>
                    </div>
                  ) : null}
                  {pickerItems.map((item) => {
                    const location = equipLocations.get(item.id) ?? null;
                    return (
                      <button
                        className={styles.pickerItem}
                        disabled={!writesEnabled}
                        key={item.id}
                        onClick={() => chooseItemForSlot(item)}
                        type="button"
                      >
                        <span className={styles.itemArtwork}>{itemArtwork(item)}</span>
                        <span className={styles.itemCopy}>
                          <strong>{item.name}</strong>
                          <small>{item.bonuses.slice(0, 2).join(' · ') || 'Brak bonusów'}</small>
                        </span>
                        <span className={location ? styles.equippedBadge : styles.bagBadge}>
                          {location
                            ? `ZAŁOŻONY · ${location.characterName} · ${location.setName}`
                            : `TORBA · ${normalizeBagLocation(item)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}

      {setModalOpen
        ? createPortal(
            <div className={styles.backdrop} onMouseDown={() => setSetModalOpen(false)} role="presentation">
              <section
                aria-modal="true"
                className={styles.setModal}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
              >
                <header className={styles.modalHeader}>
                  <div>
                    <span>Konfiguracja EQ</span>
                    <h2>Nowy set</h2>
                  </div>
                  <button aria-label="Zamknij" onClick={() => setSetModalOpen(false)} type="button">
                    <Icon name="x" size={18} />
                  </button>
                </header>

                <label className={styles.field}>
                  <span>Postać</span>
                  <select onChange={(event) => setSetCharacterId(event.target.value)} value={setCharacterId}>
                    {livingCharacters.map((character) => (
                      <option key={character.id} value={character.id}>{character.name}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Nazwa seta</span>
                  <input
                    autoFocus
                    onChange={(event) => {
                      setNewSetName(event.target.value);
                      setSetError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        createNewSet();
                      }
                    }}
                    placeholder="np. PvP, Grota, Metiny"
                    value={newSetName}
                  />
                </label>

                <p className={styles.setNote}>Nowy set zostanie od razu ustawiony jako aktywny dla wybranej postaci.</p>
                {setError ? <p className={styles.error}>{setError}</p> : null}

                <footer className={styles.modalActions}>
                  <button className={styles.cancelButton} onClick={() => setSetModalOpen(false)} type="button">
                    Anuluj
                  </button>
                  <button className={styles.confirmButton} disabled={!writesEnabled} onClick={createNewSet} type="button">
                    <Icon name="plus" size={15} /> Utwórz set
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
