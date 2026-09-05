'use client';

import { useParams, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { characterClassLabels, formatCharacterClassLine } from '../../../../../src/character-profile';
import {
  ENHANCEMENT_LEVELS,
  maxAdditionalBonusesForItem,
  catalogBonusEntriesForItem,
  additionalBonusOptionsForItem,
  displayItemBonuses,
  equipmentSlotForCategory,
  findGameItemByCardName,
  formatEnhancedItemName,
  isItemCompatibleWithClass,
  mergeItemBonusStorage,
  normalizeItemSearchText,
  parseEnhancementFromName,
  searchEquipmentCatalogSuggestions,
  splitItemBonuses,
  weaponHasAverageSkillDamage,
  weaponHasPhPvmAttackBonuses,
  stripEnhancementFromName,
  readAverageSkillDamage,
  withAverageSkillDamage,
  AVERAGE_DAMAGE_MIN,
  AVERAGE_DAMAGE_MAX,
  SKILL_DAMAGE_MIN,
  SKILL_DAMAGE_MAX,
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

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
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


function findItemEquipLocation(
  workspace: WorkspaceRecord,
  itemId: string,
): {
  readonly characterId: string;
  readonly characterName: string;
  readonly setId: string;
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
            slot,
          };
        }
      }
    }
  }
  return null;
}

/** Assignment-based owner label for tooltips (never "Poza postacią" when on a slot). */
function slotOwnerMeta(
  readiness: SetReadiness,
  itemAssignedHere: boolean,
): string {
  if (itemAssignedHere) {
    if (readiness === 'planned') return readinessLabels.planned;
    if (readiness === 'conflict') return readinessLabels.conflict;
    if (readiness === 'stale') return readinessLabels.stale;
    if (readiness === 'missing') return readinessLabels.missing;
    return readinessLabels.ready; // Na postaci — derived from assignment
  }
  return readinessLabels[readiness];
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
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const slot = anchor.closest('.eq-inventory-slot, .eq-char-slot') as HTMLElement | null;
    if (!slot) return;

    let visible = false;

    const updatePosition = () => {
      const rect = slot.getBoundingClientRect();
      setCoords({
        left: rect.left + rect.width / 2,
        top: rect.top,
      });
    };

    const show = () => {
      visible = true;
      updatePosition();
      setOpen(true);
    };
    const hide = () => {
      visible = false;
      setOpen(false);
    };
    const onReposition = () => {
      if (visible) updatePosition();
    };

    slot.addEventListener('pointerenter', show);
    slot.addEventListener('pointerleave', hide);
    slot.addEventListener('focusin', show);
    slot.addEventListener('focusout', hide);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);

    return () => {
      slot.removeEventListener('pointerenter', show);
      slot.removeEventListener('pointerleave', hide);
      slot.removeEventListener('focusin', show);
      slot.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, []);

  const bonusLines = displayItemBonuses(item.name, item.enhancement, item.bonuses);

  const tooltip = (
    <span
      className="eq-item-tooltip eq-item-tooltip--fixed"
      role="tooltip"
      style={
        coords
          ? {
              left: coords.left,
              top: coords.top,
            }
          : undefined
      }
    >
      <strong>{item.name}</strong>
      <em>
        +{item.enhancement}
        {meta ? ` · ${meta}` : ''}
      </em>
      {bonusLines.length > 0 ? (
        <ul>
          {bonusLines.map((bonus) => (
            <li key={bonus}>{bonus}</li>
          ))}
        </ul>
      ) : (
        <span className="eq-item-tooltip-empty">Brak zapisanych bonusów</span>
      )}
    </span>
  );

  return (
    <>
      <span aria-hidden className="eq-item-tooltip-anchor" ref={anchorRef} />
      {open && coords && typeof document !== 'undefined'
        ? createPortal(tooltip, document.body)
        : null}
    </>
  );
}

function ItemNoteBadge({ item }: { readonly item: EquipmentItem }) {
  const count = item.notes?.length ?? 0;
  if (count < 1) return null;
  return (
    <span className="eq-note-badge" title="Jest notatka" aria-label="Jest notatka">
      !
    </span>
  );
}

function CharacterCard(props: {
  readonly entry: CharacterRecord;
  readonly workspace: WorkspaceRecord;
  readonly boardMode: BoardMode;
  readonly focusId: string;
  readonly activeSetId: string;
  readonly dropTargetId: string | null;
  readonly selectedItemId: string | null;
  readonly writesEnabled: boolean;
  readonly addTimerKind: ProgressionKind | 'custom';
  readonly customTimerLabel: string;
  readonly customTimerMinutes: string;
  readonly onFocus: (characterId: string, setId: string) => void;
  readonly onSelectItem: (itemId: string) => void;
  readonly onAssign: (target: CharacterRecord, itemId: string, slot?: EquipmentSlot) => void;
  readonly onDropTarget: (id: string | null) => void;
  readonly onCharacterDrop: (event: DragEvent<HTMLElement>, target: CharacterRecord) => void;
  readonly onRemove: (characterId: string, setId: string, slot: EquipmentSlot) => void;
  readonly onItemDragStart: (itemId: string) => void;
  readonly onItemDragEnd: () => void;
  readonly onCompleteTimer: (timerId: string, label: string, characterName: string) => void;
  readonly onRemoveTimer: (timerId: string, label: string, characterName: string) => void;
  readonly onAddTimer: (characterId: string) => void;
  readonly onAddTimerKind: (value: ProgressionKind | 'custom') => void;
  readonly onCustomTimerLabel: (value: string) => void;
  readonly onCustomTimerMinutes: (value: string) => void;
  readonly missingKinds: readonly ProgressionKind[];
  readonly onSelectSet: (characterId: string, setId: string) => void;
  readonly onCreateSet: (characterId: string, name: string) => string | null;
  readonly onRenameSet: (characterId: string, setId: string, name: string) => boolean;
}) {
  const {
    entry,
    workspace,
    boardMode,
    focusId,
    activeSetId,
    dropTargetId,
    selectedItemId,
    writesEnabled,
    addTimerKind,
    customTimerLabel,
  customTimerMinutes,
    onFocus,
    onSelectItem,
    onAssign,
    onDropTarget,
    onCharacterDrop,
    onRemove,
    onItemDragStart,
    onItemDragEnd,
    onCompleteTimer,
    onRemoveTimer,
    onAddTimer,
    onAddTimerKind,
    onCustomTimerLabel,
  onCustomTimerMinutes,
    missingKinds,
    onSelectSet,
    onCreateSet,
    onRenameSet,
  } = props;
  const set =
    (focusId === entry.id
      ? entry.sets.find((candidate) => candidate.id === activeSetId)
      : null) ??
    entry.sets.find((candidate) => candidate.id === entry.activeSetId) ??
    entry.sets[0] ??
    null;
  const [timerClock, setTimerClock] = useState(() => Date.now());
  const [addingSet, setAddingSet] = useState(false);
  const [renamingSet, setRenamingSet] = useState(false);
  const [setDraftName, setSetDraftName] = useState('');
  useEffect(() => {
    if (boardMode !== 'timers') return;
    const id = window.setInterval(() => setTimerClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [boardMode]);
  useEffect(() => {
    if (focusId !== entry.id) {
      setAddingSet(false);
      setRenamingSet(false);
      setSetDraftName('');
    }
  }, [focusId, entry.id]);

  const timers = sortProgressionTimers(
    workspace.timers.filter((timer) => timer.characterId === entry.id),
  );

  return (
    <article
      className={`eq-char-card${focusId === entry.id ? ' is-focus' : ''}${
        dropTargetId === entry.id ? ' is-drop-target' : ''
      }`}
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
          {boardMode !== 'eq' ? (
            <span className="eq-char-set">Set {set?.name ?? 'brak'}</span>
          ) : null}
          {focusId === entry.id ? <span className="eq-char-selected">Wybrana</span> : null}
        </div>
      </div>

      {boardMode === 'eq' ? (
        <div
          className="eq-char-set-controls"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span className="eq-char-set-label">Set</span>
          {writesEnabled && renamingSet && set ? (
            <form
              className="eq-char-set-form"
              onSubmit={(event) => {
                event.preventDefault();
                const ok = onRenameSet(entry.id, set.id, setDraftName);
                if (!ok) return;
                setRenamingSet(false);
                setSetDraftName('');
              }}
            >
              <input
                aria-label="Nowa nazwa setu"
                autoFocus
                maxLength={32}
                minLength={2}
                onChange={(event) => setSetDraftName(event.target.value)}
                placeholder="Nazwa setu"
                required
                value={setDraftName}
              />
              <button className="eq-char-set-save" type="submit">
                Zapisz
              </button>
              <button
                className="eq-char-set-cancel"
                onClick={() => {
                  setRenamingSet(false);
                  setSetDraftName('');
                }}
                type="button"
              >
                Anuluj
              </button>
            </form>
          ) : writesEnabled && addingSet ? (
            <form
              className="eq-char-set-form"
              onSubmit={(event) => {
                event.preventDefault();
                const createdId = onCreateSet(entry.id, setDraftName);
                if (!createdId) return;
                setAddingSet(false);
                setSetDraftName('');
              }}
            >
              <input
                aria-label="Nazwa nowego setu"
                autoFocus
                maxLength={32}
                minLength={2}
                onChange={(event) => setSetDraftName(event.target.value)}
                placeholder="np. Loch, Wojna…"
                required
                value={setDraftName}
              />
              <button className="eq-char-set-save" type="submit">
                Utwórz
              </button>
              <button
                className="eq-char-set-cancel"
                onClick={() => {
                  setAddingSet(false);
                  setSetDraftName('');
                }}
                type="button"
              >
                Anuluj
              </button>
            </form>
          ) : (
            <>
              <select
                id={`active-set-${entry.id}`}
                aria-label={`Aktywny set · ${entry.name}`}
                disabled={entry.sets.length === 0}
                onChange={(event) => {
                  const nextSetId = event.target.value;
                  setAddingSet(false);
                  setRenamingSet(false);
                  setSetDraftName('');
                  onSelectSet(entry.id, nextSetId);
                }}
                value={set?.id ?? ''}
              >
                {entry.sets.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              {writesEnabled ? (
                <>
                  {set ? (
                    <button
                      className="eq-char-set-edit"
                      onClick={() => {
                        onFocus(entry.id, set.id);
                        setAddingSet(false);
                        setRenamingSet(true);
                        setSetDraftName(set.name);
                      }}
                      title="Zmień nazwę setu"
                      type="button"
                    >
                      Zmień
                    </button>
                  ) : null}
                  <button
                    className="eq-char-set-add"
                    aria-label="Nowy set"
                    onClick={() => {
                      onFocus(entry.id, set?.id || entry.activeSetId || entry.sets[0]?.id || '');
                      setRenamingSet(false);
                      setAddingSet(true);
                      setSetDraftName('');
                    }}
                    title="Dodaj nowy set"
                    type="button"
                  >
                    <Icon name="plus" size={12} /> Nowy
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {boardMode === 'eq' && set ? (
        <div className="eq-char-slots">
          {equipmentSlots.map((slot) => {
            const itemId = set.assignments[slot];
            const item = workspace.items.find((candidate) => candidate.id === itemId);
            const readiness = getSlotReadiness(workspace, entry, set, slot);
            return (
              <button
                className={`eq-char-slot${item && item.category === slot ? ' has-item' : ''}${
                  selectedItemId && !item ? ' is-drop-hint' : ''
                }`}
                draggable={Boolean(writesEnabled && item && item.category === slot)}
                key={slot}
                onClick={(event) => {
                  event.stopPropagation();
                  // Mismatch leftover (e.g. weapon id wrongly on Zbroja): unequip via remove path.
                  if (item && item.category !== slot) {
                    onRemove(entry.id, set.id, slot);
                    return;
                  }
                  // Occupied matching slot → select that equipped item for Szczegóły.
                  if (item) {
                    onFocus(entry.id, set.id);
                    onSelectItem(item.id);
                    return;
                  }
                  // Empty slot + selection → move/assign only when categories match.
                  if (selectedItemId) {
                    onAssign(entry, selectedItemId, slot);
                  }
                }}
                onDragEnd={() => onItemDragEnd()}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={(event) => {
                  if (!item || item.category !== slot) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData('text/item-id', item.id);
                  event.dataTransfer.effectAllowed = 'move';
                  onSelectItem(item.id);
                  onItemDragStart(item.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const itemIdDrop = event.dataTransfer.getData('text/item-id') || selectedItemId;
                  if (itemIdDrop) onAssign(entry, itemIdDrop, slot);
                }}
                type="button"
              >
                {item && item.category === slot ? (
                  <>
                    <ItemIcon item={item} />
                    <ItemNoteBadge item={item} />
                    <small>{slotLabels[slot]}</small>
                    <ItemHoverTooltip
                      item={item}
                      meta={slotOwnerMeta(readiness, true)}
                    />
                  </>
                ) : (
                  <span className="eq-char-slot-label">{slotLabels[slot]}</span>
                )}
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
              <>
                <input
                  aria-label="Nazwa własnego timera"
                  onChange={(event) => onCustomTimerLabel(event.target.value)}
                  placeholder="np. Codzienne zadanie"
                  value={customTimerLabel}
                />
                <label className="eq-add-timer-interval">
                  <span>Co ile (min)</span>
                  <input
                    aria-label="Co ile minut"
                    inputMode="numeric"
                    min={1}
                    max={1440}
                    onChange={(event) => onCustomTimerMinutes(event.target.value)}
                    placeholder="60"
                    type="number"
                    value={customTimerMinutes}
                  />
                </label>
              </>
            ) : null}
            <button
              disabled={
                !writesEnabled ||
                (addTimerKind === 'custom' &&
                  (customTimerLabel.trim().length < 2 ||
                    !Number.isFinite(Number.parseInt(customTimerMinutes, 10)) ||
                    Number.parseInt(customTimerMinutes, 10) < 1))
              }
              onClick={() => onAddTimer(entry.id)}
              type="button"
            >
              Dodaj timer
            </button>
          </div>
        </div>
      ) : null}

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
    unequipItem,
    setActiveSet,
    createSet,
    renameSet,
    completeTimer,
    ensureProgressionTimers,
    addTimer,
    removeTimer,
    createItem,
    updateItemBonuses,
    addNote,
    removeNote,
    addItemNote,
    removeItemNote,
    writesEnabled,
  } = usePlayerStore();

  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const character = workspace?.characters.find((entry) => entry.id === params.characterId) ?? null;

  const [boardMode, setBoardMode] = useState<BoardMode>(requestedBoardMode);
  const [focusCharacterId, setFocusCharacterId] = useState<string>('');
  const [activeSetId, setActiveSetId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [inspectorEditMode, setInspectorEditMode] = useState(false);
  const [draftEnhancement, setDraftEnhancement] = useState(0);
  const [draftAdditional, setDraftAdditional] = useState<readonly string[]>([]);
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EquipmentSlot | 'all'>('all');
  const [announcement, setAnnouncement] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false);
  const [newItemSlot, setNewItemSlot] = useState<EquipmentSlot | null>(null);
  const [newItemEnhancement, setNewItemEnhancement] = useState(9);
  const [newItemSelectedBonuses, setNewItemSelectedBonuses] = useState<readonly string[]>([]);
  const [newItemAdditionalBonuses, setNewItemAdditionalBonuses] = useState<readonly string[]>([]);
  const [showAssigned, setShowAssigned] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [addTimerKind, setAddTimerKind] = useState<ProgressionKind | 'custom'>('custom');
  const [customTimerLabel, setCustomTimerLabel] = useState('');
  const [customTimerMinutes, setCustomTimerMinutes] = useState('60');
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [itemNoteDraft, setItemNoteDraft] = useState('');
  const [eqNoteDraft, setEqNoteDraft] = useState('');

  const INVENTORY_COLS = 8;
  const INVENTORY_MIN_ROWS = 8;

  useEffect(() => {
    setBoardMode(requestedBoardMode);
  }, [requestedBoardMode]);

  useEffect(() => {
    if (boardMode !== 'timers') return;
    setSelectedItemId(null);
    setInspectorEditMode(false);
  }, [boardMode]);

  // EQ_SPACE_GUARD: board/drag Space shortcuts must not fire while typing in search/forms
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (!isTextEntryTarget(event.target)) return;
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    setAnnouncement('');
    setInspectorEditMode(false);
    setItemNoteDraft('');
  }, [selectedItemId]);

  const clearSelection = () => {
    setSelectedItemId(null);
    setInspectorEditMode(false);
    setIsDraggingItem(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isTextEntryTarget(event.target)) return;
      if (inspectorEditMode) {
        setInspectorEditMode(false);
        event.preventDefault();
        return;
      }
      if (selectedItemId) {
        clearSelection();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [selectedItemId, inspectorEditMode]);

  const selectBoardMode = (mode: BoardMode) => {
    setBoardMode(mode);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (mode === 'timers') {
      url.searchParams.set('view', 'timers');
      setSelectedItemId(null);
      setInspectorEditMode(false);
    }
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

  const unequipToBag = (itemId: string) => {
    const item = workspace.items.find((entry) => entry.id === itemId);
    if (!item) return;
    if (!writesEnabled) {
      setAnnouncement('Brak uprawnień do zapisu — nie można zdjąć przedmiotu do torby.');
      return;
    }
    const loc = findItemEquipLocation(workspace, itemId);
    if (!loc) {
      setAnnouncement(`${item.name} jest już w torbie.`);
      return;
    }
    // Clear ALL set assignments for this itemId (ghost copies on other sets).
    unequipItem(workspace.id, itemId);
    setAnnouncement(`${item.name} → torba (zdjęto z ${loc.characterName} / ${slotLabels[loc.slot]}).`);
  };

  const onBagClickOrDrop = (itemId: string | null) => {
    if (!itemId) {
      clearSelection();
      return;
    }
    if (writesEnabled && findItemEquipLocation(workspace, itemId)) {
      unequipToBag(itemId);
      return;
    }
    clearSelection();
  };

  const applyDraftAverageSkill = (
    averageDamagePercent: number | null,
    skillDamagePercent: number | null,
  ) => {
    setDraftAdditional((current) => {
      const maxAdditional = maxAdditionalBonusesForItem(
        selectedItem
          ? formatEnhancedItemName(stripEnhancementFromName(selectedItem.name), draftEnhancement)
          : '',
        selectedItem?.category ?? 'weapon',
      );
      const prev = readAverageSkillDamage(current);
      const hadAvg = prev.averageDamagePercent !== null && prev.averageDamagePercent !== 0;
      const hadSkill = prev.skillDamagePercent !== null && prev.skillDamagePercent !== 0;
      const nextAvg =
        averageDamagePercent !== null && averageDamagePercent !== 0 ? averageDamagePercent : null;
      const nextSkill =
        skillDamagePercent !== null && skillDamagePercent !== 0 ? skillDamagePercent : null;
      const addingAvg = nextAvg !== null && !hadAvg;
      const addingSkill = nextSkill !== null && !hadSkill;
      const baseLen =
        current.length - (hadAvg ? 1 : 0) - (hadSkill ? 1 : 0);
      if (baseLen + (nextAvg !== null ? 1 : 0) + (nextSkill !== null ? 1 : 0) > maxAdditional) {
        setAnnouncement('Limit 5 bonusów dodatkowych — usuń inną linię albo wyczyść SR/UM.');
        return current;
      }
      void addingAvg;
      void addingSkill;
      return [
        ...withAverageSkillDamage(current, {
          averageDamagePercent: nextAvg,
          skillDamagePercent: nextSkill,
        }),
      ];
    });
  };

  const onPoolDragStart = (event: DragEvent<HTMLButtonElement>, itemId: string) => {
    event.dataTransfer.setData('text/item-id', itemId);
    event.dataTransfer.effectAllowed = 'move';
    setSelectedItemId(itemId);
    setIsDraggingItem(true);
  };

  const onPoolDragEnd = () => {
    setIsDraggingItem(false);
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
    const maxAdditional = maxAdditionalBonusesForItem(cardName, catalogSlot);
    const additional = newItemAdditionalBonuses.slice(0, maxAdditional);
    // Keep user-toggled catalog builtins + additional 1–5 (SR/UM count toward 5).
    const builtinSelected = newItemSelectedBonuses.filter(
      (line) => !additional.includes(line),
    );
    const bonuses = [...builtinSelected, ...additional];
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
    setNewItemAdditionalBonuses([]);
    setCreateError(null);
    setCreateOpen(false);
    setSelectedItemId(createdId);
    setInspectorEditMode(false);
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
          customTimerMinutes={customTimerMinutes}
      dropTargetId={dropTargetId}
      entry={entry}
      focusId={focusCharacter.id}
      activeSetId={activeSetId}
      key={entry.id}
      missingKinds={missingKindsFor(entry)}
      selectedItemId={selectedItemId}
      workspace={workspace}
      writesEnabled={writesEnabled}
      onAddTimer={(characterId) => {
        if (addTimerKind === 'custom') {
          const minutes = Number.parseInt(customTimerMinutes, 10);
          addTimer(workspace.id, characterId, {
            label: customTimerLabel,
            durationMinutes: Number.isFinite(minutes) ? minutes : 60,
          });
          setCustomTimerLabel('');
          setCustomTimerMinutes('60');
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
          onCustomTimerMinutes={setCustomTimerMinutes}
      onDropTarget={setDropTargetId}
      onFocus={(characterId, setId) => {
        setFocusCharacterId(characterId);
        setActiveSetId(setId);
      }}
      onSelectSet={(characterId, setId) => {
        setFocusCharacterId(characterId);
        setActiveSetId(setId);
        setSelectedItemId(null);
        const target = livingCharacters.find((entry) => entry.id === characterId);
        const setName = target?.sets.find((set) => set.id === setId)?.name ?? setId;
        if (writesEnabled) {
          setActiveSet(workspace.id, characterId, setId);
          setAnnouncement(`Aktywny set: ${setName}`);
        }
      }}
      onCreateSet={(characterId, name) => {
        const createdId = createSet(workspace.id, characterId, {
          name,
          makeActive: true,
        });
        if (!createdId) {
          setAnnouncement('Nazwa setu musi mieć min. 2 znaki.');
          return null;
        }
        setFocusCharacterId(characterId);
        setActiveSetId(createdId);
        setSelectedItemId(null);
        setAnnouncement(`Dodano set „${name.trim()}”.`);
        return createdId;
      }}
      onRenameSet={(characterId, setId, name) => {
        const ok = renameSet(workspace.id, characterId, setId, name);
        if (!ok) {
          setAnnouncement('Nazwa setu musi mieć min. 2 znaki.');
          return false;
        }
        setAnnouncement(`Zmieniono nazwę setu na „${name.trim()}”.`);
        return true;
      }}
      onRemove={(characterId, setId, slot) => {
        removeItem(workspace.id, characterId, setId, slot);
        setAnnouncement(`Usunięto z planu setu (${slotLabels[slot]}).`);
      }}
      onItemDragStart={(itemId) => {
        setSelectedItemId(itemId);
        setIsDraggingItem(true);
      }}
      onItemDragEnd={() => setIsDraggingItem(false)}
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
              (mobile: wybierz kartę, potem postać / slot). Zakładka Timer: cykle na kartach
              postaci.
            </p>
          </div>
          <div className="equipment-header-actions">
            <a href={`/teams/${workspace.id}/characters/${character.id}/edit`}>
              <Icon name="settings" size={14} /> Edytuj {character.name}
            </a>
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
            Ekwipunek
          </button>
          <button
            aria-selected={boardMode === 'timers'}
            className={boardMode === 'timers' ? 'is-active' : ''}
            onClick={() => selectBoardMode('timers')}
            role="tab"
            type="button"
          >
            Timer
          </button>
          {isDraggingItem ? (
            <span className="empty-copy eq-assign-hint">
              Upuść na postać / slot żeby założyć, albo na torbę żeby zdjąć.
            </span>
          ) : null}
        </div>

        {boardMode === 'eq' ? (
          <section className="panel eq-board-notes" aria-label="Notatki EQ">
            <header className="eq-board-notes-header">
              <div>
                <h2>Notatki EQ</h2>
                <p>Wspólne notatki zespołu przy ekwipunku (np. „pożyczyłem Trutę”).</p>
              </div>
            </header>
            <form
              className="team-note-form eq-board-notes-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!writesEnabled || !eqNoteDraft.trim()) return;
                addNote(workspace.id, eqNoteDraft, null, 'equipment');
                setEqNoteDraft('');
                setAnnouncement('Zapisano notatkę EQ.');
              }}
            >
              <label>
                Nowa notatka EQ
                <textarea
                  maxLength={280}
                  onChange={(event) => setEqNoteDraft(event.target.value)}
                  placeholder="np. pożyczyłem Trutę, nie ruszaj setu xDA…"
                  rows={2}
                  value={eqNoteDraft}
                />
              </label>
              <div>
                <small>{eqNoteDraft.trim().length}/280</small>
                <button disabled={!writesEnabled || eqNoteDraft.trim().length === 0} type="submit">
                  Dodaj notatkę
                </button>
              </div>
            </form>
            {workspace.notes.filter((note) => note.scope === 'equipment').length === 0 ? (
              <p className="empty-copy">Brak notatek EQ — zostaw krótką informację dla zespołu.</p>
            ) : (
              <ul className="team-note-list">
                {workspace.notes
                  .filter((note) => note.scope === 'equipment')
                  .map((note) => (
                    <li className="team-note" key={note.id}>
                      <div className="team-note-meta">
                        <strong>{note.authorName}</strong>
                        <span aria-hidden="true"> · </span>
                        <time>{note.createdAtLabel}</time>
                        {writesEnabled ? (
                          <button
                            className="eq-note-remove"
                            onClick={() => {
                              removeNote(workspace.id, note.id);
                              setAnnouncement('Usunięto notatkę EQ.');
                            }}
                            type="button"
                          >
                            Usuń
                          </button>
                        ) : null}
                      </div>
                      <p>{note.body}</p>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ) : null}

        <div className={`eq-camp-layout${boardMode === 'timers' ? ' is-timers' : ''}`}>
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
                        <h2>Ekwipunek</h2>
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
                                  setNewItemAdditionalBonuses([]);
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
                              // Keep spaces while typing; only strip trailing +N
                              const withoutPlus = value.replace(/\s*\+\d+\s*$/u, '');
                              setNewItemName(withoutPlus);
                              setCatalogMenuOpen(true);
                              const fromName = parseEnhancementFromName(value);
                              if (/\+\d+\s*$/u.test(value.trim())) {
                                setNewItemEnhancement(fromName);
                              }
                              const hit = findGameItemByCardName(withoutPlus);
                              setNewItemSlot(
                                hit ? equipmentSlotForCategory(hit.category) : null,
                              );
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
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
                              Wbudowane: {newItemSelectedBonuses.join(' · ')}
                            </p>
                          ) : null}
                        </div>

                        {newItemSlot ? (
                          <div className="eq-create-bonus-section" aria-label="Bonusy dodatkowe">
                            <span className="section-kicker">
                              Bonusy dodatkowe ({newItemAdditionalBonuses.length}/
                              {maxAdditionalBonusesForItem(
                                formatEnhancedItemName(
                                  stripEnhancementFromName(newItemName) || newItemName,
                                  newItemEnhancement,
                                ),
                                newItemSlot,
                              )}
                              )
                            </span>
                            <p className="eq-catalog-hint">
                              Do 5 linii Zaczarowania. Na broniach 30/75 Średnie Obrażenia i
                              Obrażenia Umiejętności też zajmują te sloty.
                            </p>
                            <div className="eq-bonus-catalog-list">
                              {additionalBonusOptionsForItem(
                                formatEnhancedItemName(
                                  stripEnhancementFromName(newItemName) || newItemName,
                                  newItemEnhancement,
                                ),
                                newItemSlot,
                              ).map((line) => {
                                const already = newItemAdditionalBonuses.includes(line);
                                const maxAdd = maxAdditionalBonusesForItem(
                                  formatEnhancedItemName(
                                    stripEnhancementFromName(newItemName) || newItemName,
                                    newItemEnhancement,
                                  ),
                                  newItemSlot,
                                );
                                const blocked = already || newItemAdditionalBonuses.length >= maxAdd;
                                return (
                                  <button
                                    className={`eq-bonus-catalog-entry${already ? ' is-added' : ''}`}
                                    disabled={blocked && !already}
                                    key={`create-add-${line}`}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setNewItemAdditionalBonuses((current) => {
                                        if (current.includes(line)) {
                                          return current.filter((entry) => entry !== line);
                                        }
                                        if (current.length >= maxAdd) return current;
                                        return [...current, line];
                                      });
                                    }}
                                    type="button"
                                  >
                                    <span>{line}</span>
                                    {already ? (
                                      <span className="eq-bonus-check">✓</span>
                                    ) : (
                                      <span className="eq-bonus-plus">+</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {newItemAdditionalBonuses.length > 0 ? (
                              <p className="eq-create-bonus-selected">
                                Dodatkowe: {newItemAdditionalBonuses.join(' · ')}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </form>
                    ) : null}

                    <label className="market-search eq-pool-search">
                      <Icon name="search" size={16} />
                      <input
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Szukaj w ekwipunku…"
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
                    <div
                      className={`eq-inventory-grid${isDraggingItem ? ' is-drop-target' : ''}`}
                      aria-label="Ekwipunek — torba"
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const dropped =
                          event.dataTransfer.getData('text/item-id') || selectedItemId;
                        onBagClickOrDrop(dropped || null);
                      }}
                    >
                      {poolItems.map((item) => {
                        const owner = ownership.get(item.id);
                        return (
                          <button
                            aria-label={item.name}
                            aria-pressed={item.id === selectedItemId}
                            className={`eq-inventory-slot${owner ? ' is-assigned' : ''}${item.id === selectedItemId ? ' is-selected' : ''}${item.enhancement >= 7 ? ` glow-plus-${Math.min(9, item.enhancement)}` : ''}`}
                            draggable
                            key={item.id}
                            onClick={() =>
                              setSelectedItemId((current) => (current === item.id ? null : item.id))
                            }
                            onDragEnd={onPoolDragEnd}
                            onDragStart={(event) => onPoolDragStart(event, item.id)}
                            type="button"
                          >
                            <ItemIcon item={item} />
                            <ItemNoteBadge item={item} />
                            <em>+{item.enhancement}</em>
                            <ItemHoverTooltip
                              item={item}
                              meta={owner ? `na ${owner}` : 'w torbie'}
                            />
                          </button>
                        );
                      })}
                      {poolItems.length === 0 ? (
                        <div
                          className="eq-inventory-bag-empty"
                          onClick={() => onBagClickOrDrop(selectedItemId)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onBagClickOrDrop(selectedItemId);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <span>Torba pusta</span>
                          <small>
                            {selectedItemId && ownership.get(selectedItemId)
                              ? 'Kliknij, żeby zdjąć wybrany przedmiot do torby'
                              : 'Kliknij "Dodaj przedmiot" powyżej'}
                          </small>
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
                        <button
                          aria-label={
                            selectedItemId && ownership.get(selectedItemId)
                              ? 'Zdejmij do torby'
                              : 'Anuluj wybór'
                          }
                          className="eq-inventory-slot is-empty"
                          key={`empty-${index}`}
                          onClick={() => onBagClickOrDrop(selectedItemId)}
                          type="button"
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
            <div className="eq-mobile-assign" role="region" aria-label="Wybrana karta">
              <ItemIcon item={selectedItem} />
              <div>
                <strong>{selectedItem.name}</strong>
                <span>Szczegóły · kliknij pusty slot albo torbę</span>
              </div>
              <div className="eq-mobile-assign-targets">
                {livingCharacters.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => assignToCharacter(entry, selectedItem.id)}
                    type="button"
                  >
                    Załóż → {entry.name}
                  </button>
                ))}
                {writesEnabled && ownership.get(selectedItem.id) ? (
                  <button onClick={() => unequipToBag(selectedItem.id)} type="button">
                    → Torba
                  </button>
                ) : null}
              </div>
              <button onClick={() => clearSelection()} type="button">
                Anuluj wybór
              </button>
            </div>
          ) : null}

          {boardMode === 'eq' ? (
          <aside className="eq-camp-side">
            <section className="panel inspector-panel">
              <header>
                <h2>Szczegóły</h2>
              </header>
              {selectedItem ? (
                <div className="eq-inspector-item" key={selectedItem.id}>
                  <div className="eq-inspector-thumb" aria-hidden>
                    <img alt="" src={selectedItem.iconPath} />
                  </div>
                  <h3>{selectedItem.name}</h3>
                  <p>
                    Ulepszenie +{selectedItem.enhancement} · {selectedItem.levelLabel}
                  </p>
                  <p className="eq-inspector-meta">
                    {ownership.get(selectedItem.id)
                      ? `Na postaci: ${ownership.get(selectedItem.id)}`
                      : 'Lokalizacja: torba zespołu'}
                    {' · '}
                    Slot: {slotLabels[selectedItem.category]}
                  </p>

                  {(() => {
                    const viewEnhancement = inspectorEditMode
                      ? draftEnhancement
                      : selectedItem.enhancement;
                    const viewName = inspectorEditMode
                      ? formatEnhancedItemName(
                          stripEnhancementFromName(selectedItem.name),
                          viewEnhancement,
                        )
                      : selectedItem.name;
                    const { builtin, additional } = splitItemBonuses(
                      viewName,
                      viewEnhancement,
                      inspectorEditMode
                        ? mergeItemBonusStorage(
                            viewName,
                            viewEnhancement,
                            draftAdditional,
                            selectedItem.category,
                          )
                        : selectedItem.bonuses,
                    );
                    const mixOptions = additionalBonusOptionsForItem(
                      viewName,
                      selectedItem.category,
                    );
                    const maxAdditional = maxAdditionalBonusesForItem(
                      viewName,
                      selectedItem.category,
                    );
                    const editingAdditional = inspectorEditMode ? draftAdditional : additional;
                    const canAddMore = editingAdditional.length < maxAdditional;

                    if (!inspectorEditMode) {
                      return (
                        <>
                          <div className="eq-inspector-actions">
                            {writesEnabled ? (
                              <button
                                className="primary-button"
                                onClick={() => {
                                  setDraftEnhancement(selectedItem.enhancement);
                                  setDraftAdditional(additional);
                                  setInspectorEditMode(true);
                                }}
                                type="button"
                              >
                                Edytuj
                              </button>
                            ) : null}
                            {writesEnabled && ownership.get(selectedItem.id) ? (
                              <button
                                onClick={() => unequipToBag(selectedItem.id)}
                                type="button"
                              >
                                Zdejmij do torby
                              </button>
                            ) : null}
                            <button onClick={() => clearSelection()} type="button">
                              Anuluj wybór
                            </button>
                          </div>
                          {writesEnabled && livingCharacters.length > 0 ? (
                            <>
                              <span className="section-kicker">Przenieś / Załóż</span>
                              <div className="eq-mobile-assign-targets">
                                {livingCharacters.map((entry) => (
                                  <button
                                    key={`view-move-${entry.id}`}
                                    onClick={() => assignToCharacter(entry, selectedItem.id)}
                                    type="button"
                                  >
                                    {entry.name}
                                  </button>
                                ))}
                                {ownership.get(selectedItem.id) ? (
                                  <button
                                    onClick={() => unequipToBag(selectedItem.id)}
                                    type="button"
                                  >
                                    → Torba
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : null}

                          <span className="section-kicker">
                            Bonusy wbudowane (+{selectedItem.enhancement})
                          </span>
                          <ul className="eq-bonus-lines">
                            {builtin.length > 0 ? (
                              builtin.map((bonus) => (
                                <li className="eq-bonus-builtin" key={`builtin-${bonus}`}>
                                  <span>{bonus}</span>
                                  <em className="eq-bonus-locked" title="Z katalogu ulepszeń">
                                    katalog
                                  </em>
                                </li>
                              ))
                            ) : (
                              <li className="eq-bonus-empty">
                                <span>
                                  Brak kompletnej drabinki ulepszeń w katalogu dla tej karty.
                                </span>
                              </li>
                            )}
                          </ul>

                          <span className="section-kicker">
                            Bonusy dodatkowe ({additional.length}/{maxAdditional})
                          </span>
                          <ul className="eq-bonus-lines">
                            {additional.map((bonus) => (
                              <li key={`add-ro-${bonus}`}>
                                <span>{bonus}</span>
                              </li>
                            ))}
                            {additional.length === 0 ? (
                              <li className="eq-bonus-empty">
                                <span>Brak dodatkowych — użyj Edytuj, żeby dodać (max 5)</span>
                              </li>
                            ) : null}
                          </ul>

                          {selectedItem.category === 'weapon' &&
                          weaponHasPhPvmAttackBonuses(selectedItem.name) ? (
                            <p className="eq-catalog-hint">
                              PvM Attack Value / Magic Attack Value PvM — wartości serwerowe PH
                              (wiki/SHIFT), nie edytowane tu.
                            </p>
                          ) : null}
                        </>
                      );
                    }

                    return (
                      <div className="eq-bonus-editor">
                        <div className="eq-inspector-actions">
                          <button
                            className="primary-button"
                            disabled={!writesEnabled}
                            onClick={() => {
                              // Pass additional-only; store merges builtins so they cannot wipe extras.
                              updateItemBonuses(
                                workspace.id,
                                selectedItem.id,
                                draftAdditional,
                                { enhancement: draftEnhancement },
                              );
                              setAnnouncement(
                                `Zapisano: ${formatEnhancedItemName(
                                  stripEnhancementFromName(selectedItem.name),
                                  draftEnhancement,
                                )} (${draftAdditional.length} dodatkowych).`,
                              );
                              setInspectorEditMode(false);
                            }}
                            type="button"
                          >
                            Zapisz
                          </button>
                          <button
                            onClick={() => setInspectorEditMode(false)}
                            type="button"
                          >
                            Anuluj
                          </button>
                        </div>

                        <label className="eq-weapon-stat-field">
                          <span>Ulepszenie</span>
                          <select
                            disabled={!writesEnabled}
                            onChange={(event) => setDraftEnhancement(Number(event.target.value))}
                            value={draftEnhancement}
                          >
                            {ENHANCEMENT_LEVELS.map((level) => (
                              <option key={level} value={level}>
                                +{level}
                              </option>
                            ))}
                          </select>
                        </label>

                        <span className="section-kicker">
                          Bonusy wbudowane (+{draftEnhancement}) — z katalogu
                        </span>
                        <ul className="eq-bonus-lines">
                          {builtin.length > 0 ? (
                            builtin.map((bonus) => (
                              <li className="eq-bonus-builtin" key={`edit-builtin-${bonus}`}>
                                <span>{bonus}</span>
                                <em className="eq-bonus-locked">katalog</em>
                              </li>
                            ))
                          ) : (
                            <li className="eq-bonus-empty">
                              <span>Brak drabinki wbudowanych dla tego +N.</span>
                            </li>
                          )}
                        </ul>

                        <span className="section-kicker">
                          Bonusy dodatkowe ({draftAdditional.length}/{maxAdditional})
                        </span>
                        {selectedItem.category === 'weapon' &&
                        weaponHasAverageSkillDamage(viewName) ? (
                          <div className="eq-sr-um-editor" aria-label="SR i UM — wartość własna">
                            <p className="eq-catalog-hint">
                              Średnie Obrażenia i Obrażenia Umiejętności zajmują sloty 1–5.
                              Wpisz dowolny % z zakresu; przyciski z puli to skróty.
                            </p>
                            {(() => {
                              const { averageDamagePercent, skillDamagePercent } =
                                readAverageSkillDamage(draftAdditional);
                              return (
                                <div className="eq-sr-um-fields">
                                  <label className="eq-weapon-stat-field">
                                    <span>
                                      Średnie Obrażenia % ({AVERAGE_DAMAGE_MIN}…{AVERAGE_DAMAGE_MAX})
                                    </span>
                                    <input
                                      disabled={!writesEnabled}
                                      inputMode="numeric"
                                      max={AVERAGE_DAMAGE_MAX}
                                      min={AVERAGE_DAMAGE_MIN}
                                      onChange={(event) => {
                                        const raw = event.target.value.trim();
                                        if (raw === '' || raw === '-') {
                                          applyDraftAverageSkill(null, skillDamagePercent);
                                          return;
                                        }
                                        const num = Number.parseInt(raw, 10);
                                        if (!Number.isFinite(num)) return;
                                        const clamped = Math.min(
                                          AVERAGE_DAMAGE_MAX,
                                          Math.max(AVERAGE_DAMAGE_MIN, num),
                                        );
                                        applyDraftAverageSkill(clamped, skillDamagePercent);
                                      }}
                                      placeholder="np. 27"
                                      type="number"
                                      value={averageDamagePercent ?? ''}
                                    />
                                  </label>
                                  <label className="eq-weapon-stat-field">
                                    <span>
                                      Obrażenia Umiejętności % ({SKILL_DAMAGE_MIN}…{SKILL_DAMAGE_MAX})
                                    </span>
                                    <input
                                      disabled={!writesEnabled}
                                      inputMode="numeric"
                                      max={SKILL_DAMAGE_MAX}
                                      min={SKILL_DAMAGE_MIN}
                                      onChange={(event) => {
                                        const raw = event.target.value.trim();
                                        if (raw === '' || raw === '-') {
                                          applyDraftAverageSkill(averageDamagePercent, null);
                                          return;
                                        }
                                        const num = Number.parseInt(raw, 10);
                                        if (!Number.isFinite(num)) return;
                                        const clamped = Math.min(
                                          SKILL_DAMAGE_MAX,
                                          Math.max(SKILL_DAMAGE_MIN, num),
                                        );
                                        applyDraftAverageSkill(averageDamagePercent, clamped);
                                      }}
                                      placeholder="np. 12"
                                      type="number"
                                      value={skillDamagePercent ?? ''}
                                    />
                                  </label>
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}
                        <ul className="eq-bonus-lines">
                          {draftAdditional.map((bonus) => (
                            <li key={`edit-add-${bonus}`}>
                              <span>{bonus}</span>
                              <button
                                disabled={!writesEnabled}
                                onClick={() =>
                                  setDraftAdditional((current) =>
                                    current.filter((line) => line !== bonus),
                                  )
                                }
                                type="button"
                              >
                                Usuń
                              </button>
                            </li>
                          ))}
                          {draftAdditional.length === 0 ? (
                            <li className="eq-bonus-empty">
                              <span>Wybierz z puli poniżej</span>
                            </li>
                          ) : null}
                        </ul>

                        <span className="eq-bonus-source-label">
                          Pula Zaczarowania
                          {!canAddMore ? ' · limit 5' : ''}:
                        </span>
                        <div className="eq-bonus-catalog-list">
                          {mixOptions.map((line) => {
                            const avgSkill = readAverageSkillDamage([line]);
                            const isAvgShortcut = avgSkill.averageDamagePercent !== null;
                            const isSkillShortcut = avgSkill.skillDamagePercent !== null;
                            const currentAvgSkill = readAverageSkillDamage(draftAdditional);
                            const alreadyAdded = isAvgShortcut
                              ? currentAvgSkill.averageDamagePercent ===
                                avgSkill.averageDamagePercent
                              : isSkillShortcut
                                ? currentAvgSkill.skillDamagePercent ===
                                  avgSkill.skillDamagePercent
                                : draftAdditional.includes(line);
                            const replacingAvg =
                              isAvgShortcut && currentAvgSkill.averageDamagePercent !== null;
                            const replacingSkill =
                              isSkillShortcut && currentAvgSkill.skillDamagePercent !== null;
                            const wouldNeedSlot =
                              (isAvgShortcut && !replacingAvg) ||
                              (isSkillShortcut && !replacingSkill) ||
                              (!isAvgShortcut && !isSkillShortcut);
                            const blocked =
                              !writesEnabled ||
                              alreadyAdded ||
                              (wouldNeedSlot && !canAddMore && !replacingAvg && !replacingSkill);
                            return (
                              <button
                                className={`eq-bonus-catalog-entry${alreadyAdded ? ' is-added' : ''}`}
                                disabled={blocked}
                                key={`edit-opt-${line}`}
                                onClick={() => {
                                  if (alreadyAdded) return;
                                  if (isAvgShortcut) {
                                    applyDraftAverageSkill(
                                      avgSkill.averageDamagePercent,
                                      currentAvgSkill.skillDamagePercent,
                                    );
                                    return;
                                  }
                                  if (isSkillShortcut) {
                                    applyDraftAverageSkill(
                                      currentAvgSkill.averageDamagePercent,
                                      avgSkill.skillDamagePercent,
                                    );
                                    return;
                                  }
                                  if (!canAddMore) return;
                                  setDraftAdditional((current) => [...current, line]);
                                }}
                                type="button"
                              >
                                <span>{line}</span>
                                {alreadyAdded ? (
                                  <span className="eq-bonus-check">✓</span>
                                ) : (
                                  <span className="eq-bonus-plus">+</span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {livingCharacters.length > 0 ? (
                          <>
                            <span className="section-kicker">Przenieś / Załóż</span>
                            <div className="eq-mobile-assign-targets">
                              {livingCharacters.map((entry) => (
                                <button
                                  key={`move-${entry.id}`}
                                  onClick={() => assignToCharacter(entry, selectedItem.id)}
                                  type="button"
                                >
                                  {entry.name}
                                </button>
                              ))}
                              {ownership.get(selectedItem.id) ? (
                                <button
                                  onClick={() => unequipToBag(selectedItem.id)}
                                  type="button"
                                >
                                  → Torba
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })()}

                  <div className="eq-item-notes">
                    <span className="section-kicker">Notatki przy karcie</span>
                    {(selectedItem.notes?.length ?? 0) === 0 ? (
                      <p className="empty-copy">Brak notatek przy tej karcie.</p>
                    ) : (
                      <ul className="team-note-list">
                        {(selectedItem.notes ?? []).map((note) => (
                          <li className="team-note" key={note.id}>
                            <div className="team-note-meta">
                              <strong>{note.authorName}</strong>
                              <span aria-hidden="true"> · </span>
                              <time>{note.createdAt}</time>
                              {writesEnabled ? (
                                <button
                                  className="eq-note-remove"
                                  onClick={() => {
                                    removeItemNote(workspace.id, selectedItem.id, note.id);
                                    setAnnouncement('Usunięto notatkę przy karcie.');
                                  }}
                                  type="button"
                                >
                                  Usuń
                                </button>
                              ) : null}
                            </div>
                            <p>{note.body}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    {writesEnabled ? (
                      <form
                        className="team-note-form eq-item-note-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!itemNoteDraft.trim()) return;
                          addItemNote(workspace.id, selectedItem.id, itemNoteDraft);
                          setItemNoteDraft('');
                          setAnnouncement('Dodano notatkę przy karcie.');
                        }}
                      >
                        <label>
                          Dodaj notatkę
                          <textarea
                            maxLength={280}
                            onChange={(event) => setItemNoteDraft(event.target.value)}
                            placeholder="Krótka informacja dla zespołu o tej karcie…"
                            rows={2}
                            value={itemNoteDraft}
                          />
                        </label>
                        <div>
                          <small>{itemNoteDraft.trim().length}/280</small>
                          <button
                            disabled={itemNoteDraft.trim().length === 0}
                            type="submit"
                          >
                            Dodaj notatkę
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>

                  {writesEnabled && findItemEquipLocation(workspace, selectedItem.id) ? (
                    <button
                      onClick={() => unequipToBag(selectedItem.id)}
                      type="button"
                    >
                      Zdejmij do torby
                    </button>
                  ) : null}
                </div>
              ) : (
                <p>Wybierz kartę z ekwipunku albo slotu postaci.</p>
              )}
            </section>
          </aside>
          ) : null}
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {announcement ? <p className="entry-status">{announcement}</p> : null}
        <div className="mock-notice">
          Pula EQ jest wspólna dla przestrzeni. Drag na postać = plan setu. Timer przy ognisku ≠
          Timery metinów na /timers. Dane tylko w tej przeglądarce.
        </div>
      </main>
    </AppShell>
  );
}
