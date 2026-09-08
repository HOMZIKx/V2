'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { formatCharacterClassLine } from '../../../../../src/character-profile';
import {
  equipmentSlotForCategory,
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
import styles from './team-equipment-v2.module.css';

type BagFilter = 'Wszystkie' | 'Torba I' | 'Torba II' | 'Magazyn';
type BagLocation = Exclude<BagFilter, 'Wszystkie'>;
type EditorMode = 'manual' | 'screenshot' | 'edit' | null;

const BAG_FILTERS: readonly BagFilter[] = ['Wszystkie', 'Torba I', 'Torba II', 'Magazyn'];
const BAG_LOCATIONS: readonly BagLocation[] = ['Torba I', 'Torba II', 'Magazyn'];

interface ItemDraft {
  readonly name: string;
  readonly enhancement: number;
  readonly category: EquipmentSlot;
  readonly bonusesText: string;
  readonly confidence: number | null;
  readonly notes: string;
}

interface ScreenshotAnalysisPayload {
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

function clampEnhancement(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(9, Math.max(0, Math.trunc(value)));
}

function cleanBonusLines(value: string): readonly string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
}

function normalizeBagLocation(item: EquipmentItem): BagLocation {
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

function itemArtwork(item: EquipmentItem) {
  return item.iconPath ? (
    <img alt="" src={item.iconPath} />
  ) : (
    <span className={styles.itemFallback} aria-hidden>
      <Icon name="equipment" size={22} />
    </span>
  );
}

function catalogArtwork(item: GameItem) {
  const source = item.sourceImageUrl ?? item.imagePath ?? null;
  return source ? <img alt="" src={source} /> : <Icon name="equipment" size={18} />;
}

export function TeamEquipmentV2() {
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
  const [bagFilter, setBagFilter] = useState<BagFilter>('Wszystkie');
  const [query, setQuery] = useState('');
  const [showAssigned, setShowAssigned] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
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
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const livingCharacters = useMemo(
    () => workspace?.characters.filter((character) => !character.archived) ?? [],
    [workspace],
  );

  const itemById = useMemo(() => {
    const result = new Map<string, EquipmentItem>();
    for (const item of workspace?.items ?? []) {
      if (!item.archived) result.set(item.id, item);
    }
    return result;
  }, [workspace]);

  const equipLocations = useMemo(() => {
    const result = new Map<string, ReturnType<typeof findEquipLocation>>();
    if (!workspace) return result;
    for (const item of workspace.items) {
      if (!item.archived) result.set(item.id, findEquipLocation(workspace, item.id));
    }
    return result;
  }, [workspace]);

  const selectedItem = selectedItemId ? itemById.get(selectedItemId) ?? null : null;
  const selectedLocation = selectedItemId ? equipLocations.get(selectedItemId) ?? null : null;

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pl');
    return (workspace?.items ?? [])
      .filter((item) => !item.archived)
      .filter((item) => showAssigned || !equipLocations.get(item.id))
      .filter((item) => {
        if (bagFilter === 'Wszystkie') return true;
        if (equipLocations.get(item.id)) return false;
        return normalizeBagLocation(item) === bagFilter;
      })
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.name} ${item.bonuses.join(' ')}`.toLocaleLowerCase('pl').includes(normalizedQuery);
      });
  }, [bagFilter, equipLocations, query, showAssigned, workspace]);

  const bagCounts = useMemo(() => {
    const result: Record<BagLocation, number> = { 'Torba I': 0, 'Torba II': 0, Magazyn: 0 };
    for (const item of workspace?.items ?? []) {
      if (item.archived || equipLocations.get(item.id)) continue;
      result[normalizeBagLocation(item)] += 1;
    }
    return result;
  }, [equipLocations, workspace]);

  const catalogSuggestions = useMemo(() => {
    const value = stripEnhancementFromName(draft.name).trim();
    if (value.length < 2) return [];
    return searchGameItems(value)
      .filter((item) => equipmentSlotForCategory(item.category) !== null)
      .slice(0, 8);
  }, [draft.name]);

  if (requestedMode === 'timers') return <LegacyCharacterEquipment />;
  if (!hydrated || state.authStatus !== 'authenticated') return <LegacyCharacterEquipment />;
  if (!workspace) return <LegacyCharacterEquipment />;

  const viewerName = state.viewer?.displayName ?? state.viewer?.discordDisplayName ?? 'Gracz';
  const leftCharacters = livingCharacters.filter((_, index) => index % 2 === 0);
  const rightCharacters = livingCharacters.filter((_, index) => index % 2 === 1);

  const activeSetFor = (character: (typeof livingCharacters)[number]) =>
    character.sets.find((set) => set.id === character.activeSetId) ?? character.sets[0] ?? null;

  const chooseCatalog = (item: GameItem) => {
    const slot = equipmentSlotForCategory(item.category);
    if (!slot) return;
    setSelectedCatalogId(item.id);
    setCategoryReviewRequired(false);
    setDraft((current) => ({ ...current, name: item.title, category: slot }));
    setEditorError(null);
  };

  const resetDraft = () => {
    setSelectedCatalogId(null);
    setCategoryReviewRequired(false);
    setEditorError(null);
    setScreenshotFile(null);
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

  const openManual = () => {
    resetDraft();
    setEditorMode('manual');
  };

  const openScreenshot = () => {
    resetDraft();
    setEditorMode('screenshot');
  };

  const openEdit = (item: EquipmentItem) => {
    setSelectedItemId(item.id);
    setSelectedCatalogId(null);
    setCategoryReviewRequired(false);
    setEditorError(null);
    setScreenshotFile(null);
    setScreenshotStatus('idle');
    setDraft({
      name: stripEnhancementFromName(item.name),
      enhancement: item.enhancement,
      category: item.category,
      bonusesText: item.bonuses.join('\n'),
      confidence: null,
      notes: '',
    });
    setEditorMode('edit');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditorError(null);
    setScreenshotFile(null);
    setScreenshotStatus('idle');
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

    try {
      const response = await fetch('/api/equipment/analyze-item', { method: 'POST', body });
      const payload = (await response.json()) as ScreenshotAnalysisPayload;
      if (!response.ok || !payload.draft?.name) {
        throw new Error(payload.error || 'Nie udało się odczytać przedmiotu ze screena.');
      }
      const baseName = stripEnhancementFromName(payload.draft.name);
      const matches = searchGameItems(baseName)
        .filter((item) => equipmentSlotForCategory(item.category) !== null)
        .slice(0, 8);
      const best =
        matches.find(
          (item) => item.title.trim().toLocaleLowerCase('pl') === baseName.trim().toLocaleLowerCase('pl'),
        ) ?? matches[0] ?? null;
      const catalogSlot = best ? equipmentSlotForCategory(best.category) : null;
      const resolvedSlot = catalogSlot ?? payload.draft.category ?? null;

      setSelectedCatalogId(best?.id ?? null);
      setCategoryReviewRequired(resolvedSlot === null);
      setDraft((current) => ({
        name: best?.title ?? baseName,
        enhancement: clampEnhancement(
          payload.draft?.enhancement ?? parseEnhancementFromName(payload.draft?.name ?? ''),
        ),
        category: resolvedSlot ?? current.category,
        bonusesText: (payload.draft?.bonuses ?? []).join('\n'),
        confidence:
          typeof payload.draft?.confidence === 'number'
            ? Math.min(1, Math.max(0, payload.draft.confidence))
            : null,
        notes: payload.draft?.notes?.trim() ?? '',
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
      setEditorError('Potwierdź typ / slot przedmiotu przed zapisem.');
      return;
    }

    const bonuses = cleanBonusLines(draft.bonusesText);
    if (editorMode === 'edit' && selectedItem) {
      const updated = updateItem(workspace.id, selectedItem.id, {
        name: draft.name.trim(),
        category: draft.category,
        enhancement: clampEnhancement(draft.enhancement),
        bonuses,
      });
      if (!updated) {
        setEditorError('Nie udało się zapisać zmian przedmiotu.');
        return;
      }
      closeEditor();
      return;
    }

    const createdId = createItem(workspace.id, {
      name: draft.name.trim(),
      category: draft.category,
      enhancement: clampEnhancement(draft.enhancement),
      bonuses,
      planned: false,
    });
    if (!createdId) {
      setEditorError(
        selectedCatalogId
          ? 'Nie udało się utworzyć karty z katalogu.'
          : 'Nie udało się utworzyć karty. Sprawdź nazwę i typ.',
      );
      return;
    }
    confirmLocation(workspace.id, createdId, 'Torba I');
    setSelectedItemId(createdId);
    setBagFilter('Wszystkie');
    closeEditor();
  };

  const moveToBag = (item: EquipmentItem, location: BagLocation) => {
    if (!writesEnabled) return;
    if (equipLocations.get(item.id)) unequipItem(workspace.id, item.id);
    confirmLocation(workspace.id, item.id, location);
    setBagFilter(location);
    setSelectedItemId(item.id);
  };

  const assignToSlot = (
    character: (typeof livingCharacters)[number],
    slot: EquipmentSlot,
    item: EquipmentItem,
  ) => {
    if (!writesEnabled) return;
    const activeSet = activeSetFor(character);
    if (!activeSet) return;
    if (item.category !== slot) {
      window.alert(`Ten przedmiot pasuje do slotu „${slotLabels[item.category]}”, nie „${slotLabels[slot]}”.`);
      return;
    }
    assignItem(workspace.id, character.id, activeSet.id, item.id, slot);
    confirmLocation(workspace.id, item.id, character.name);
    setSelectedItemId(item.id);
  };

  const assignSelectedToCharacter = (character: (typeof livingCharacters)[number]) => {
    if (!selectedItem) return;
    assignToSlot(character, selectedItem.category, selectedItem);
  };

  const archiveSelected = () => {
    if (!selectedItem || !writesEnabled) return;
    if (!window.confirm(`Usunąć „${selectedItem.name}” z ekwipunku zespołu?`)) return;
    archiveItem(workspace.id, selectedItem.id);
    setSelectedItemId(null);
  };

  const renderCharacterCard = (character: (typeof livingCharacters)[number]) => {
    const activeSet = activeSetFor(character);
    return (
      <article
        className={styles.characterCard}
        key={character.id}
        onDragOver={(event) => {
          if (draggingItemId) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const item = draggingItemId ? itemById.get(draggingItemId) ?? null : null;
          if (item) assignToSlot(character, item.category, item);
          setDraggingItemId(null);
        }}
      >
        <header className={styles.characterHeader}>
          <div className={styles.characterPortrait}>
            {character.imagePath ? (
              <img alt="" src={character.imagePath} />
            ) : (
              <Icon name="character" size={28} />
            )}
          </div>
          <div className={styles.characterIdentity}>
            <strong>{character.name}</strong>
            <span>
              {formatCharacterClassLine(character.characterClass, character.skillPath)}
              {character.level ? ` · Lv ${character.level}` : ''}
            </span>
          </div>
          {character.sets.length > 0 ? (
            <select
              aria-label={`Aktywny set ${character.name}`}
              disabled={!writesEnabled}
              onChange={(event) => setActiveSet(workspace.id, character.id, event.target.value)}
              value={activeSet?.id ?? ''}
            >
              {character.sets.map((set) => (
                <option key={set.id} value={set.id}>{set.name}</option>
              ))}
            </select>
          ) : null}
        </header>

        <div className={styles.slotGrid}>
          {equipmentSlots.map((slot) => {
            const itemId = activeSet?.assignments[slot] ?? null;
            const item = itemId ? itemById.get(itemId) ?? null : null;
            const canAssignSelected = Boolean(selectedItem && selectedItem.category === slot);
            return (
              <button
                className={`${styles.slot}${item ? ` ${styles.slotFilled}` : ''}${
                  canAssignSelected ? ` ${styles.slotReady}` : ''
                }${selectedItemId === item?.id ? ` ${styles.slotSelected}` : ''}`}
                key={slot}
                onClick={() => {
                  if (selectedItem && selectedItem.id !== item?.id) {
                    assignToSlot(character, slot, selectedItem);
                    return;
                  }
                  if (item) setSelectedItemId(item.id);
                }}
                onDragOver={(event) => {
                  const dragging = draggingItemId ? itemById.get(draggingItemId) ?? null : null;
                  if (dragging?.category === slot) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragging = draggingItemId ? itemById.get(draggingItemId) ?? null : null;
                  if (dragging) assignToSlot(character, slot, dragging);
                  setDraggingItemId(null);
                }}
                title={item ? item.name : `${slotLabels[slot]} — pusty slot`}
                type="button"
              >
                <span className={styles.slotArtwork}>{item ? itemArtwork(item) : <Icon name="plus" size={14} />}</span>
                <span className={styles.slotCopy}>
                  <small>{slotLabels[slot]}</small>
                  <strong>{item?.name ?? 'Pusty'}</strong>
                </span>
              </button>
            );
          })}
        </div>

        {selectedItem ? (
          <button
            className={styles.quickAssign}
            disabled={!writesEnabled}
            onClick={() => assignSelectedToCharacter(character)}
            type="button"
          >
            Załóż wybrany na {character.name}
          </button>
        ) : null}
      </article>
    );
  };

  return (
    <AppShell activeSection="characters" viewerName={viewerName}>
      <main className={styles.page} id="main-content">
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Wspólny ekwipunek zespołu</span>
            <h1>EQ</h1>
            <p>
              Jedna wspólna torba, wszystkie postacie i wszystkie sety w jednym miejscu. Kliknij item,
              potem slot postaci — albo przeciągnij go bezpośrednio na kartę.
            </p>
          </div>
          <div className={styles.heroStats}>
            <div><strong>{livingCharacters.length}</strong><span>postaci</span></div>
            <div><strong>{itemById.size}</strong><span>przedmiotów</span></div>
            <div><strong>{Array.from(equipLocations.values()).filter(Boolean).length}</strong><span>założonych</span></div>
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

        <section className={styles.board}>
          <div className={styles.characterColumn}>{leftCharacters.map(renderCharacterCard)}</div>

          <section
            className={styles.inventoryPanel}
            onDragOver={(event) => {
              if (draggingItemId) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const item = draggingItemId ? itemById.get(draggingItemId) ?? null : null;
              if (item) moveToBag(item, 'Torba I');
              setDraggingItemId(null);
            }}
          >
            <header className={styles.inventoryHeader}>
              <div>
                <span className={styles.eyebrow}>Centrum EQ</span>
                <h2>Wspólna torba</h2>
                <p>Pokazuje cały aktywny katalog zespołu, również itemy aktualnie założone.</p>
              </div>
              <button
                aria-pressed={showAssigned}
                className={showAssigned ? styles.filterButtonActive : styles.filterButton}
                onClick={() => setShowAssigned((current) => !current)}
                type="button"
              >
                {showAssigned ? 'Założone: widoczne' : 'Pokaż założone'}
              </button>
            </header>

            <div className={styles.searchRow}>
              <input
                aria-label="Szukaj przedmiotu"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Szukaj po nazwie albo bonusie…"
                value={query}
              />
            </div>

            <div className={styles.bagTabs} role="tablist" aria-label="Filtr wspólnej torby">
              {BAG_FILTERS.map((filter) => (
                <button
                  aria-selected={bagFilter === filter}
                  className={bagFilter === filter ? styles.bagTabActive : styles.bagTab}
                  key={filter}
                  onClick={() => setBagFilter(filter)}
                  role="tab"
                  type="button"
                >
                  {filter}
                  {filter === 'Wszystkie' ? (
                    <span>{itemById.size}</span>
                  ) : (
                    <span>{bagCounts[filter]}</span>
                  )}
                </button>
              ))}
            </div>

            <div className={styles.inventoryGrid}>
              {visibleItems.length === 0 ? (
                <div className={styles.emptyInventory}>
                  <Icon name="equipment" size={30} />
                  <strong>Brak przedmiotów w tym widoku</strong>
                  <span>Zmień filtr albo dodaj nowy item.</span>
                </div>
              ) : null}
              {visibleItems.map((item) => {
                const location = equipLocations.get(item.id) ?? null;
                return (
                  <button
                    aria-pressed={selectedItemId === item.id}
                    className={`${styles.itemTile}${selectedItemId === item.id ? ` ${styles.itemTileSelected}` : ''}`}
                    draggable={writesEnabled}
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    onDragEnd={() => setDraggingItemId(null)}
                    onDragStart={(event) => {
                      setDraggingItemId(item.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', item.id);
                    }}
                    type="button"
                  >
                    <span className={styles.itemArtwork}>{itemArtwork(item)}</span>
                    <span className={styles.itemCopy}>
                      <strong>{item.name}</strong>
                      <small>
                        {location
                          ? `${location.characterName} · ${location.setName}`
                          : normalizeBagLocation(item)}
                      </small>
                    </span>
                    <span className={location ? styles.itemStateEquipped : styles.itemStateBag}>
                      {location ? 'ZAŁOŻONY' : slotLabels[item.category]}
                    </span>
                  </button>
                );
              })}
            </div>

            <aside className={styles.itemInspector}>
              {selectedItem ? (
                <>
                  <div className={styles.inspectorHead}>
                    <span className={styles.inspectorArtwork}>{itemArtwork(selectedItem)}</span>
                    <div>
                      <small>{slotLabels[selectedItem.category]}</small>
                      <h3>{selectedItem.name}</h3>
                      <span>
                        {selectedLocation
                          ? `${selectedLocation.characterName} · ${selectedLocation.setName}`
                          : normalizeBagLocation(selectedItem)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.bonuses}>
                    <strong>Bonusy</strong>
                    {selectedItem.bonuses.length > 0 ? (
                      <ul>{selectedItem.bonuses.map((bonus, index) => <li key={`${bonus}-${index}`}>{bonus}</li>)}</ul>
                    ) : (
                      <p>Brak dodatkowych bonusów.</p>
                    )}
                  </div>
                  <div className={styles.inspectorActions}>
                    <button className={styles.secondaryButton} disabled={!writesEnabled} onClick={() => openEdit(selectedItem)} type="button">
                      Edytuj
                    </button>
                    {BAG_LOCATIONS.map((location) => (
                      <button
                        className={styles.compactButton}
                        disabled={!writesEnabled}
                        key={location}
                        onClick={() => moveToBag(selectedItem, location)}
                        type="button"
                      >
                        {location}
                      </button>
                    ))}
                    <button className={styles.removeButton} disabled={!writesEnabled} onClick={archiveSelected} type="button">
                      Usuń
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.inspectorEmpty}>
                  <Icon name="equipment" size={28} />
                  <strong>Wybierz przedmiot</strong>
                  <span>Potem kliknij slot na dowolnej postaci albo przeciągnij item.</span>
                </div>
              )}
            </aside>
          </section>

          <div className={styles.characterColumn}>{rightCharacters.map(renderCharacterCard)}</div>
        </section>

        {editorMode ? (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={closeEditor}>
            <section className={styles.modal} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
              <header className={styles.modalHeader}>
                <div>
                  <span className={styles.eyebrow}>
                    {editorMode === 'screenshot' ? 'Import AI' : editorMode === 'edit' ? 'Edycja' : 'Nowy przedmiot'}
                  </span>
                  <h2>{editorMode === 'screenshot' ? 'Dodaj ze screena' : editorMode === 'edit' ? selectedItem?.name : 'Dodaj ręcznie'}</h2>
                </div>
                <button aria-label="Zamknij" onClick={closeEditor} type="button"><Icon name="x" size={18} /></button>
              </header>

              {editorMode === 'screenshot' ? (
                <div className={styles.screenshotBox}>
                  <label>
                    <span>Screen pojedynczego tooltipa</span>
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
                  <button
                    className={styles.primaryButton}
                    disabled={!screenshotFile || screenshotStatus === 'loading'}
                    onClick={() => void analyzeScreenshot()}
                    type="button"
                  >
                    {screenshotStatus === 'loading' ? 'Analizuję…' : 'Analizuj screen'}
                  </button>
                  {screenshotStatus === 'done' ? (
                    <p>
                      Szkic gotowy{draft.confidence !== null ? ` · pewność ${Math.round(draft.confidence * 100)}%` : ''}.
                      Sprawdź pola przed zapisem.
                    </p>
                  ) : null}
                  {draft.notes ? <p>{draft.notes}</p> : null}
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
                        <button key={item.id} onClick={() => chooseCatalog(item)} type="button">
                          <span>{catalogArtwork(item)}</span>
                          <strong>{item.title}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className={styles.editorGrid}>
                  <label className={styles.field}>
                    <span>+N</span>
                    <input
                      max={9}
                      min={0}
                      onChange={(event) => setDraft((current) => ({ ...current, enhancement: clampEnhancement(Number(event.target.value)) }))}
                      type="number"
                      value={draft.enhancement}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Typ / slot{categoryReviewRequired ? ' — potwierdź' : ''}</span>
                    <select
                      onChange={(event) => {
                        setCategoryReviewRequired(false);
                        setDraft((current) => ({ ...current, category: event.target.value as EquipmentSlot }));
                      }}
                      value={draft.category}
                    >
                      {equipmentSlots.map((slot) => <option key={slot} value={slot}>{slotLabels[slot]}</option>)}
                    </select>
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Bonusy — jedna linia = jeden bonus</span>
                  <textarea
                    onChange={(event) => setDraft((current) => ({ ...current, bonusesText: event.target.value }))}
                    placeholder="np. Silny przeciwko Nieumarłym +20%"
                    value={draft.bonusesText}
                  />
                </label>

                {editorError ? <p className={styles.error} role="alert">{editorError}</p> : null}

                <footer className={styles.modalActions}>
                  <button className={styles.secondaryButton} onClick={closeEditor} type="button">Anuluj</button>
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
