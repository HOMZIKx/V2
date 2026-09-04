'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';

import { characterClassLabels, formatCharacterClassLine } from '../../../../../src/character-profile';
import {
  ENHANCEMENT_LEVELS,
  catalogBonusEntriesForItem,
  equipmentSlotForCategory,
  findGameItemByCardName,
  formatEnhancedItemName,
  isItemCompatibleWithClass,
  normalizeItemSearchText,
  parseEnhancementFromName,
  resolveItemBonuses,
  searchEquipmentCatalogSuggestions,
  stripEnhancementFromName,
} from '../../../../../src/item-catalog';
import {
  equipmentSlots,
  getSlotReadiness,
  slotLabels,
  type CharacterRecord,
  type EquipmentItem,
  type EquipmentSlot,
  type ProgressTimer,
  type SetReadiness,
  type WorkspaceRecord,
} from '../../../../../src/player-store';
import { usePlayerStore } from '../../../../../src/player-store-react';
import {
  inferProgressionKind,
  isMidnightProgressionKind,
  progressionDisplayOrder,
  progressionKindsForLevel,
  progressionTimerIcons,
  progressionTimerLabels,
  timerProgressPercent,
  type ProgressionKind,
} from '../../../../../src/project-hard-progression';
import { AppShell, Icon } from '../../../../app-shell';
import { DiscordEntryScreen } from '../../../../discord-entry';

type BoardMode = 'eq' | 'timers';

const readinessLabels: Record<SetReadiness, string> = {
  ready: 'Na postaci',
  available_elsewhere: 'Poza postacią',
  missing: 'Brak karty',
  stale: 'Nieaktualne',
  conflict: 'Konflikt',
  planned: 'Plan',
  empty: 'Pusty',
};

function timerKind(timer: ProgressTimer): ProgressionKind | null {
  return timer.kind ?? inferProgressionKind(timer.label);
}

function timerIconPath(timer: ProgressTimer): string | null {
  const kind = timerKind(timer);
  if (timer.iconPath) return timer.iconPath;
  return kind ? progressionTimerIcons[kind] : null;
}

function sortProgressionTimers(timers: readonly ProgressTimer[]): ProgressTimer[] {
  return [...timers].sort((left, right) => {
    const leftKind = timerKind(left);
    const rightKind = timerKind(right);
    const leftRank = leftKind ? progressionDisplayOrder.indexOf(leftKind) : 99;
    const rightRank = rightKind ? progressionDisplayOrder.indexOf(rightKind) : 99;
    return leftRank - rightRank || left.label.localeCompare(right.label, 'pl');
  });
}

function completionHint(timer: ProgressTimer): string {
  const kind = timerKind(timer);
  if (kind === 'horse') return 'Kolejny cykl: 23 h u Stajennego.';
  if (isMidnightProgressionKind(kind)) {
    return 'Kolejny cykl od północy (Projekt Hard — wspólny reset czytań).';
  }
  return 'Kolejny cykl odlicza się od teraz.';
}

function assignedItemIds(workspace: WorkspaceRecord): Map<string, string> {
  const map = new Map<string, string>();
  for (const character of workspace.characters) {
    if (character.archived) continue;
    for (const set of character.sets) {
      for (const slot of equipmentSlots) {
        const itemId = set.assignments[slot];
        if (itemId) map.set(itemId, character.name);
      }
    }
  }
  return map;
}

function ItemIcon({
  item,
  className,
}: {
  readonly item: EquipmentItem;
  readonly className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={`eq-item-fallback${className ? ` ${className}` : ''}`} aria-hidden>
        <Icon name="equipment" size={18} />
      </span>
    );
  }
  return <img alt="" className={className} onError={() => setFailed(true)} src={item.iconPath} />;
}

function ItemHoverTooltip({
  item,
  meta,
}: {
  readonly item: EquipmentItem;
  readonly meta?: string;
}) {
  return (
    <span className="eq-item-tooltip" role="tooltip">
      <strong>{item.name}</strong>
      <em>
        +{item.enhancement}
        {meta ? ` · ${meta}` : ''}
      </em>
      {item.bonuses.length > 0 ? (
        <ul>
          {item.bonuses.map((bonus) => (
            <li key={bonus}>{bonus}</li>
          ))}
        </ul>
      ) : (
        <span className="eq-item-tooltip-empty">Brak zapisanych bonusów</span>
      )}
    </span>
  );
}

function CharacterCard(props: {
  readonly entry: CharacterRecord;
  readonly workspace: WorkspaceRecord;
  readonly boardMode: BoardMode;
  readonly focusId: string;
  readonly dropTargetId: string | null;
  readonly selectedItemId: string | null;
  readonly writesEnabled: boolean;
  readonly addTimerKind: ProgressionKind | 'custom';
  readonly customTimerLabel: string;
  readonly onFocus: (characterId: string, setId: string) => void;
  readonly onSelectItem: (itemId: string) => void;
  readonly onAssign: (target: CharacterRecord, itemId: string, slot?: EquipmentSlot) => void;
  readonly onDropTarget: (id: string | null) => void;
  readonly onCharacterDrop: (event: DragEvent<HTMLElement>, target: CharacterRecord) => void;
  readonly onRemove: (characterId: string, setId: string, slot: EquipmentSlot) => void;
  readonly onCompleteTimer: (timerId: string, label: string, characterName: string) => void;
  readonly onRemoveTimer: (timerId: string, label: string, characterName: string) => void;
  readonly onAddTimer: (characterId: string) => void;
  readonly onAddTimerKind: (value: ProgressionKind | 'custom') => void;
  readonly onCustomTimerLabel: (value: string) => void;
  readonly missingKinds: readonly ProgressionKind[];
}) {
  const {
    entry,
    workspace,
    boardMode,
    focusId,
    dropTargetId,
    selectedItemId,
    writesEnabled,
    addTimerKind,
    customTimerLabel,
    onFocus,
    onSelectItem,
    onAssign,
    onDropTarget,
    onCharacterDrop,
    onRemove,
    onCompleteTimer,
    onRemoveTimer,
    onAddTimer,
    onAddTimerKind,
    onCustomTimerLabel,
    missingKinds,
  } = props;
  const set =
    entry.sets.find((candidate) => candidate.id === entry.activeSetId) ?? entry.sets[0] ?? null;
  const [timerClock, setTimerClock] = useState(() => Date.now());
  useEffect(() => {
    if (boardMode !== 'timers') return;
    const id = window.setInterval(() => setTimerClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [boardMode]);
  const timers = sortProgressionTimers(
    workspace.timers.filter((timer) => timer.characterId === entry.id),
  );

  return (
    <article
      className={`eq-char-card${focusId === entry.id ? ' is-focus' : ''}${
        dropTargetId === entry.id ? ' is-drop-target' : ''
      }${selectedItemId && boardMode === 'eq' ? ' is-assignable' : ''}`}
      onClick={() => {
        if (focusId === entry.id) return;
        onFocus(entry.id, entry.activeSetId || entry.sets[0]?.id || '');
      }}
      onDragLeave={() => onDropTarget(null)}
      onDragOver={(event) => {
        if (boardMode !== 'eq') return;
        event.preventDefault();
        onDropTarget(entry.id);
      }}
      onDrop={(event) => {
        if (boardMode !== 'eq') return;
        onCharacterDrop(event, entry);
      }}
    >
      <div className="eq-char-card-top">
        <div className="eq-char-portrait">
          {entry.imagePath ? (
            <img
              alt={`${characterClassLabels[entry.characterClass]} — ${entry.name}`}
              src={entry.imagePath}
            />
          ) : (
            <span className="missing-render">Brak renderu</span>
          )}
        </div>
        <div className="eq-char-copy">
          <strong>{entry.name}</strong>
          <span className="eq-char-meta">
            {formatCharacterClassLine(entry.characterClass, entry.skillPath)}
            {entry.level ? ` · lv ${entry.level}` : ''}
          </span>
          <span className="eq-char-set">Set {set?.name ?? 'brak'}</span>
          {focusId === entry.id ? <span className="eq-char-selected">Wybrana</span> : null}
          {boardMode === 'eq' && selectedItemId ? (
            <button
              className="eq-assign-cta"
              onClick={(event) => {
                event.stopPropagation();
                onAssign(entry, selectedItemId);
              }}
              type="button"
            >
              Załóż wybrany przedmiot
            </button>
          ) : null}
        </div>
      </div>

      {boardMode === 'eq' && set ? (
        <div className="eq-char-slots">
          {equipmentSlots.map((slot) => {
            const itemId = set.assignments[slot];
            const item = workspace.items.find((candidate) => candidate.id === itemId);
            const readiness = getSlotReadiness(workspace, entry, set, slot);
            return (
              <button
                className={`eq-char-slot${item ? ' has-item' : ''}`}
                key={slot}
                onClick={(event) => {
                  event.stopPropagation();
                  if (selectedItemId) {
                    onAssign(entry, selectedItemId, slot);
                    return;
                  }
                  if (item) {
                    onFocus(entry.id, set.id);
                    onSelectItem(item.id);
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const itemIdDrop = event.dataTransfer.getData('text/item-id') || selectedItemId;
                  if (itemIdDrop) onAssign(entry, itemIdDrop, slot);
                }}
                type="button"
              >
                {item ? <ItemIcon item={item} /> : <span>{slotLabels[slot]}</span>}
                <small>{slotLabels[slot]}</small>
                {item ? (
                  <ItemHoverTooltip item={item} meta={readinessLabels[readiness]} />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {boardMode === 'timers' ? (
        <div
          className="eq-char-timers"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {timers.length === 0 ? (
            <p className="empty-copy">Brak timerów — dodaj poniżej.</p>
          ) : (
            timers.map((timer) => {
              const iconPath = timerIconPath(timer);
              const running = timer.status !== 'ready';
              const progress = timerProgressPercent(timer, new Date(timerClock));
              return (
                <article
                  className={`eq-char-timer${running ? ' is-running' : ' is-ready'}`}
                  key={timer.id}
                >
                  <div className="eq-char-timer-row">
                    <span>
                      {iconPath ? <img alt="" src={iconPath} /> : <Icon name="clock" size={18} />}
                    </span>
                    <div>
                      <strong>{timer.label}</strong>
                      <span>
                        {running ? 'Odliczanie' : 'Gotowe'}
                        {timer.remainingLabel ? ` · ${timer.remainingLabel}` : ''}
                      </span>
                    </div>
                    <button
                      disabled={!writesEnabled || running}
                      onClick={() => {
                        if (running) return;
                        onCompleteTimer(timer.id, timer.label, entry.name);
                      }}
                      title={
                        running ? 'Timer w toku — edycja zablokowana' : 'Jeden klik uruchamia cykl'
                      }
                      type="button"
                    >
                      {running ? 'Zablokowany' : 'Start'}
                    </button>
                    <button
                      className="eq-char-timer-remove"
                      disabled={!writesEnabled}
                      onClick={() => onRemoveTimer(timer.id, timer.label, entry.name)}
                      title="Usuń timer z karty"
                      type="button"
                    >
                      Usuń
                    </button>
                  </div>
                  <div
                    aria-label={`Postęp: ${progress}%`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={progress}
                    className="timer-progress-track"
                    role="progressbar"
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </article>
              );
            })
          )}
          <div className="eq-add-timer">
            <span className="section-kicker">Dodaj timer</span>
            <select
              aria-label="Rodzaj timera"
              onChange={(event) => onAddTimerKind(event.target.value as ProgressionKind | 'custom')}
              value={addTimerKind}
            >
              {missingKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {progressionTimerLabels[kind]}
                </option>
              ))}
              <option value="custom">Własny opis…</option>
            </select>
            {addTimerKind === 'custom' ? (
              <input
                aria-label="Nazwa własnego timera"
                onChange={(event) => onCustomTimerLabel(event.target.value)}
                placeholder="np. Codzienne zadanie"
                value={customTimerLabel}
              />
            ) : null}
            <button disabled={!writesEnabled} onClick={() => onAddTimer(entry.id)} type="button">
              Dodaj timer
            </button>
          </div>
        </div>
      ) : null}

      {boardMode === 'eq' && set
        ? equipmentSlots
            .filter((slot) => selectedItemId && set.assignments[slot] === selectedItemId)
            .map((slot) => (
              <button
                disabled={!writesEnabled}
                key={`rm-${slot}`}
                onClick={() => onRemove(entry.id, set.id, slot)}
                type="button"
              >
                Zdejmij z {slotLabels[slot]}
              </button>
            ))
        : null}
    </article>
  );
}

export function CharacterEquipment() {
  const params = useParams<{ teamId: string; characterId: string }>();
  const searchParams = useSearchParams();
  const requestedBoardMode: BoardMode = searchParams.get('view') === 'timers' ? 'timers' : 'eq';
  const {
    state,
    hydrated,
    openWorkspace,
    assignItem,
    removeItem,
    setActiveSet,
    createSet,
    confirmLocation,
    completeTimer,
    ensureProgressionTimers,
    addTimer,
    removeTimer,
    createItem,
    updateItemBonuses,
    writesEnabled,
  } = usePlayerStore();

  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const character = workspace?.characters.find((entry) => entry.id === params.characterId) ?? null;

  const [boardMode, setBoardMode] = useState<BoardMode>(requestedBoardMode);
  const [focusCharacterId, setFocusCharacterId] = useState<string>('');
  const [activeSetId, setActiveSetId] = useState<string>('');
  const [newSetName, setNewSetName] = useState('');
  const [addingSet, setAddingSet] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EquipmentSlot | 'all'>('all');
  const [announcement, setAnnouncement] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false);
  const [newItemSlot, setNewItemSlot] = useState<EquipmentSlot | null>(null);
  const [newItemEnhancement, setNewItemEnhancement] = useState(9);
  const [newItemSelectedBonuses, setNewItemSelectedBonuses] = useState<readonly string[]>([]);
  const [showAssigned, setShowAssigned] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [addTimerKind, setAddTimerKind] = useState<ProgressionKind | 'custom'>('custom');
  const [customTimerLabel, setCustomTimerLabel] = useState('');
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const INVENTORY_COLS = 6;
  const INVENTORY_MIN_ROWS = 5;

  useEffect(() => {
    setBoardMode(requestedBoardMode);
  }, [requestedBoardMode]);

  const selectBoardMode = (mode: BoardMode) => {
    setBoardMode(mode);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (mode === 'timers') url.searchParams.set('view', 'timers');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  useEffect(() => {
    if (!workspace || !character) return;
    openWorkspace(workspace.id, character.id);
    setFocusCharacterId(character.id);
    setActiveSetId(character.activeSetId || character.sets[0]?.id || '');
    if (writesEnabled) {
      for (const entry of workspace.characters) {
        if (!entry.archived) ensureProgressionTimers(workspace.id, entry.id);
      }
    }
  }, [
    workspace?.id,
    character?.id,
    character?.activeSetId,
    openWorkspace,
    writesEnabled,
    ensureProgressionTimers,
  ]);

  const ownership = useMemo(
    () => (workspace ? assignedItemIds(workspace) : new Map<string, string>()),
    [workspace],
  );

  const poolItems = useMemo(() => {
    if (!workspace) return [] as EquipmentItem[];
    const tokens = normalizeItemSearchText(query)
      .split(' ')
      .filter((token) => token.length > 0);
    return workspace.items.filter((item) => {
      if (item.archived) return false;
      const assignedTo = ownership.get(item.id);
      if (!showAssigned && assignedTo) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (tokens.length === 0) return true;
      const haystack = normalizeItemSearchText(`${item.name} ${item.bonuses.join(' ')}`);
      return tokens.every((token) => {
        if (haystack.includes(token)) return true;
        if (token.length >= 4) {
          const stem = token.slice(0, Math.max(4, token.length - 1));
          return haystack.includes(stem);
        }
        return false;
      });
    });
  }, [workspace, ownership, showAssigned, category, query]);

  const catalogSuggestions = useMemo(() => {
    if (!character) return [];
    return searchEquipmentCatalogSuggestions(stripEnhancementFromName(newItemName), {
      characterClass: character.characterClass,
      limit: 30,
    });
  }, [character, newItemName]);

  const matchedDefinition = findGameItemByCardName(newItemName);
  const createCatalogBonusEntries = useMemo(() => {
    if (!createOpen) return [];
    const normalized = newItemName.trim();
    if (normalized.length < 2) return [];
    return catalogBonusEntriesForItem(normalized, newItemEnhancement);
  }, [createOpen, newItemName, newItemEnhancement]);

  useEffect(() => {
    if (!createOpen) return;
    setNewItemSelectedBonuses(createCatalogBonusEntries.map((entry) => entry.line));
  }, [createOpen, createCatalogBonusEntries]);
  const livingCharacters = useMemo(
    () => workspace?.characters.filter((entry) => !entry.archived) ?? [],
    [workspace],
  );

  if (!hydrated) {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Ładowanie…</p>
      </main>
    );
  }

  if (state.authStatus !== 'authenticated' || !state.viewer) {
    return <DiscordEntryScreen />;
  }

  if (!workspace || !character) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="equipment-page" id="main-content">
          <h1>Nie znaleziono postaci</h1>
          <a href="/characters">Wróć do postaci</a>
        </main>
      </AppShell>
    );
  }

  const focusCharacter =
    livingCharacters.find((entry) => entry.id === focusCharacterId) ?? character;
  const activeSet =
    focusCharacter.sets.find((set) => set.id === activeSetId) ??
    focusCharacter.sets.find((set) => set.id === focusCharacter.activeSetId) ??
    focusCharacter.sets[0] ??
    null;
  const selectedItem = workspace.items.find((item) => item.id === selectedItemId) ?? null;

  const assignToCharacter = (target: CharacterRecord, itemId: string, slot?: EquipmentSlot) => {
    if (!writesEnabled) return;
    const item = workspace.items.find((entry) => entry.id === itemId);
    if (!item) return;
    const set =
      target.sets.find((entry) => entry.id === target.activeSetId) ?? target.sets[0] ?? null;
    if (!set) {
      setAnnouncement('Postać nie ma setu EQ.');
      return;
    }
    const targetSlot = slot ?? item.category;
    if (item.category !== targetSlot) {
      setAnnouncement('Przedmiot nie pasuje do tego slotu.');
      return;
    }
    const catalogHit = findGameItemByCardName(item.name);
    if (catalogHit) {
      const catalogSlot = equipmentSlotForCategory(catalogHit.category);
      if (catalogSlot === null) {
        setAnnouncement('To nie jest przedmiot EQ (np. ulepszacz / amulet).');
        return;
      }
      if (catalogSlot !== targetSlot) {
        setAnnouncement(`Ten przedmiot należy do slotu: ${slotLabels[catalogSlot]}.`);
        return;
      }
      if (!isItemCompatibleWithClass(catalogHit.category, target.characterClass)) {
        setAnnouncement(
          `${item.name} nie pasuje do klasy ${characterClassLabels[target.characterClass]}.`,
        );
        return;
      }
    }
    assignItem(workspace.id, target.id, set.id, itemId, targetSlot);
    setFocusCharacterId(target.id);
    setActiveSetId(set.id);
    setSelectedItemId(itemId);
    setAnnouncement(`${item.name} → ${target.name} (${slotLabels[targetSlot]}).`);
  };

  const onPoolDragStart = (event: DragEvent<HTMLButtonElement>, itemId: string) => {
    event.dataTransfer.setData('text/item-id', itemId);
    event.dataTransfer.effectAllowed = 'move';
    setSelectedItemId(itemId);
  };

  const onCharacterDrop = (event: DragEvent<HTMLElement>, target: CharacterRecord) => {
    event.preventDefault();
    setDropTargetId(null);
    const itemId = event.dataTransfer.getData('text/item-id') || selectedItemId;
    if (!itemId) return;
    assignToCharacter(target, itemId);
  };

  const handleCreateItem = (event: FormEvent) => {
    event.preventDefault();
    if (!writesEnabled) return;
    const baseName = stripEnhancementFromName(newItemName);
    if (baseName.length < 2) {
      setCreateError('Wpisz nazwę i wybierz pozycję z katalogu.');
      return;
    }
    const catalogHit = findGameItemByCardName(baseName);
    if (!catalogHit) {
      setCreateError('Wybierz przedmiot z listy katalogu.');
      setCatalogMenuOpen(true);
      return;
    }
    const catalogSlot = equipmentSlotForCategory(catalogHit.category);
    if (catalogSlot === null) {
      setCreateError('Amuletów i ulepszaczy nie dodaje się do torby EQ.');
      return;
    }
    const cardName = formatEnhancedItemName(catalogHit.title, newItemEnhancement);
    const bonuses = newItemSelectedBonuses;
    const createdId = createItem(workspace.id, {
      name: cardName,
      category: catalogSlot,
      enhancement: newItemEnhancement,
      bonuses,
      planned: true,
    });
    if (!createdId) {
      setCreateError('Nie udało się dodać karty. Spróbuj inną nazwę z katalogu.');
      return;
    }
    setNewItemName('');
    setNewItemSlot(null);
    setNewItemSelectedBonuses([]);
    setCreateError(null);
    setCreateOpen(false);
    setSelectedItemId(createdId);
    const otherClass = !isItemCompatibleWithClass(
      catalogHit.category,
      focusCharacter.characterClass,
    );
    setAnnouncement(
      otherClass
        ? `Dodano do torby: ${cardName} (dla innej klasy — nie założysz na ${characterClassLabels[focusCharacter.characterClass]}).`
        : bonuses.length > 0
          ? `Dodano do torby: ${cardName} (${bonuses.length} bonusów).`
          : `Dodano do torby: ${cardName}.`,
    );
  };

  const missingKindsFor = (target: CharacterRecord): ProgressionKind[] => {
    const existing = new Set(
      workspace.timers
        .filter((timer) => timer.characterId === target.id)
        .map((timer) => timerKind(timer))
        .filter((kind): kind is ProgressionKind => kind !== null),
    );
    return progressionKindsForLevel(target.level).filter((kind) => !existing.has(kind));
  };

  const renderCampCard = (entry: CharacterRecord) => (
    <CharacterCard
      addTimerKind={addTimerKind}
      boardMode={boardMode}
      customTimerLabel={customTimerLabel}
      dropTargetId={dropTargetId}
      entry={entry}
      focusId={focusCharacter.id}
      key={entry.id}
      missingKinds={missingKindsFor(entry)}
      selectedItemId={selectedItemId}
      workspace={workspace}
      writesEnabled={writesEnabled}
      onAddTimer={(characterId) => {
        if (addTimerKind === 'custom') {
          addTimer(workspace.id, characterId, { label: customTimerLabel });
          setCustomTimerLabel('');
          setAnnouncement(`Dodano timer na ${entry.name}.`);
          return;
        }
        addTimer(workspace.id, characterId, { kind: addTimerKind });
        setAnnouncement(`Dodano ${progressionTimerLabels[addTimerKind]} na ${entry.name}.`);
      }}
      onAddTimerKind={setAddTimerKind}
      onAssign={assignToCharacter}
      onCharacterDrop={onCharacterDrop}
      onCompleteTimer={(timerId, label, characterName) => {
        const operationId = `timer-${timerId}-${Date.now()}`;
        completeTimer(workspace.id, timerId, operationId);
        const timer = workspace.timers.find((item) => item.id === timerId);
        setAnnouncement(
          `${characterName}: ${label} — czas ruszył.${timer ? ` ${completionHint(timer)}` : ''}`,
        );
      }}
      onRemoveTimer={(timerId, label, characterName) => {
        removeTimer(workspace.id, timerId);
        setAnnouncement(`${characterName}: usunięto timer „${label}”.`);
      }}
      onCustomTimerLabel={setCustomTimerLabel}
      onDropTarget={setDropTargetId}
      onFocus={(characterId, setId) => {
        setFocusCharacterId(characterId);
        setActiveSetId(setId);
      }}
      onRemove={(characterId, setId, slot) => {
        removeItem(workspace.id, characterId, setId, slot);
        setAnnouncement(`Usunięto z planu setu (${slotLabels[slot]}).`);
      }}
      onSelectItem={setSelectedItemId}
    />
  );

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="equipment-page eq-camp-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${workspace.id}`}>{workspace.name}</a>
          <Icon name="chevron" size={13} />
          <strong>{character.name}</strong>
        </nav>

        <header className="equipment-page-header">
          <div>
            <span className="eyebrow">Obóz EQ · przestrzeń</span>
            <h1>{workspace.name}</h1>
            <p>
              W centrum pula przedmiotów zespołu. Postacie wokół — przeciągnij kartę na postać
              (mobile: wybierz kartę, potem postać / slot). Zakładka Timery PH: cykle na kartach
              postaci.
            </p>
          </div>
          <div className="equipment-header-actions">
            <a href={`/teams/${workspace.id}/characters/${character.id}/edit`}>
              <Icon name="settings" size={14} /> Edytuj {character.name}
            </a>
            {activeSet && focusCharacter.id === character.id ? (
              <div className="set-switcher">
                <label htmlFor="active-set">Aktywny set · {focusCharacter.name}</label>
                <select
                  id="active-set"
                  onChange={(event) => {
                    const nextSetId = event.target.value;
                    setActiveSetId(nextSetId);
                    setSelectedItemId(null);
                    if (writesEnabled) {
                      setActiveSet(workspace.id, focusCharacter.id, nextSetId);
                      setAnnouncement(
                        `Aktywny set: ${focusCharacter.sets.find((set) => set.id === nextSetId)?.name ?? nextSetId}`,
                      );
                    }
                  }}
                  value={activeSet.id}
                >
                  {focusCharacter.sets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name}
                    </option>
                  ))}
                </select>
                {writesEnabled ? (
                  addingSet ? (
                    <form
                      className="set-add-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const createdId = createSet(workspace.id, focusCharacter.id, {
                          name: newSetName,
                          makeActive: true,
                        });
                        if (!createdId) {
                          setAnnouncement('Nazwa setu musi mieć min. 2 znaki.');
                          return;
                        }
                        setActiveSetId(createdId);
                        setNewSetName('');
                        setAddingSet(false);
                        setAnnouncement(`Dodano set „${newSetName.trim()}”.`);
                      }}
                    >
                      <input
                        aria-label="Nazwa nowego setu"
                        maxLength={32}
                        minLength={2}
                        onChange={(event) => setNewSetName(event.target.value)}
                        placeholder="np. Loch, Wojna…"
                        required
                        value={newSetName}
                      />
                      <button type="submit">Zapisz set</button>
                      <button
                        onClick={() => {
                          setAddingSet(false);
                          setNewSetName('');
                        }}
                        type="button"
                      >
                        Anuluj
                      </button>
                    </form>
                  ) : (
                    <button
                      className="set-add-button"
                      onClick={() => setAddingSet(true)}
                      type="button"
                    >
                      <Icon name="plus" size={14} /> Dodaj set
                    </button>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <div className="eq-camp-toolbar" role="tablist" aria-label="Tryb obozu">
          <button
            aria-selected={boardMode === 'eq'}
            className={boardMode === 'eq' ? 'is-active' : ''}
            onClick={() => selectBoardMode('eq')}
            role="tab"
            type="button"
          >
            Ekwipunek (pula)
          </button>
          <button
            aria-selected={boardMode === 'timers'}
            className={boardMode === 'timers' ? 'is-active' : ''}
            onClick={() => selectBoardMode('timers')}
            role="tab"
            type="button"
          >
            Timery PH
          </button>
          {selectedItemId ? (
            <span className="empty-copy">
              Wybrano kartę — kliknij postać lub slot, żeby przypisać.
            </span>
          ) : null}
        </div>

        <div className="eq-camp-layout">
          <section className={`eq-camp ${boardMode === 'timers' ? 'is-timers' : 'is-eq'}`}>
            <div className="eq-camp-ring">
              <div className="eq-camp-side-col eq-camp-side-left">
                {livingCharacters
                  .filter((_, index) => boardMode === 'timers' || index % 2 === 0)
                  .map(renderCampCard)}
              </div>

              <div className="eq-camp-center">
                {boardMode === 'eq' ? (
                  <>
                    <div className="eq-pool-header">
                      <div>
                        <span className="section-kicker">Centrum obozu · torba</span>
                        <h2>Inventory zespołu</h2>
                        <p className="empty-copy">
                          Dowolna liczba kart. Kliknij żeby wybrać, przeciągnij na postać lub użyj
                          "Załóż" poniżej (mobile).
                        </p>
                      </div>
                      <div className="eq-pool-actions">
                        <button
                          aria-pressed={showAssigned}
                          className={`eq-filter-toggle${showAssigned ? ' is-active' : ''}`}
                          onClick={() => setShowAssigned((value) => !value)}
                          title="Domyślnie torba ukrywa przedmioty już założone na postaciach. Włącz, żeby je zobaczyć."
                          type="button"
                        >
                          {showAssigned ? 'Założone: widoczne' : 'Pokaż założone'}
                        </button>
                        {writesEnabled ? (
                          <button
                            className={`eq-add-toggle${createOpen ? ' is-active' : ''}`}
                            onClick={() =>
                              setCreateOpen((open) => {
                                if (open) {
                                  setNewItemName('');
                                  setNewItemSlot(null);
                                  setNewItemSelectedBonuses([]);
                                  setCreateError(null);
                                }
                                return !open;
                              })
                            }
                            type="button"
                          >
                            <Icon name="plus" size={14} />{' '}
                            {createOpen ? 'Zamknij' : 'Dodaj przedmiot'}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {announcement ? (
                      <p className="entry-status" role="status">
                        {announcement}
                      </p>
                    ) : null}

                    {createOpen && writesEnabled ? (
                      <form className="eq-inline-create" onSubmit={handleCreateItem}>
                        <div className="eq-catalog-combobox">
                          <input
                            aria-autocomplete="list"
                            aria-controls="eq-catalog-menu"
                            aria-expanded={catalogMenuOpen && newItemName.trim().length >= 2}
                            aria-label="Nazwa przedmiotu z gry"
                            autoComplete="off"
                            autoFocus
                            onBlur={() => {
                              window.setTimeout(() => setCatalogMenuOpen(false), 120);
                            }}
                            onChange={(event) => {
                              const value = event.target.value;
                              setNewItemName(stripEnhancementFromName(value));
                              setCatalogMenuOpen(true);
                              const fromName = parseEnhancementFromName(value);
                              if (/\+\d+\s*$/u.test(value.trim())) {
                                setNewItemEnhancement(fromName);
                              }
                              const hit = findGameItemByCardName(value);
                              setNewItemSlot(
                                hit ? equipmentSlotForCategory(hit.category) : null,
                              );
                            }}
                            onFocus={() => setCatalogMenuOpen(true)}
                            placeholder="Szukaj w katalogu, np. czarna stal…"
                            value={newItemName}
                          />
                          {catalogMenuOpen && newItemName.trim().length >= 2 ? (
                            <ul className="eq-catalog-menu" id="eq-catalog-menu" role="listbox">
                              {catalogSuggestions.length === 0 ? (
                                <li className="eq-catalog-menu-empty">Brak trafień w katalogu EQ</li>
                              ) : (
                                catalogSuggestions.map((item) => {
                                  const slot = equipmentSlotForCategory(item.category);
                                  const compatible = isItemCompatibleWithClass(
                                    item.category,
                                    character.characterClass,
                                  );
                                  return (
                                    <li key={item.id} role="option">
                                      <button
                                        className={compatible ? undefined : 'is-incompatible'}
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          setNewItemName(item.title);
                                          setNewItemSlot(slot);
                                          setCatalogMenuOpen(false);
                                        }}
                                        type="button"
                                      >
                                        <strong>{item.title}</strong>
                                        <span>
                                          {slot ? slotLabels[slot] : '—'}
                                          {compatible ? '' : ' · inna klasa'}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })
                              )}
                            </ul>
                          ) : null}
                        </div>
                        <div className="eq-inline-create-row">
                          <select
                            aria-label="Ulepszenie"
                            onChange={(event) => setNewItemEnhancement(Number(event.target.value))}
                            value={newItemEnhancement}
                          >
                            {ENHANCEMENT_LEVELS.map((level) => (
                              <option key={level} value={level}>
                                +{level}
                              </option>
                            ))}
                          </select>
                          <span
                            aria-live="polite"
                            className={`eq-auto-slot${newItemSlot ? ' is-ready' : ''}`}
                          >
                            {newItemSlot
                              ? `Kategoria: ${slotLabels[newItemSlot]}`
                              : 'Kategoria: z katalogu'}
                          </span>
                          <button disabled={!newItemSlot} type="submit">
                            Dodaj do torby
                          </button>
                          <button
                            onClick={() => {
                              setCreateOpen(false);
                              setNewItemName('');
                              setNewItemSlot(null);
                            }}
                            type="button"
                          >
                            Anuluj
                          </button>
                        </div>
                        {matchedDefinition ? (
                          <p className="eq-catalog-hint">
                            Katalog: <strong>{matchedDefinition.title}</strong>
                            {matchedDefinition.sourceImageUrl ? ' · z grafiką' : ''}
                            {!isItemCompatibleWithClass(
                              matchedDefinition.category,
                              focusCharacter.characterClass,
                            )
                              ? ` · nie założysz na ${characterClassLabels[focusCharacter.characterClass]}, ale możesz dodać do torby zespołu`
                              : ''}
                          </p>
                        ) : newItemName.trim().length >= 2 ? (
                          <p className="eq-catalog-hint">
                            Wybierz pozycję z listy — slot ustawi się automatycznie.
                          </p>
                        ) : null}
                        {createError ? (
                          <p className="eq-create-error" role="alert">
                            {createError}
                          </p>
                        ) : null}

                        <div className="eq-create-bonus-section" aria-label="Wybór bonusów">
                          <span className="section-kicker">Bonusy tej karty (z katalogu)</span>
                          {createCatalogBonusEntries.length > 0 ? (
                            <div className="eq-bonus-toggle-list" role="list">
                              {createCatalogBonusEntries.map((entry) => {
                                const isSelected = newItemSelectedBonuses.includes(entry.line);
                                return (
                                  <button
                                    className={`eq-bonus-toggle-entry${
                                      isSelected ? ' is-selected' : ''
                                    }`}
                                    key={entry.name}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setNewItemSelectedBonuses((current) => {
                                        if (current.includes(entry.line)) {
                                          return current.filter((line) => line !== entry.line);
                                        }
                                        return [...current, entry.line];
                                      });
                                    }}
                                    type="button"
                                  >
                                    <span>{entry.name}</span>
                                    <em>{entry.valueAtLevel}</em>
                                    {isSelected ? (
                                      <span className="eq-bonus-check">✓</span>
                                    ) : (
                                      <span className="eq-bonus-plus">+</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : matchedDefinition ? (
                            <p className="eq-catalog-hint">
                              W katalogu nie ma drabinki wartości dla „{matchedDefinition.title}”.
                              Nie da się dodać bonusów z innych przedmiotów.
                            </p>
                          ) : (
                            <p className="eq-catalog-hint">
                              Najpierw wybierz przedmiot z listy — bonusy i wartości wejdą z jego
                              karty w katalogu.
                            </p>
                          )}
                          {newItemSelectedBonuses.length > 0 ? (
                            <p className="eq-create-bonus-selected">
                              Wybrane: {newItemSelectedBonuses.join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      </form>
                    ) : null}

                    <label className="market-search eq-pool-search">
                      <Icon name="search" size={16} />
                      <input
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Szukaj w inventory…"
                        value={query}
                      />
                    </label>
                    <div
                      aria-label="Filtr slotu EQ"
                      className="catalog-filters"
                      role="group"
                    >
                      <button
                        aria-pressed={category === 'all'}
                        className={category === 'all' ? 'is-active' : ''}
                        onClick={() => setCategory('all')}
                        type="button"
                      >
                        Wszystkie
                      </button>
                      {equipmentSlots.map((slot) => (
                        <button
                          aria-pressed={category === slot}
                          className={category === slot ? 'is-active' : ''}
                          key={slot}
                          onClick={() => setCategory(slot)}
                          type="button"
                        >
                          {slotLabels[slot]}
                        </button>
                      ))}
                    </div>
                    <div className="eq-inventory-grid" aria-label="Inventory zespołu — torba">
                      {poolItems.map((item) => {
                        const owner = ownership.get(item.id);
                        return (
                          <button
                            aria-label={item.name}
                            aria-pressed={item.id === selectedItemId}
                            className={`eq-inventory-slot${owner ? ' is-assigned' : ''}${item.id === selectedItemId ? ' is-selected' : ''}`}
                            draggable
                            key={item.id}
                            onClick={() =>
                              setSelectedItemId((current) => (current === item.id ? null : item.id))
                            }
                            onDragStart={(event) => onPoolDragStart(event, item.id)}
                            type="button"
                          >
                            <ItemIcon item={item} />
                            <em>+{item.enhancement}</em>
                            <ItemHoverTooltip
                              item={item}
                              meta={owner ? `na ${owner}` : 'w torbie'}
                            />
                          </button>
                        );
                      })}
                      {poolItems.length === 0 ? (
                        <div className="eq-inventory-bag-empty">
                          <span>Torba pusta</span>
                          <small>Kliknij "Dodaj przedmiot" powyżej</small>
                        </div>
                      ) : null}
                      {Array.from({
                        length: Math.max(
                          0,
                          INVENTORY_COLS * INVENTORY_MIN_ROWS -
                            poolItems.length -
                            (poolItems.length === 0 ? 1 : 0),
                        ),
                      }).map((_, index) => (
                        <div
                          aria-hidden
                          className="eq-inventory-slot is-empty"
                          key={`empty-${index}`}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              <div className="eq-camp-side-col eq-camp-side-right">
                {livingCharacters
                  .filter((_, index) => boardMode !== 'timers' && index % 2 === 1)
                  .map(renderCampCard)}
              </div>
            </div>
          </section>

          {selectedItem && boardMode === 'eq' ? (
            <div className="eq-mobile-assign" role="region" aria-label="Przypisz na mobile">
              <ItemIcon item={selectedItem} />
              <div>
                <strong>{selectedItem.name}</strong>
                <span>Wybierz postać poniżej</span>
              </div>
              <div className="eq-mobile-assign-targets">
                {livingCharacters.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => assignToCharacter(entry, selectedItem.id)}
                    type="button"
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
              <button onClick={() => setSelectedItemId(null)} type="button">
                Anuluj
              </button>
            </div>
          ) : null}

          <aside className="eq-camp-side">
            <section className="panel inspector-panel">
              <header>
                <h2>Szczegóły</h2>
              </header>
              {selectedItem ? (
                <>
                  <div
                    className="eq-pool-item-art"
                    style={{ width: 72, height: 80, marginBottom: 10 }}
                  >
                    <img alt="" src={selectedItem.iconPath} />
                  </div>
                  <h3>{selectedItem.name}</h3>
                  <p>
                    Ulepszenie +{selectedItem.enhancement} · {selectedItem.levelLabel}
                  </p>
                  <div className="eq-bonus-editor">
                    <span className="section-kicker">Bonusy na przedmiocie</span>
                    <ul className="eq-bonus-lines">
                      {selectedItem.bonuses.map((bonus) => (
                        <li key={bonus}>
                          <span>{bonus}</span>
                          <button
                            disabled={!writesEnabled}
                            onClick={() => {
                              updateItemBonuses(
                                workspace.id,
                                selectedItem.id,
                                selectedItem.bonuses.filter((line) => line !== bonus),
                              );
                              setAnnouncement(`Usunięto bonus: ${bonus}`);
                            }}
                            type="button"
                          >
                            Usuń
                          </button>
                        </li>
                      ))}
                      {selectedItem.bonuses.length === 0 ? (
                        <li className="eq-bonus-empty">
                          <span>Brak bonusów — dodaj poniżej</span>
                        </li>
                      ) : null}
                    </ul>

                    {(() => {
                      const catalogEntries = catalogBonusEntriesForItem(
                        selectedItem.name,
                        selectedItem.enhancement,
                      );
                      if (catalogEntries.length > 0) {
                        return (
                          <>
                            <span className="eq-bonus-source-label">
                              Z katalogu gry (+{selectedItem.enhancement}):
                            </span>
                            <div className="eq-bonus-catalog-list">
                              {catalogEntries.map((entry) => {
                                const alreadyAdded = selectedItem.bonuses.includes(entry.line);
                                return (
                                  <button
                                    className={`eq-bonus-catalog-entry${alreadyAdded ? ' is-added' : ''}`}
                                    disabled={!writesEnabled || alreadyAdded}
                                    key={entry.name}
                                    onClick={() => {
                                      if (alreadyAdded) return;
                                      updateItemBonuses(workspace.id, selectedItem.id, [
                                        ...selectedItem.bonuses,
                                        entry.line,
                                      ]);
                                      setAnnouncement(`Dodano: ${entry.line}`);
                                    }}
                                    title={alreadyAdded ? 'Już dodany' : `Dodaj: ${entry.line}`}
                                    type="button"
                                  >
                                    <span>{entry.name}</span>
                                    <em>{entry.valueAtLevel ?? '?'}</em>
                                    {alreadyAdded ? (
                                      <span className="eq-bonus-check">✓</span>
                                    ) : (
                                      <span className="eq-bonus-plus">+</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        );
                      }
                      return (
                        <p className="eq-catalog-hint">
                          W katalogu nie ma drabinki wartości dla tej karty. Bonusów z innych
                          przedmiotów nie da się tu dodać.
                        </p>
                      );
                    })()}

                    <button
                      disabled={!writesEnabled}
                      onClick={() => {
                        const fromCatalog = resolveItemBonuses(
                          selectedItem.name,
                          selectedItem.enhancement,
                          [],
                        );
                        if (fromCatalog.length === 0) {
                          setAnnouncement(
                            'Dump nie ma pełnej drabinki dla tej karty (często ucięty wiki_upgrade).',
                          );
                          return;
                        }
                        updateItemBonuses(workspace.id, selectedItem.id, fromCatalog);
                        setAnnouncement(`Wczytano ${fromCatalog.length} linii z katalogu dumpa.`);
                      }}
                      type="button"
                    >
                      Wczytaj z katalogu (+{selectedItem.enhancement})
                    </button>
                  </div>
                  <p>
                    Ostatnio potwierdzona lokalizacja:{' '}
                    <strong>{selectedItem.lastConfirmedLocation ?? 'brak'}</strong>
                  </p>
                  <button
                    className="primary-button"
                    disabled={!writesEnabled}
                    onClick={() => {
                      confirmLocation(workspace.id, selectedItem.id, focusCharacter.name);
                      setAnnouncement(
                        `${selectedItem.name}: potwierdzono lokalizację na ${focusCharacter.name}.`,
                      );
                    }}
                    type="button"
                  >
                    Potwierdź: jest na {focusCharacter.name}
                  </button>
                  <label className="field">
                    <span>Oznacz jako przeniesione</span>
                    <input
                      onChange={(event) => setMoveTarget(event.target.value)}
                      placeholder="np. depo / inna postać"
                      value={moveTarget}
                    />
                  </label>
                  <button
                    disabled={!writesEnabled || moveTarget.trim().length < 2}
                    onClick={() => {
                      confirmLocation(workspace.id, selectedItem.id, moveTarget.trim());
                      setAnnouncement(`${selectedItem.name}: lokalizacja → ${moveTarget.trim()}`);
                      setMoveTarget('');
                    }}
                    type="button"
                  >
                    Potwierdź przeniesienie
                  </button>
                  {activeSet
                    ? equipmentSlots
                        .filter((slot) => activeSet.assignments[slot] === selectedItem.id)
                        .map((slot) => (
                          <button
                            disabled={!writesEnabled}
                            key={slot}
                            onClick={() => {
                              removeItem(workspace.id, focusCharacter.id, activeSet.id, slot);
                              setAnnouncement(`Usunięto z planu setu (${slotLabels[slot]}).`);
                            }}
                            type="button"
                          >
                            Usuń z planu setu
                          </button>
                        ))
                    : null}
                </>
              ) : (
                <p>Wybierz kartę z inventory albo slotu postaci.</p>
              )}
            </section>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {announcement ? <p className="entry-status">{announcement}</p> : null}
        <div className="mock-notice">
          Pula EQ jest wspólna dla przestrzeni. Drag na postać = plan setu. Timery PH przy ognisku ≠
          Timery metinów na /timers. Dane tylko w tej przeglądarce.
        </div>
      </main>
    </AppShell>
  );
}
