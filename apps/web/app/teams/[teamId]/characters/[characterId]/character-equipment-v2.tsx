'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { resolveAiObservationFeedback } from '../../../../../src/ai-observation-feedback';
import { formatCharacterClassLine } from '../../../../../src/character-profile';
import {
  equipmentSlotForCategory,
  isItemCompatibleWithClass,
  parseEnhancementFromName,
  searchGameItems,
  stripEnhancementFromName,
  type GameItem,
} from '../../../../../src/item-catalog';
import {
  equipmentSlots,
  slotLabels,
  type EquipmentItem,
  type EquipmentSlot,
  type WorkspaceRecord,
} from '../../../../../src/player-store';
import { usePlayerStore } from '../../../../../src/player-store-react';
import { AppShell, Icon } from '../../../../app-shell';
import { CharacterEquipment as LegacyCharacterEquipment } from './character-equipment';
import styles from './character-equipment-v2.module.css';

type InventoryMode = 'equipped' | 'bag';
type BagLocation = 'Torba I' | 'Torba II' | 'Magazyn';
type EditorMode = 'manual' | 'screenshot' | 'edit' | null;

const BAG_LOCATIONS: readonly BagLocation[] = ['Torba I', 'Torba II', 'Magazyn'];
const REMOVED_LOCATION = 'Usunięte';
const BAG_CAPACITY: Readonly<Record<BagLocation, number>> = {
  'Torba I': 48,
  'Torba II': 48,
  Magazyn: 72,
};

const slotClassNames: Readonly<Record<EquipmentSlot, string>> = {
  weapon: styles.slotWeapon,
  armor: styles.slotArmor,
  helmet: styles.slotHelmet,
  shield: styles.slotShield,
  earrings: styles.slotEarrings,
  necklace: styles.slotNecklace,
  bracelet: styles.slotBracelet,
  shoes: styles.slotShoes,
};

interface ItemDraft {
  readonly name: string;
  readonly enhancement: number;
  readonly category: EquipmentSlot;
  readonly bonusesText: string;
  readonly confidence: number | null;
  readonly notes: string;
}

interface ScreenshotAnalysisPayload {
  readonly analysisId?: string | null;
  readonly draft?: {
    readonly name?: string;
    readonly enhancement?: number;
    readonly category?: EquipmentSlot | null;
    readonly bonuses?: readonly string[];
    readonly confidence?: number;
    readonly notes?: string;
  };
  readonly error?: string;
}

function normalizeBagLocation(item: EquipmentItem): BagLocation | 'removed' {
  const value = item.lastConfirmedLocation?.trim().toLocaleLowerCase('pl') ?? '';
  if (value === REMOVED_LOCATION.toLocaleLowerCase('pl')) return 'removed';
  if (value === 'torba ii' || value === 'torba 2') return 'Torba II';
  if (value === 'magazyn') return 'Magazyn';
  return 'Torba I';
}

function findEquipLocation(
  workspace: WorkspaceRecord,
  itemId: string,
): {
  readonly characterId: string;
  readonly characterName: string;
  readonly setId: string;
  readonly setName: string;
  readonly slot: EquipmentSlot;
} | null {
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
          };
        }
      }
    }
  }
  return null;
}

function cleanBonusLines(value: string): readonly string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
}

function clampEnhancement(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(9, Math.max(0, Math.trunc(value)));
}

function startsSocketGroup(value: string): boolean {
  const line = value.trim();
  return /^(?:Kamień Duszy|Kamien Duszy)\b/iu.test(line) ||
    /^(?:Białe Złoto|Biale Zloto|Złoto|Zloto|Srebro|Miedź|Miedz|Jadeit|Heban|Ametyst|Kryształ|Krysztal|Niebiańskie Łzy|Niebiańskie Lzy)\b/iu.test(line);
}

function splitDisplayedBonuses(lines: readonly string[]): {
  readonly regular: readonly string[];
  readonly sockets: readonly string[];
} {
  const firstSocket = lines.findIndex(startsSocketGroup);
  if (firstSocket < 0) return { regular: lines, sockets: [] };
  return { regular: lines.slice(0, firstSocket), sockets: lines.slice(firstSocket) };
}

function itemImage(item: EquipmentItem) {
  return item.iconPath ? (
    <img alt="" src={item.iconPath} />
  ) : (
    <span className={styles.itemFallback} aria-hidden>
      <Icon name="equipment" size={22} />
    </span>
  );
}

function ItemTile({
  item,
  selected,
  meta,
  onClick,
}: {
  readonly item: EquipmentItem;
  readonly selected: boolean;
  readonly meta?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`${styles.itemTile}${selected ? ` ${styles.itemTileSelected}` : ''}`}
      onClick={onClick}
      type="button"
    >
      <span className={styles.itemTileIcon}>{itemImage(item)}</span>
      <span className={styles.itemTileCopy}>
        <strong>{item.name}</strong>
        <small>{meta ?? slotLabels[item.category]}</small>
      </span>
      {item.enhancement >= 7 ? <em className={styles.enhancement}>+{item.enhancement}</em> : null}
    </button>
  );
}

function CatalogSuggestion({
  item,
  onChoose,
}: {
  readonly item: GameItem;
  readonly onChoose: (item: GameItem) => void;
}) {
  const slot = equipmentSlotForCategory(item.category);
  if (!slot) return null;
  return (
    <button className={styles.catalogSuggestion} onClick={() => onChoose(item)} type="button">
      <span className={styles.catalogSuggestionIcon}>
        {item.sourceImageUrl || item.imagePath ? (
          <img alt="" src={item.sourceImageUrl ?? item.imagePath ?? ''} />
        ) : (
          <Icon name="equipment" size={18} />
        )}
      </span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.category}</small>
      </span>
    </button>
  );
}

export function CharacterEquipmentV2() {
  const params = useParams<{ teamId: string; characterId: string }>();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('view') === 'timers' ? 'timers' : 'eq';
  const {
    state,
    hydrated,
    writesEnabled,
    assignItem,
    unequipItem,
    setActiveSet,
    createItem,
    updateItem,
    archiveItem,
    confirmLocation,
  } = usePlayerStore();

  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const character =
    workspace?.characters.find((entry) => entry.id === params.characterId && !entry.archived) ?? null;

  const [inventoryMode, setInventoryMode] = useState<InventoryMode>('equipped');
  const [bagLocation, setBagLocation] = useState<BagLocation>('Torba I');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [draft, setDraft] = useState<ItemDraft>({
    name: '',
    enhancement: 0,
    category: 'weapon',
    bonusesText: '',
    confidence: null,
    notes: '',
  });
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [categoryReviewRequired, setCategoryReviewRequired] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotAnalysisId, setScreenshotAnalysisId] = useState<string | null>(null);
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  );

  const activeSet = useMemo(() => {
    if (!character) return null;
    return (
      character.sets.find((entry) => entry.id === character.activeSetId) ?? character.sets[0] ?? null
    );
  }, [character]);

  const itemById = useMemo(() => {
    const map = new Map<string, EquipmentItem>();
    for (const item of workspace?.items ?? []) {
      if (!item.archived) map.set(item.id, item);
    }
    return map;
  }, [workspace]);

  const equipLocations = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findEquipLocation>>();
    if (!workspace) return map;
    for (const item of workspace.items) {
      if (!item.archived) map.set(item.id, findEquipLocation(workspace, item.id));
    }
    return map;
  }, [workspace]);

  const bagItems = useMemo(() => {
    if (!workspace) return [];
    return workspace.items.filter((item) => {
      if (item.archived) return false;
      if (equipLocations.get(item.id)) return false;
      return normalizeBagLocation(item) === bagLocation;
    });
  }, [bagLocation, equipLocations, workspace]);

  const equippedItems = useMemo(() => {
    if (!activeSet) return [];
    return equipmentSlots
      .map((slot) => {
        const id = activeSet.assignments[slot];
        return id ? itemById.get(id) ?? null : null;
      })
      .filter((item): item is EquipmentItem => item !== null);
  }, [activeSet, itemById]);

  const bagCounts = useMemo(() => {
    const counts: Record<BagLocation, number> = { 'Torba I': 0, 'Torba II': 0, Magazyn: 0 };
    if (!workspace) return counts;
    for (const item of workspace.items) {
      if (item.archived || equipLocations.get(item.id)) continue;
      const location = normalizeBagLocation(item);
      if (location !== 'removed') counts[location] += 1;
    }
    return counts;
  }, [equipLocations, workspace]);

  const selectedItem = selectedItemId ? itemById.get(selectedItemId) ?? null : null;
  const selectedEquipLocation =
    selectedItemId && workspace ? equipLocations.get(selectedItemId) ?? null : null;
  const selectedBonusGroups = selectedItem
    ? splitDisplayedBonuses(selectedItem.bonuses)
    : { regular: [] as readonly string[], sockets: [] as readonly string[] };

  const catalogSuggestions = useMemo(() => {
    if (!character) return [];
    const query = stripEnhancementFromName(draft.name).trim();
    if (query.length < 2) return [];
    return searchGameItems(query)
      .filter((item) => {
        const slot = equipmentSlotForCategory(item.category);
        return Boolean(slot) && isItemCompatibleWithClass(item.category, character.characterClass);
      })
      .slice(0, 8);
  }, [character, draft.name]);

  if (requestedMode === 'timers' || !hydrated || state.authStatus !== 'authenticated') {
    return <LegacyCharacterEquipment />;
  }
  if (!workspace || !character) return <LegacyCharacterEquipment />;

  const viewerName = state.viewer?.displayName ?? state.viewer?.discordDisplayName ?? 'Gracz';

  const chooseCatalog = (item: GameItem) => {
    const slot = equipmentSlotForCategory(item.category);
    if (!slot) return;
    setSelectedCatalogId(item.id);
    setCategoryReviewRequired(false);
    setDraft((current) => ({
      ...current,
      name: item.title,
      category: slot,
      notes: current.notes,
    }));
    setEditorError(null);
  };

  const openManual = () => {
    setEditorMode('manual');
    setSelectedCatalogId(null);
    setCategoryReviewRequired(false);
    setEditorError(null);
    setScreenshotFile(null);
    setScreenshotAnalysisId(null);
    setScreenshotStatus('idle');
    setDraft({
      name: '',
      enhancement: 0,
      category: 'weapon',
      bonusesText: '',
      confidence: null,
      notes: '',
    });
  };

  const openScreenshot = () => {
    openManual();
    setEditorMode('screenshot');
  };

  const openEdit = (item: EquipmentItem) => {
    setSelectedItemId(item.id);
    setEditorMode('edit');
    setSelectedCatalogId(null);
    setCategoryReviewRequired(false);
    setEditorError(null);
    setScreenshotFile(null);
    setScreenshotAnalysisId(null);
    setScreenshotStatus('idle');
    setDraft({
      name: stripEnhancementFromName(item.name),
      enhancement: item.enhancement,
      category: item.category,
      bonusesText: item.bonuses.join('\n'),
      confidence: null,
      notes: '',
    });
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditorError(null);
    setCategoryReviewRequired(false);
    setScreenshotStatus('idle');
    setScreenshotFile(null);
    setScreenshotAnalysisId(null);
  };

  const analyzeScreenshot = async () => {
    if (!screenshotFile) {
      setEditorError('Wybierz screen pojedynczego tooltipa przedmiotu.');
      return;
    }
    setScreenshotStatus('loading');
    setEditorError(null);
    const body = new FormData();
    body.append('image', screenshotFile);
    body.append('workspaceId', workspace.id);
    body.append('characterId', character.id);

    try {
      const response = await fetch('/api/equipment/analyze-item', { method: 'POST', body });
      const payload = (await response.json()) as ScreenshotAnalysisPayload;
      if (!response.ok || !payload.draft?.name) {
        throw new Error(payload.error || 'Nie udało się odczytać przedmiotu ze screena.');
      }
      const analysisDraft = payload.draft;
      const analyzedName = analysisDraft.name;
      if (!analyzedName) {
        throw new Error('Nie udało się odczytać nazwy przedmiotu ze screena.');
      }

      const parsedEnhancement = clampEnhancement(
        analysisDraft.enhancement ?? parseEnhancementFromName(analyzedName),
      );
      const baseName = stripEnhancementFromName(analyzedName);
      const matches = searchGameItems(baseName)
        .filter((item) => {
          const slot = equipmentSlotForCategory(item.category);
          return Boolean(slot) && isItemCompatibleWithClass(item.category, character.characterClass);
        })
        .slice(0, 8);
      const normalizedBaseName = baseName.trim().toLocaleLowerCase('pl');
      const exactMatches = matches.filter(
        (item) => item.title.trim().toLocaleLowerCase('pl') === normalizedBaseName,
      );
      const sameSlotMatches = analysisDraft.category
        ? matches.filter((item) => equipmentSlotForCategory(item.category) === analysisDraft.category)
        : matches;
      const best =
        exactMatches.length === 1
          ? exactMatches[0]!
          : sameSlotMatches.length === 1
            ? sameSlotMatches[0]!
            : null;
      const bestSlot = best ? equipmentSlotForCategory(best.category) : null;
      const analyzedSlot = bestSlot ?? analysisDraft.category ?? null;

      setScreenshotAnalysisId(
        typeof payload.analysisId === 'string' && payload.analysisId.trim()
          ? payload.analysisId.trim()
          : null,
      );
      setSelectedCatalogId(best?.id ?? null);
      setCategoryReviewRequired(analyzedSlot === null);
      setDraft((current) => ({
        name: best?.title ?? baseName,
        enhancement: parsedEnhancement,
        category: analyzedSlot ?? current.category,
        bonusesText: (analysisDraft.bonuses ?? []).join('\n'),
        confidence:
          typeof analysisDraft.confidence === 'number'
            ? Math.min(1, Math.max(0, analysisDraft.confidence))
            : null,
        notes: analysisDraft.notes?.trim() ?? '',
      }));
      setScreenshotStatus('done');
    } catch (error) {
      setScreenshotStatus('error');
      setEditorError(error instanceof Error ? error.message : 'Analiza screena nie powiodła się.');
    }
  };

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!writesEnabled) {
      setEditorError('Zapis jest wyłączony dla tej sesji.');
      return;
    }
    if (draft.name.trim().length < 2) {
      setEditorError('Podaj nazwę przedmiotu.');
      return;
    }
    if (editorMode === 'screenshot' && categoryReviewRequired) {
      setEditorError('Potwierdź typ / slot przedmiotu. Analiza nie rozpoznała go wystarczająco pewnie.');
      return;
    }

    const bonuses = cleanBonusLines(draft.bonusesText);
    if (editorMode === 'edit' && selectedItem) {
      const categoryChanged = draft.category !== selectedItem.category;
      const updated = updateItem(workspace.id, selectedItem.id, {
        name: draft.name.trim(),
        category: draft.category,
        enhancement: clampEnhancement(draft.enhancement),
        bonuses,
        forCharacterClass: character.characterClass,
      });
      if (!updated) {
        setEditorError('Nie udało się zapisać zmian. Sprawdź nazwę, typ i zgodność przedmiotu z klasą.');
        return;
      }
      if (categoryChanged) {
        setBagLocation('Torba I');
        setInventoryMode('bag');
      }
      closeEditor();
      return;
    }

    if (bagCounts[bagLocation] >= BAG_CAPACITY[bagLocation]) {
      setEditorError(`${bagLocation} jest pełna (${BAG_CAPACITY[bagLocation]}/${BAG_CAPACITY[bagLocation]}). Wybierz inną torbę lub magazyn.`);
      return;
    }

    const createdId = createItem(workspace.id, {
      name: draft.name.trim(),
      category: draft.category,
      enhancement: clampEnhancement(draft.enhancement),
      bonuses,
      planned: false,
      forCharacterClass: character.characterClass,
    });
    if (!createdId) {
      setEditorError(
        selectedCatalogId
          ? 'Nie udało się utworzyć karty. Sprawdź zgodność przedmiotu z klasą postaci.'
          : 'Nie udało się utworzyć karty. Sprawdź nazwę i kategorię.',
      );
      return;
    }

    confirmLocation(workspace.id, createdId, bagLocation);
    if (editorMode === 'screenshot' && screenshotAnalysisId) {
      void resolveAiObservationFeedback(screenshotAnalysisId, {
        name: draft.name.trim(),
        enhancement: clampEnhancement(draft.enhancement),
        category: draft.category,
        bonuses,
      });
    }
    setSelectedItemId(createdId);
    setInventoryMode('bag');
    closeEditor();
  };

  const equipItem = (item: EquipmentItem) => {
    if (!writesEnabled || !activeSet) return;
    assignItem(workspace.id, character.id, activeSet.id, item.id, item.category);
    confirmLocation(workspace.id, item.id, character.name);
    setSelectedItemId(item.id);
    setInventoryMode('equipped');
  };

  const moveItem = (item: EquipmentItem, location: BagLocation) => {
    if (!writesEnabled) return;
    const currentLocation = equipLocations.get(item.id) ? null : normalizeBagLocation(item);
    if (currentLocation !== location && bagCounts[location] >= BAG_CAPACITY[location]) {
      window.alert(`${location} jest pełna. Zwolnij slot albo wybierz inną lokalizację.`);
      return;
    }
    if (equipLocations.get(item.id)) unequipItem(workspace.id, item.id);
    confirmLocation(workspace.id, item.id, location);
    setBagLocation(location);
    setInventoryMode('bag');
    setSelectedItemId(item.id);
  };

  const removeItem = (item: EquipmentItem) => {
    if (!writesEnabled) return;
    if (!window.confirm(`Usunąć „${item.name}” z ekwipunku zespołu?`)) return;
    archiveItem(workspace.id, item.id);
    setSelectedItemId(null);
  };

  return (
    <AppShell activeSection="characters" viewerName={viewerName}>
      <main className={styles.page} id="main-content">
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Ekwipunek postaci</span>
            <div className={styles.titleRow}>
              <div>
                <h1>{character.name}</h1>
                <p>
                  {formatCharacterClassLine(character.characterClass, character.skillPath)}
                  {character.level ? ` · Lv ${character.level}` : ''}
                  {activeSet ? ` · Set: ${activeSet.name}` : ''}
                </p>
              </div>
              {character.imagePath ? (
                <img className={styles.heroPortrait} alt="" src={character.imagePath} />
              ) : null}
            </div>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.secondaryButton} onClick={openManual} type="button">
              <Icon name="plus" size={16} /> Dodaj ręcznie
            </button>
            <button className={styles.primaryButton} onClick={openScreenshot} type="button">
              <Icon name="equipment" size={16} /> Dodaj ze screena
            </button>
          </div>
        </header>

        <section className={styles.workspace}>
          <div className={styles.mainColumn}>
            <nav className={styles.modeTabs} aria-label="Widok ekwipunku">
              <button
                className={inventoryMode === 'equipped' ? styles.modeTabActive : styles.modeTab}
                onClick={() => setInventoryMode('equipped')}
                type="button"
              >
                Założone <span>{equippedItems.length}/8</span>
              </button>
              <button
                className={inventoryMode === 'bag' ? styles.modeTabActive : styles.modeTab}
                onClick={() => setInventoryMode('bag')}
                type="button"
              >
                Torba <span>{bagCounts['Torba I'] + bagCounts['Torba II'] + bagCounts.Magazyn}</span>
              </button>
            </nav>

            {inventoryMode === 'equipped' ? (
              <section className={styles.equippedPanel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.sectionKicker}>Aktywny zestaw</span>
                    <h2>{activeSet?.name ?? 'Brak zestawu'}</h2>
                  </div>
                  {character.sets.length > 0 ? (
                    <label className={styles.setSelect}>
                      <span>Set</span>
                      <select
                        disabled={!writesEnabled}
                        onChange={(event) => setActiveSet(workspace.id, character.id, event.target.value)}
                        value={activeSet?.id ?? ''}
                      >
                        {character.sets.map((set) => (
                          <option key={set.id} value={set.id}>
                            {set.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                <div className={styles.equipmentStage}>
                  <div className={styles.characterSilhouette} aria-hidden>
                    {character.imagePath ? <img alt="" src={character.imagePath} /> : <Icon name="character" size={92} />}
                  </div>
                  {equipmentSlots.map((slot) => {
                    const itemId = activeSet?.assignments[slot] ?? null;
                    const item = itemId ? itemById.get(itemId) ?? null : null;
                    return (
                      <button
                        aria-label={`${slotLabels[slot]}${item ? `: ${item.name}` : ': pusty slot'}`}
                        className={`${styles.equipmentSlot} ${slotClassNames[slot]}${
                          selectedItemId === item?.id ? ` ${styles.equipmentSlotSelected}` : ''
                        }`}
                        key={slot}
                        onClick={() => item && setSelectedItemId(item.id)}
                        type="button"
                      >
                        <span className={styles.slotLabel}>{slotLabels[slot]}</span>
                        <span className={styles.slotIcon}>{item ? itemImage(item) : <Icon name="plus" size={18} />}</span>
                        <strong>{item?.name ?? 'Pusty'}</strong>
                      </button>
                    );
                  })}
                </div>

                <div className={styles.equippedHint}>
                  Przedmiot z torby założysz jednym kliknięciem. Typ przedmiotu wyznacza właściwy slot.
                </div>
              </section>
            ) : (
              <section className={styles.bagPanel}>
                <div className={styles.bagTabs} role="tablist" aria-label="Torby i magazyn">
                  {BAG_LOCATIONS.map((location) => (
                    <button
                      aria-selected={bagLocation === location}
                      className={bagLocation === location ? styles.bagTabActive : styles.bagTab}
                      key={location}
                      onClick={() => setBagLocation(location)}
                      role="tab"
                      type="button"
                    >
                      {location}
                      <span>{bagCounts[location]}/{BAG_CAPACITY[location]}</span>
                    </button>
                  ))}
                </div>

                <div className={styles.bagToolbar}>
                  <div>
                    <strong>{bagLocation}</strong>
                    <span>{bagItems.length} zapisanych przedmiotów</span>
                  </div>
                  <button className={styles.compactButton} onClick={openManual} type="button">
                    <Icon name="plus" size={15} /> Dodaj
                  </button>
                </div>

                <div className={styles.inventoryGrid}>
                  {bagItems.map((item) => (
                    <ItemTile
                      item={item}
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      selected={selectedItemId === item.id}
                    />
                  ))}
                  {Array.from({ length: Math.max(0, BAG_CAPACITY[bagLocation] - bagItems.length) }).map(
                    (_, index) => (
                      <button
                        aria-label={`Pusty slot ${index + bagItems.length + 1}`}
                        className={styles.emptySlot}
                        key={`empty-${bagLocation}-${index}`}
                        onClick={openManual}
                        type="button"
                      >
                        <span />
                      </button>
                    ),
                  )}
                </div>
              </section>
            )}
          </div>

          <aside className={styles.detailsPanel}>
            {selectedItem ? (
              <>
                <div className={styles.detailsHead}>
                  <div className={styles.detailsIcon}>{itemImage(selectedItem)}</div>
                  <div>
                    <span>{slotLabels[selectedItem.category]}</span>
                    <h2>{selectedItem.name}</h2>
                    <small>
                      {selectedEquipLocation
                        ? `${selectedEquipLocation.characterName} · ${selectedEquipLocation.setName}`
                        : normalizeBagLocation(selectedItem) === 'removed'
                          ? 'Usunięte'
                          : normalizeBagLocation(selectedItem)}
                    </small>
                  </div>
                </div>

                <div className={styles.bonusBlock}>
                  <span>Bonusy</span>
                  {selectedBonusGroups.regular.length > 0 ? (
                    <ul>
                      {selectedBonusGroups.regular.map((bonus, index) => (
                        <li key={`${bonus}-${index}`}>{bonus}</li>
                      ))}
                    </ul>
                  ) : selectedBonusGroups.sockets.length === 0 ? (
                    <p>Brak zapisanych dodatkowych linii.</p>
                  ) : null}

                  {selectedBonusGroups.sockets.length > 0 ? (
                    <div className={styles.socketBonusGroup}>
                      <span>Kamienie / przetopy</span>
                      <ul>
                        {selectedBonusGroups.sockets.map((bonus, index) => (
                          <li key={`${bonus}-socket-${index}`}>{bonus}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className={styles.detailsActions}>
                  {!selectedEquipLocation && activeSet ? (
                    <button
                      className={styles.primaryButton}
                      disabled={!writesEnabled}
                      onClick={() => equipItem(selectedItem)}
                      type="button"
                    >
                      Załóż na {character.name}
                    </button>
                  ) : null}
                  {selectedEquipLocation ? (
                    <button
                      className={styles.secondaryButton}
                      disabled={!writesEnabled}
                      onClick={() => moveItem(selectedItem, bagLocation)}
                      type="button"
                    >
                      Zdejmij do {bagLocation}
                    </button>
                  ) : null}
                  <button
                    className={styles.secondaryButton}
                    disabled={!writesEnabled}
                    onClick={() => openEdit(selectedItem)}
                    type="button"
                  >
                    Edytuj przedmiot
                  </button>
                </div>

                <div className={styles.moveBlock}>
                  <span>Przenieś</span>
                  <div>
                    {BAG_LOCATIONS.map((location) => (
                      <button
                        disabled={!writesEnabled}
                        key={location}
                        onClick={() => moveItem(selectedItem, location)}
                        type="button"
                      >
                        {location}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className={styles.removeButton}
                  disabled={!writesEnabled}
                  onClick={() => removeItem(selectedItem)}
                  type="button"
                >
                  Usuń przedmiot
                </button>
              </>
            ) : (
              <div className={styles.detailsEmpty}>
                <Icon name="equipment" size={34} />
                <h2>Wybierz przedmiot</h2>
                <p>Kliknij kartę w torbie albo przedmiot założony na postaci, aby nim zarządzać.</p>
              </div>
            )}
          </aside>
        </section>

        {editorMode ? (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={closeEditor}>
            <section
              aria-modal="true"
              className={styles.modal}
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
            >
              <header className={styles.modalHeader}>
                <div>
                  <span className={styles.sectionKicker}>
                    {editorMode === 'screenshot'
                      ? 'Import pojedynczego itemu'
                      : editorMode === 'edit'
                        ? 'Edycja karty'
                        : 'Nowy przedmiot'}
                  </span>
                  <h2>
                    {editorMode === 'screenshot'
                      ? 'Dodaj ze screena'
                      : editorMode === 'edit'
                        ? selectedItem?.name
                        : 'Dodaj ręcznie'}
                  </h2>
                </div>
                <button aria-label="Zamknij" onClick={closeEditor} type="button">
                  <Icon name="x" size={18} />
                </button>
              </header>

              {editorMode === 'screenshot' ? (
                <div className={styles.screenshotBox}>
                  <label>
                    <span>Screen tooltipa</span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        setScreenshotFile(event.target.files?.[0] ?? null);
                        setScreenshotStatus('idle');
                        setCategoryReviewRequired(false);
                        setEditorError(null);
                      }}
                      type="file"
                    />
                  </label>
                  <p>
                    Wgrywaj wycięty, pojedynczy tooltip. Analiza tworzy tylko wersję roboczą — nic nie
                    zapisuje bez Twojego potwierdzenia.
                  </p>
                  <button
                    className={styles.analyzeButton}
                    disabled={!screenshotFile || screenshotStatus === 'loading'}
                    onClick={() => void analyzeScreenshot()}
                    type="button"
                  >
                    {screenshotStatus === 'loading' ? 'Analizuję…' : 'Analizuj screen'}
                  </button>
                  {draft.confidence !== null && screenshotStatus === 'done' ? (
                    <div className={styles.analysisMeta}>
                      <strong>Pewność odczytu: {Math.round(draft.confidence * 100)}%</strong>
                      {draft.notes ? <span>{draft.notes}</span> : <span>Brak zgłoszonej niepewności.</span>}
                      {categoryReviewRequired ? (
                        <span>Typ przedmiotu wymaga ręcznego potwierdzenia przed zapisem.</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <form className={styles.editorForm} onSubmit={submitEditor}>
                <label className={styles.field}>
                  <span>Nazwa przedmiotu</span>
                  <input
                    onChange={(event) => {
                      setSelectedCatalogId(null);
                      setDraft((current) => ({ ...current, name: event.target.value }));
                    }}
                    placeholder="np. Zatruty Miecz"
                    value={draft.name}
                  />
                </label>

                {catalogSuggestions.length > 0 ? (
                  <div className={styles.catalogSuggestions}>
                    <span>Dopasowanie do bazy V2</span>
                    <div>
                      {catalogSuggestions.map((item) => (
                        <CatalogSuggestion item={item} key={item.id} onChoose={chooseCatalog} />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className={styles.formRow}>
                  <label className={styles.field}>
                    <span>Ulepszenie</span>
                    <select
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          enhancement: Number(event.target.value),
                        }))
                      }
                      value={draft.enhancement}
                    >
                      {Array.from({ length: 10 }).map((_, value) => (
                        <option key={value} value={value}>
                          +{value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Typ / slot{categoryReviewRequired ? ' — potwierdź' : ''}</span>
                    <select
                      onChange={(event) => {
                        setCategoryReviewRequired(false);
                        setDraft((current) => ({
                          ...current,
                          category: event.target.value as EquipmentSlot,
                        }));
                      }}
                      value={draft.category}
                    >
                      {equipmentSlots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slotLabels[slot]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Bonusy — jedna linia = jeden bonus</span>
                  <textarea
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, bonusesText: event.target.value }))
                    }
                    placeholder={'Max PŻ +2000\nSilny przeciwko ludziom +10%'}
                    rows={7}
                    value={draft.bonusesText}
                  />
                </label>

                {editorMode !== 'edit' ? (
                  <div className={styles.destinationLine}>
                    Zapis trafi do: <strong>{bagLocation}</strong>
                    <span> · {bagCounts[bagLocation]}/{BAG_CAPACITY[bagLocation]} zajęte</span>
                    {selectedCatalogId ? <span> · przedmiot dopasowany do katalogu V2</span> : null}
                  </div>
                ) : null}

                {editorError ? <p className={styles.formError}>{editorError}</p> : null}

                <footer className={styles.modalFooter}>
                  <button className={styles.secondaryButton} onClick={closeEditor} type="button">
                    Anuluj
                  </button>
                  <button className={styles.primaryButton} disabled={!writesEnabled} type="submit">
                    {editorMode === 'edit' ? 'Zapisz zmiany' : 'Potwierdź i dodaj'}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
