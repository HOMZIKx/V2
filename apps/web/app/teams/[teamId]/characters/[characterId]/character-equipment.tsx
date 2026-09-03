'use client';

import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useParams } from 'next/navigation';

import { characterClassLabels } from '../../../../../src/character-profile';
import {
  equipmentSlots,
  getSlotReadiness,
  slotLabels,
  type EquipmentSlot,
  type SetReadiness,
} from '../../../../../src/player-store';
import { usePlayerStore } from '../../../../../src/player-store-react';
import {
  equipmentCatalogItems,
  equipmentSlotForCategory,
  findGameItemByCardName,
} from '../../../../../src/item-catalog';
import { AppShell, Icon } from '../../../../app-shell';
import { DiscordEntryScreen } from '../../../../discord-entry';

const readinessLabels: Record<SetReadiness, string> = {
  ready: 'Na postaci',
  available_elsewhere: 'Poza postacią',
  missing: 'Brak',
  stale: 'Nieaktualne',
  conflict: 'Konflikt',
  planned: 'Plan',
};

export function CharacterEquipment() {
  const params = useParams<{ teamId: string; characterId: string }>();
  const {
    state,
    hydrated,
    openWorkspace,
    assignItem,
    removeItem,
    confirmLocation,
    completeTimer,
    createItem,
    writesEnabled,
  } = usePlayerStore();

  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const character =
    workspace?.characters.find((entry) => entry.id === params.characterId) ?? null;

  const [activeSetId, setActiveSetId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EquipmentSlot | 'all'>('all');
  const [flipped, setFlipped] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemSlot, setNewItemSlot] = useState<EquipmentSlot>('weapon');
  const [moveTarget, setMoveTarget] = useState('');

  useEffect(() => {
    if (!workspace || !character) return;
    openWorkspace(workspace.id, character.id);
    setActiveSetId(character.activeSetId || character.sets[0]?.id || '');
  }, [workspace, character, openWorkspace]);

  const filteredCatalog = useMemo(() => {
    if (!workspace) return [];
    const normalized = query.trim().toLocaleLowerCase('pl');
    return workspace.items.filter((item) => {
      if (item.archived) return false;
      const categoryMatches = category === 'all' || item.category === category;
      const queryMatches =
        normalized.length === 0 ||
        item.name.toLocaleLowerCase('pl').includes(normalized) ||
        item.bonuses.some((bonus) => bonus.toLocaleLowerCase('pl').includes(normalized));
      return categoryMatches && queryMatches;
    });
  }, [workspace, query, category]);

  const catalogSuggestions = useMemo(() => {
    const normalized = newItemName.trim().toLocaleLowerCase('pl');
    if (normalized.length < 2) return [];
    return equipmentCatalogItems()
      .filter((item) => {
        const slot = equipmentSlotForCategory(item.category);
        if (!slot || slot !== newItemSlot) return false;
        return item.title.toLocaleLowerCase('pl').includes(normalized);
      })
      .slice(0, 6);
  }, [newItemName, newItemSlot]);

  const matchedDefinition = findGameItemByCardName(newItemName);

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

  const activeSet =
    character.sets.find((set) => set.id === activeSetId) ?? character.sets[0] ?? null;
  const selectedItem = workspace.items.find((item) => item.id === selectedItemId) ?? null;
  const timers = workspace.timers.filter((timer) => timer.characterId === character.id);
  const completion = activeSet
    ? equipmentSlots.filter((slot) => activeSet.assignments[slot] !== null).length
    : 0;

  const onAssign = (itemId: string, slot: EquipmentSlot) => {
    if (!writesEnabled || !activeSet) return;
    const item = workspace.items.find((entry) => entry.id === itemId);
    if (!item || item.category !== slot) {
      setAnnouncement('Przedmiot nie pasuje do slotu.');
      return;
    }
    assignItem(workspace.id, character.id, activeSet.id, itemId, slot);
    setSelectedItemId(itemId);
    setAnnouncement(`${item.name} dodano do planu setu ${activeSet.name}.`);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>, slot: EquipmentSlot) => {
    event.preventDefault();
    onAssign(event.dataTransfer.getData('text/item-id'), slot);
  };

  const handleCreateItem = (event: FormEvent) => {
    event.preventDefault();
    if (!writesEnabled || newItemName.trim().length < 2) return;
    createItem(workspace.id, {
      name: newItemName,
      category: newItemSlot,
      bonuses: [],
      planned: true,
    });
    setNewItemName('');
    setAnnouncement('Utworzono kartę przedmiotu w bazie zespołu.');
  };

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="equipment-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${workspace.id}`}>{workspace.name}</a>
          <Icon name="chevron" size={13} />
          <strong>{character.name}</strong>
        </nav>

        <header className="equipment-page-header">
          <div>
            <span className="eyebrow">Karta postaci</span>
            <h1>{character.name}</h1>
            <p>
              {characterClassLabels[character.characterClass]}
              {character.level ? ` · poziom ${character.level}` : ' · poziom nieustalony'} · prowadzi{' '}
              <strong>
                {workspace.members.find((member) => member.id === character.responsibleMemberId)
                  ?.displayName ?? '—'}
              </strong>
            </p>
          </div>
          <div className="equipment-header-actions">
            <a href={`/teams/${workspace.id}/characters/${character.id}/edit`}>
              <Icon name="settings" size={14} /> Edytuj postać
            </a>
            {activeSet ? (
              <div className="set-switcher">
                <label htmlFor="active-set">Aktywny widok setu</label>
                <select
                  id="active-set"
                  onChange={(event) => {
                    setActiveSetId(event.target.value);
                    setSelectedItemId(null);
                  }}
                  value={activeSet.id}
                >
                  {character.sets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name}
                    </option>
                  ))}
                </select>
                <span>{activeSet.description}</span>
              </div>
            ) : null}
          </div>
        </header>

        <div className="equipment-layout">
          <section className="character-card-panel" aria-label="Karta postaci i ekwipunek">
            <div className={`character-flip-card${flipped ? ' is-flipped' : ''}`}>
              <div className="character-flip-inner">
                <article
                  aria-hidden={flipped}
                  className="character-card-face character-card-front"
                  inert={flipped ? true : undefined}
                >
                  <header>
                    <div>
                      <span>Set</span>
                      <strong>{activeSet?.name ?? 'Brak'}</strong>
                    </div>
                    <span className="equipment-completion">{completion}/8 EQ</span>
                  </header>

                  <div className="metin-equipment-board">
                    <button
                      aria-label="Odwróć kartę i pokaż timery"
                      className="character-portrait-button"
                      onClick={() => setFlipped(true)}
                      type="button"
                    >
                      <span className="character-aura" />
                      {character.imagePath ? (
                        <img
                          alt={`${characterClassLabels[character.characterClass]} — ${character.name}`}
                          src={character.imagePath}
                        />
                      ) : (
                        <span className="missing-render">Brak zatwierdzonego renderu</span>
                      )}
                      <span>kliknij postać, aby zobaczyć timery</span>
                    </button>

                    {activeSet
                      ? equipmentSlots.map((slot) => {
                          const itemId = activeSet.assignments[slot];
                          const item = workspace.items.find((entry) => entry.id === itemId) ?? null;
                          const readiness = getSlotReadiness(workspace, character, activeSet, slot);
                          const compatibleSelection = selectedItem?.category === slot;
                          return (
                            <button
                              aria-label={`${slotLabels[slot]}${item ? `: ${item.name}` : ': pusty slot'}`}
                              className={`equipment-slot slot-${slot}${item ? ' has-item' : ''}${compatibleSelection ? ' can-accept' : ''}`}
                              key={slot}
                              onClick={() => selectedItemId && onAssign(selectedItemId, slot)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => handleDrop(event, slot)}
                              type="button"
                            >
                              {item ? <img alt="" src={item.iconPath} /> : <span>{slotLabels[slot]}</span>}
                              <small>
                                {slotLabels[slot]} · {readinessLabels[readiness]}
                              </small>
                            </button>
                          );
                        })
                      : null}
                  </div>
                </article>

                <article
                  aria-hidden={!flipped}
                  className="character-card-face character-card-back"
                  inert={!flipped ? true : undefined}
                >
                  <header>
                    <strong>Postęp postaci</strong>
                    <button onClick={() => setFlipped(false)} type="button">
                      Wróć do EQ
                    </button>
                  </header>
                  <div className="character-timer-list timer-list">
                    {timers.length === 0 ? (
                      <p className="empty-copy">Brak timerów dla tej postaci.</p>
                    ) : (
                      timers.map((timer) => (
                        <article
                          className={`character-timer timer-card${timer.status === 'ready' ? ' is-ready' : ''}`}
                          key={timer.id}
                        >
                          <div>
                            <h3>{timer.label}</h3>
                            <p>{timer.detail}</p>
                            <ul className="timer-meta">
                              <li>
                                {timer.status === 'ready' ? 'Gotowe' : 'W toku'}
                                {timer.remainingLabel ? ` · ${timer.remainingLabel}` : ''}
                              </li>
                              <li>
                                Ostatnio: {timer.lastActorName ?? '—'}
                                {timer.lastConfirmedAt ? ` · ${timer.lastConfirmedAt}` : ''}
                              </li>
                              <li>
                                Discord:{' '}
                                {timer.reminderState === 'unavailable'
                                  ? 'przypomnienia po podpięciu bota'
                                  : timer.reminderState === 'on'
                                    ? 'włączone'
                                    : 'wyłączone'}
                              </li>
                            </ul>
                          </div>
                          <button
                            disabled={!writesEnabled}
                            onClick={() => {
                              const operationId = `timer-${timer.id}-${Date.now()}`;
                              completeTimer(workspace.id, timer.id, operationId);
                              setAnnouncement(
                                timer.status === 'ready'
                                  ? `Oznaczono: ${timer.label}. Następny cykl odlicza się od teraz.`
                                  : `Odświeżono timer: ${timer.label}.`,
                              );
                            }}
                            type="button"
                          >
                            Oznacz wykonane
                          </button>
                        </article>
                      ))
                    )}
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section className="panel catalog-panel">
            <header>
              <h2>Przedmioty</h2>
            </header>
            <label className="market-search">
              <Icon name="search" size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Szukaj przedmiotu lub bonusu…"
                value={query}
              />
            </label>
            <div className="catalog-filters">
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
            <p className="empty-copy">Przeciągnij przedmiot na slot albo wybierz i kliknij slot.</p>
            <div className="catalog-grid">
              {filteredCatalog.map((item) => (
                <button
                  aria-pressed={item.id === selectedItemId}
                  className="catalog-item"
                  draggable
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  onDragStart={(event) => event.dataTransfer.setData('text/item-id', item.id)}
                  type="button"
                >
                  <img alt="" src={item.iconPath} />
                  <strong>{item.name}</strong>
                  <small>
                    {item.lastConfirmedLocation
                      ? `Lokalizacja: ${item.lastConfirmedLocation}`
                      : 'Brak potwierdzonej lokalizacji'}
                  </small>
                </button>
              ))}
            </div>

            <form className="inline-create" onSubmit={handleCreateItem}>
              <input
                aria-label="Nazwa nowego przedmiotu"
                list="eq-catalog-suggestions"
                onChange={(event) => {
                  const value = event.target.value;
                  setNewItemName(value);
                  const hit = findGameItemByCardName(value);
                  const slot = hit ? equipmentSlotForCategory(hit.category) : null;
                  if (slot) setNewItemSlot(slot);
                }}
                placeholder="Nazwa z gry, np. Bojowa Tarcza +9"
                value={newItemName}
              />
              <datalist id="eq-catalog-suggestions">
                {catalogSuggestions.map((item) => (
                  <option key={item.id} value={item.title} />
                ))}
              </datalist>
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
                Dodaj kartę
              </button>
            </form>
            {matchedDefinition ? (
              <p className="empty-copy">
                Ikona z katalogu: <strong>{matchedDefinition.title}</strong>
                {matchedDefinition.sourceImageUrl ? '' : ' · bez grafiki'}
              </p>
            ) : newItemName.trim().length >= 2 ? (
              <p className="empty-copy">Brak w katalogu — zapiszesz własną nazwę zespołu.</p>
            ) : null}
          </section>

          <aside className="panel inspector-panel">
            <header>
              <h2>Szczegóły</h2>
            </header>
            {selectedItem ? (
              <>
                <h3>{selectedItem.name}</h3>
                <p>{selectedItem.levelLabel}</p>
                <ul>
                  {selectedItem.bonuses.map((bonus) => (
                    <li key={bonus}>{bonus}</li>
                  ))}
                </ul>
                <p>
                  Ostatnio potwierdzona lokalizacja:{' '}
                  <strong>{selectedItem.lastConfirmedLocation ?? 'brak'}</strong>
                  {selectedItem.lastConfirmedBy ? (
                    <>
                      {' '}
                      · {selectedItem.lastConfirmedBy} · {selectedItem.lastConfirmedAt}
                    </>
                  ) : null}
                </p>
                <button
                  className="primary-button"
                  disabled={!writesEnabled}
                  onClick={() => {
                    confirmLocation(workspace.id, selectedItem.id, character.name);
                    setAnnouncement(
                      `${selectedItem.name}: potwierdzono fizyczną lokalizację na ${character.name}.`,
                    );
                  }}
                  type="button"
                >
                  Potwierdź: jest na {character.name}
                </button>
                <label className="field">
                  <span>Oznacz jako przeniesione (lokalizacja)</span>
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
                          key={slot}
                          onClick={() => {
                            removeItem(workspace.id, character.id, activeSet.id, slot);
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
              <p>Wybierz przedmiot z bazy.</p>
            )}
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {announcement ? <p className="entry-status">{announcement}</p> : null}
        <div className="mock-notice">
          Plan setu to układ docelowy. Lokalizacja to osobne, ręczne potwierdzenie z gry. Timery
          Biolog / jazda / księgi też osobno. Dane tylko w tej przeglądarce.
        </div>
      </main>
    </AppShell>
  );
}
