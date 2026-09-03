'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';

import { characterClassLabels } from '../../../../../src/character-profile';
import {
  ENHANCEMENT_LEVELS,
  equipmentCatalogItems,
  equipmentSlotForCategory,
  findGameItemByCardName,
  formatEnhancedItemName,
  isItemCompatibleWithClass,
  knownCatalogBonusNames,
  parseEnhancementFromName,
  resolveItemBonuses,
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

export function CharacterEquipment() {
  const params = useParams<{ teamId: string; characterId: string }>();
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
    createItem,
    updateItemBonuses,
    writesEnabled,
  } = usePlayerStore();

  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const character = workspace?.characters.find((entry) => entry.id === params.characterId) ?? null;

  const [boardMode, setBoardMode] = useState<BoardMode>('eq');
  const [focusCharacterId, setFocusCharacterId] = useState<string>('');
  const [activeSetId, setActiveSetId] = useState<string>('');
  const [newSetName, setNewSetName] = useState('');
  const [addingSet, setAddingSet] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EquipmentSlot | 'all'>('all');
  const [announcement, setAnnouncement] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemSlot, setNewItemSlot] = useState<EquipmentSlot>('weapon');
  const [newItemEnhancement, setNewItemEnhancement] = useState(9);
  const [showAssigned, setShowAssigned] = useState(true);
  const [moveTarget, setMoveTarget] = useState('');
  const [addTimerKind, setAddTimerKind] = useState<ProgressionKind | 'custom'>('skill_book');
  const [customTimerLabel, setCustomTimerLabel] = useState('');
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [bonusDraft, setBonusDraft] = useState('');
  const [bonusPick, setBonusPick] = useState('');

  const catalogBonusNames = useMemo(() => knownCatalogBonusNames(), []);

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
  }, [workspace, character, openWorkspace, writesEnabled, ensureProgressionTimers]);

  const ownership = useMemo(
    () => (workspace ? assignedItemIds(workspace) : new Map<string, string>()),
    [workspace],
  );

  const poolItems = useMemo(() => {
    if (!workspace) return [] as EquipmentItem[];
    const normalized = query.trim().toLocaleLowerCase('pl');
    return workspace.items.filter((item) => {
      if (item.archived) return false;
      const assignedTo = ownership.get(item.id);
      if (!showAssigned && assignedTo) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (
        normalized.length > 0 &&
        !item.name.toLocaleLowerCase('pl').includes(normalized) &&
        !item.bonuses.some((bonus) => bonus.toLocaleLowerCase('pl').includes(normalized))
      ) {
        return false;
      }
      return true;
    });
  }, [workspace, ownership, showAssigned, category, query]);

  const catalogSuggestions = useMemo(() => {
    if (!character) return [];
    const normalized = stripEnhancementFromName(newItemName).toLocaleLowerCase('pl');
    if (normalized.length < 2) return [];
    return equipmentCatalogItems({
      characterClass: character.characterClass,
      slot: newItemSlot,
    })
      .filter((item) => item.title.toLocaleLowerCase('pl').includes(normalized))
      .slice(0, 8);
  }, [character, newItemName, newItemSlot]);

  const matchedDefinition = findGameItemByCardName(newItemName);
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
    if (baseName.length < 2) return;
    const catalogHit = findGameItemByCardName(baseName);
    if (catalogHit) {
      const catalogSlot = equipmentSlotForCategory(catalogHit.category);
      if (catalogSlot === null) {
        setAnnouncement('Amuletów i ulepszaczy nie dodaje się do slotów EQ.');
        return;
      }
      if (!isItemCompatibleWithClass(catalogHit.category, focusCharacter.characterClass)) {
        setAnnouncement(
          `${catalogHit.title} nie jest dla klasy ${characterClassLabels[focusCharacter.characterClass]}.`,
        );
        return;
      }
    }
    const cardName = formatEnhancedItemName(baseName, newItemEnhancement);
    const bonuses = resolveItemBonuses(cardName, newItemEnhancement, []);
    createItem(workspace.id, {
      name: cardName,
      category: newItemSlot,
      enhancement: newItemEnhancement,
      bonuses,
      planned: true,
      forCharacterClass: focusCharacter.characterClass,
    });
    setNewItemName('');
    setAnnouncement(
      bonuses.length > 0
        ? `Utworzono ${cardName} z bonusami z katalogu (${bonuses.length}).`
        : `Utworzono ${cardName} — uzupełnij bonusy w szczegółach (katalog bez drabinki).`,
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
              (mobile: wybierz kartę, potem postać / slot). Odwrócenie → ognisko i timery PH.
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
            onClick={() => setBoardMode('eq')}
            role="tab"
            type="button"
          >
            Ekwipunek (pula)
          </button>
          <button
            aria-selected={boardMode === 'timers'}
            className={boardMode === 'timers' ? 'is-active' : ''}
            onClick={() => setBoardMode('timers')}
            role="tab"
            type="button"
          >
            Timery PH (ognisko)
          </button>
          {selectedItemId ? (
            <span className="empty-copy">
              Wybrano kartę — kliknij postać lub slot, żeby przypisać.
            </span>
          ) : null}
        </div>

        <div className="eq-camp-layout">
          <section className={`eq-camp ${boardMode === 'timers' ? 'is-timers' : 'is-eq'}`}>
            <div className="eq-camp-center">
              {boardMode === 'eq' ? (
                <>
                  <div className="eq-pool-header">
                    <div>
                      <span className="section-kicker">Centrum obozu</span>
                      <h2>Ekwipunek (inventory)</h2>
                      <p className="empty-copy">
                        Siatka jak w Metin2 — tu mieści się dowolna liczba kart. Na postać zakładysz
                        max 8 slotów EQ.
                      </p>
                    </div>
                    <label className="field">
                      <input
                        checked={showAssigned}
                        onChange={(event) => setShowAssigned(event.target.checked)}
                        type="checkbox"
                      />{' '}
                      Pokaż też założone
                    </label>
                  </div>
                  <label className="market-search">
                    <Icon name="search" size={16} />
                    <input
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Szukaj przedmiotu…"
                      value={query}
                    />
                  </label>
                  <div className="catalog-filters" style={{ marginTop: 10, marginBottom: 10 }}>
                    <button
                      className={category === 'all' ? 'is-active' : ''}
                      onClick={() => setCategory('all')}
                      type="button"
                    >
                      Wszystkie
                    </button>
                    {equipmentSlots.map((slot) => (
                      <button
                        className={category === slot ? 'is-active' : ''}
                        key={slot}
                        onClick={() => setCategory(slot)}
                        type="button"
                      >
                        {slotLabels[slot]}
                      </button>
                    ))}
                  </div>
                  <div className="eq-inventory-grid" aria-label="Inventory zespołu">
                    {poolItems.map((item) => {
                      const owner = ownership.get(item.id);
                      return (
                        <button
                          aria-label={item.name}
                          aria-pressed={item.id === selectedItemId}
                          className={`eq-inventory-slot${owner ? ' is-assigned' : ''}`}
                          draggable
                          key={item.id}
                          onClick={() =>
                            setSelectedItemId((current) => (current === item.id ? null : item.id))
                          }
                          onDragStart={(event) => onPoolDragStart(event, item.id)}
                          title={owner ? `${item.name} · na ${owner}` : item.name}
                          type="button"
                        >
                          <img alt="" src={item.iconPath} />
                          <em>+{item.enhancement}</em>
                        </button>
                      );
                    })}
                    {Array.from({
                      length: Math.max(0, 30 - poolItems.length),
                    }).map((_, index) => (
                      <div
                        aria-hidden
                        className="eq-inventory-slot is-empty"
                        key={`empty-${index}`}
                      />
                    ))}
                  </div>
                  {poolItems.length === 0 ? (
                    <p className="empty-copy">Brak kart — dodaj po prawej do inventory.</p>
                  ) : null}
                </>
              ) : (
                <div className="eq-campfire" aria-hidden={false}>
                  <div className="eq-campfire-flame" />
                  <strong>Ognisko</strong>
                  <span>Karty postaci pokazują cykle PH · jeden klik uruchamia odliczanie</span>
                </div>
              )}
            </div>

            <div className="eq-camp-characters">
              {livingCharacters.map((entry) => {
                const set =
                  entry.sets.find((candidate) => candidate.id === entry.activeSetId) ??
                  entry.sets[0] ??
                  null;
                const timers = sortProgressionTimers(
                  workspace.timers.filter((timer) => timer.characterId === entry.id),
                );
                const missing = missingKindsFor(entry);
                return (
                  <article
                    className={`eq-char-card${focusCharacter.id === entry.id ? ' is-focus' : ''}${
                      dropTargetId === entry.id ? ' is-drop-target' : ''
                    }`}
                    key={entry.id}
                    onDragLeave={() => setDropTargetId(null)}
                    onDragOver={(event) => {
                      if (boardMode !== 'eq') return;
                      event.preventDefault();
                      setDropTargetId(entry.id);
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
                      <div>
                        <strong>{entry.name}</strong>
                        <span>
                          {characterClassLabels[entry.characterClass]}
                          {entry.level ? ` · lv ${entry.level}` : ''} · {set?.name ?? 'brak setu'}
                        </span>
                        {boardMode === 'eq' && selectedItemId ? (
                          <button
                            onClick={() => assignToCharacter(entry, selectedItemId)}
                            style={{ marginTop: 8 }}
                            type="button"
                          >
                            Przypisz wybrany przedmiot
                          </button>
                        ) : null}
                        <button
                          onClick={() => {
                            setFocusCharacterId(entry.id);
                            setActiveSetId(entry.activeSetId || entry.sets[0]?.id || '');
                          }}
                          style={{ marginTop: 6 }}
                          type="button"
                        >
                          Ustaw fokus
                        </button>
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
                              onClick={() => {
                                if (selectedItemId) {
                                  assignToCharacter(entry, selectedItemId, slot);
                                  return;
                                }
                                if (item) {
                                  setSelectedItemId(item.id);
                                  setFocusCharacterId(entry.id);
                                  setAnnouncement(`${item.name} · ${readinessLabels[readiness]}`);
                                }
                              }}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const itemIdDrop =
                                  event.dataTransfer.getData('text/item-id') || selectedItemId;
                                if (itemIdDrop) assignToCharacter(entry, itemIdDrop, slot);
                              }}
                              type="button"
                            >
                              {item ? (
                                <img alt="" src={item.iconPath} />
                              ) : (
                                <span>{slotLabels[slot]}</span>
                              )}
                              <small>{slotLabels[slot]}</small>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {boardMode === 'timers' ? (
                      <div className="eq-char-timers">
                        {timers.length === 0 ? (
                          <p className="empty-copy">Brak timerów — dodaj poniżej.</p>
                        ) : (
                          timers.map((timer) => {
                            const iconPath = timerIconPath(timer);
                            const running = timer.status !== 'ready';
                            return (
                              <article
                                className={`eq-char-timer${running ? ' is-running' : ' is-ready'}`}
                                key={timer.id}
                              >
                                <div className="eq-char-timer-row">
                                  <span>
                                    {iconPath ? (
                                      <img alt="" src={iconPath} />
                                    ) : (
                                      <Icon name="clock" size={18} />
                                    )}
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
                                      const operationId = `timer-${timer.id}-${Date.now()}`;
                                      completeTimer(workspace.id, timer.id, operationId);
                                      setAnnouncement(
                                        `${entry.name}: ${timer.label} — czas ruszył. ${completionHint(timer)}`,
                                      );
                                    }}
                                    title={
                                      running
                                        ? 'Timer w toku — edycja zablokowana'
                                        : 'Jeden klik uruchamia cykl'
                                    }
                                    type="button"
                                  >
                                    {running ? 'Zablokowany' : 'Start'}
                                  </button>
                                </div>
                                <div className="timer-progress-track" aria-hidden="true">
                                  <span style={{ width: `${timer.progressPercent}%` }} />
                                </div>
                              </article>
                            );
                          })
                        )}
                        <div className="eq-add-timer">
                          <span className="section-kicker">Dodaj timer</span>
                          <select
                            aria-label="Rodzaj timera"
                            onChange={(event) =>
                              setAddTimerKind(event.target.value as ProgressionKind | 'custom')
                            }
                            value={addTimerKind}
                          >
                            {missing.map((kind) => (
                              <option key={kind} value={kind}>
                                {progressionTimerLabels[kind]}
                              </option>
                            ))}
                            <option value="custom">Własny opis…</option>
                          </select>
                          {addTimerKind === 'custom' ? (
                            <input
                              aria-label="Nazwa własnego timera"
                              onChange={(event) => setCustomTimerLabel(event.target.value)}
                              placeholder="np. Codzienne zadanie"
                              value={customTimerLabel}
                            />
                          ) : null}
                          <button
                            disabled={!writesEnabled}
                            onClick={() => {
                              if (addTimerKind === 'custom') {
                                addTimer(workspace.id, entry.id, { label: customTimerLabel });
                                setCustomTimerLabel('');
                                setAnnouncement(`Dodano timer na ${entry.name}.`);
                                return;
                              }
                              addTimer(workspace.id, entry.id, { kind: addTimerKind });
                              setAnnouncement(
                                `Dodano ${progressionTimerLabels[addTimerKind]} na ${entry.name}.`,
                              );
                            }}
                            type="button"
                          >
                            Dodaj timer
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="eq-camp-side">
            <section className="panel catalog-panel">
              <header>
                <h2>Dodaj kartę EQ</h2>
              </header>
              <p className="empty-copy">
                Trafia do puli w centrum. Grafika z katalogu gry, gdy nazwa pasuje.
              </p>
              <form className="inline-create" onSubmit={handleCreateItem}>
                <input
                  aria-label="Nazwa nowego przedmiotu"
                  list="eq-catalog-suggestions"
                  onChange={(event) => {
                    const value = event.target.value;
                    setNewItemName(stripEnhancementFromName(value));
                    const fromName = parseEnhancementFromName(value);
                    if (/\+\d+\s*$/u.test(value.trim())) {
                      setNewItemEnhancement(fromName);
                    }
                    const hit = findGameItemByCardName(value);
                    const slot = hit ? equipmentSlotForCategory(hit.category) : null;
                    if (slot) setNewItemSlot(slot);
                  }}
                  placeholder="Nazwa z gry, np. Bojowa Tarcza"
                  value={newItemName}
                />
                <datalist id="eq-catalog-suggestions">
                  {catalogSuggestions.map((item) => (
                    <option key={item.id} value={item.title} />
                  ))}
                </datalist>
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
                <select
                  aria-label="Slot nowego przedmiotu"
                  onChange={(event) => setNewItemSlot(event.target.value as EquipmentSlot)}
                  value={newItemSlot}
                >
                  {equipmentSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slotLabels[slot]}
                    </option>
                  ))}
                </select>
                <button disabled={!writesEnabled} type="submit">
                  Dodaj do puli
                </button>
              </form>
              {matchedDefinition ? (
                <p className="empty-copy">
                  Katalog: <strong>{matchedDefinition.title}</strong>
                  {matchedDefinition.sourceImageUrl ? ' · z grafiką' : ' · bez grafiki'}
                </p>
              ) : null}
            </section>

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
                    <span className="section-kicker">Bonusy (obserwowane)</span>
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
                        <li>
                          <span>Brak linii — dodaj z katalogu lub wpisz obserwację</span>
                        </li>
                      ) : null}
                    </ul>
                    <select
                      aria-label="Bonus z katalogu dumpa"
                      onChange={(event) => setBonusPick(event.target.value)}
                      value={bonusPick}
                    >
                      <option value="">Nazwa z katalogu dumpa…</option>
                      {catalogBonusNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Pełna linia bonusu"
                      onChange={(event) => setBonusDraft(event.target.value)}
                      placeholder="np. Obrona +57 albo własna obserwacja"
                      value={bonusDraft}
                    />
                    <button
                      disabled={!writesEnabled || (bonusDraft.trim().length < 2 && !bonusPick)}
                      onClick={() => {
                        const line = bonusDraft.trim() || bonusPick;
                        if (line.length < 2) return;
                        updateItemBonuses(workspace.id, selectedItem.id, [
                          ...selectedItem.bonuses,
                          line,
                        ]);
                        setBonusDraft('');
                        setBonusPick('');
                        setAnnouncement(`Dodano bonus: ${line}`);
                      }}
                      type="button"
                    >
                      Dodaj bonus
                    </button>
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
