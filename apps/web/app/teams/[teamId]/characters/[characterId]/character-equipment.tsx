'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';

import {
  assignPlannedItem,
  confirmItemLocation,
  equipmentSlots,
  filterCatalogItems,
  getEquipmentCompletion,
  removePlannedItem,
  restartProgressTimer,
  slotLabels,
  type CatalogItem,
  type CharacterEquipmentSnapshot,
  type EquipmentAssignments,
  type EquipmentSlot,
} from '../../../../../src/character-equipment';
import { characterClassLabels, type CharacterProfileDraft } from '../../../../../src/character-profile';
import { AppShell, Icon } from '../../../../app-shell';

const categoryOptions: ReadonlyArray<{ value: EquipmentSlot | 'all'; label: string }> = [
  { value: 'all', label: 'Wszystkie' },
  { value: 'weapon', label: 'Broń' },
  { value: 'armor', label: 'Zbroje' },
  { value: 'helmet', label: 'Hełmy' },
  { value: 'shield', label: 'Tarcze' },
  { value: 'earrings', label: 'Kolczyki' },
  { value: 'necklace', label: 'Naszyjniki' },
  { value: 'bracelet', label: 'Bransolety' },
  { value: 'shoes', label: 'Buty' },
];

function ItemImage({ item }: { item: CatalogItem }) {
  return <img alt="" draggable={false} src={item.iconPath} />;
}

export function CharacterEquipment({
  initialSnapshot,
}: {
  initialSnapshot: CharacterEquipmentSnapshot;
}) {
  const [activeSetId, setActiveSetId] = useState(initialSnapshot.sets[0]?.id ?? '');
  const [assignmentsBySet, setAssignmentsBySet] = useState<
    Readonly<Record<string, EquipmentAssignments>>
  >(() => Object.fromEntries(initialSnapshot.sets.map((set) => [set.id, set.assignments])));
  const [catalog, setCatalog] = useState(initialSnapshot.catalog);
  const [timers, setTimers] = useState(initialSnapshot.timers);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    initialSnapshot.sets[0]?.assignments.weapon ?? null,
  );
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EquipmentSlot | 'all'>('all');
  const [flipped, setFlipped] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [profileOverride, setProfileOverride] = useState<CharacterProfileDraft | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`destiled:character-profile:${initialSnapshot.characterId}`);
      if (saved) setProfileOverride(JSON.parse(saved) as CharacterProfileDraft);
    } catch {
      setProfileOverride(null);
    }
  }, [initialSnapshot.characterId]);

  const activeSet = initialSnapshot.sets.find((set) => set.id === activeSetId)!;
  const assignments = assignmentsBySet[activeSetId] ?? activeSet.assignments;
  const selectedItem = catalog.find((item) => item.id === selectedItemId) ?? null;
  const filteredCatalog = useMemo(
    () => filterCatalogItems(catalog, query, category),
    [catalog, category, query],
  );
  const completion = getEquipmentCompletion(assignments);
  const characterName = profileOverride?.name || initialSnapshot.characterName;
  const classLabel = profileOverride
    ? characterClassLabels[profileOverride.characterClass]
    : initialSnapshot.classLabel;
  const level = profileOverride?.level ?? initialSnapshot.level;

  const assignItem = (itemId: string, slot: EquipmentSlot) => {
    const item = catalog.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const nextAssignments = assignPlannedItem(assignments, item, slot);
    if (nextAssignments === assignments) {
      setAnnouncement(`${item.name} nie pasuje do slotu ${slotLabels[slot]}.`);
      return;
    }
    setAssignmentsBySet((current) => ({ ...current, [activeSetId]: nextAssignments }));
    setSelectedItemId(item.id);
    setAnnouncement(`${item.name} dodano do planu setu ${activeSet.name}.`);
  };

  const handleSlotClick = (slot: EquipmentSlot) => {
    if (selectedItemId) assignItem(selectedItemId, slot);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>, slot: EquipmentSlot) => {
    event.preventDefault();
    assignItem(event.dataTransfer.getData('text/item-id'), slot);
  };

  const handleLocationConfirmation = () => {
    if (!selectedItem) return;
    setCatalog((current) =>
      confirmItemLocation(
        current,
        selectedItem.id,
        characterName,
        initialSnapshot.viewerName,
      ),
    );
    setAnnouncement(
      `${selectedItem.name}: potwierdzono fizyczną lokalizację na ${characterName}.`,
    );
  };

  return (
    <AppShell activeSection="teams" viewerName={initialSnapshot.viewerName}>
      <main className="equipment-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href="/teams/asteria">{initialSnapshot.teamName}</a>
          <Icon name="chevron" size={13} />
          <strong>{characterName}</strong>
        </nav>

        <header className="equipment-page-header">
          <div>
            <span className="eyebrow">Karta postaci</span>
            <h1>{characterName}</h1>
            <p>
              {classLabel} · poziom {level} · prowadzi{' '}
              <strong>{initialSnapshot.responsibleMember}</strong>
            </p>
          </div>
          <div className="equipment-header-actions">
            <a href={`/teams/asteria/characters/${initialSnapshot.characterId}/edit`}>
              <Icon name="settings" size={14} /> Edytuj postać
            </a>
            <div className="set-switcher">
              <label htmlFor="active-set">Aktywny widok setu</label>
              <select
                id="active-set"
                onChange={(event) => {
                  setActiveSetId(event.target.value);
                  setSelectedItemId(null);
                }}
                value={activeSetId}
              >
                {initialSnapshot.sets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name}
                  </option>
                ))}
              </select>
              <span>{activeSet.description}</span>
            </div>
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
                      <strong>{activeSet.name}</strong>
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
                      <img
                        alt={`${classLabel} — ${characterName}`}
                        src={initialSnapshot.imagePath}
                      />
                      <span>kliknij postać, aby zobaczyć timery</span>
                    </button>

                    {equipmentSlots.map((slot) => {
                      const itemId = assignments[slot];
                      const item = catalog.find((candidate) => candidate.id === itemId) ?? null;
                      const compatibleSelection = selectedItem?.category === slot;
                      return (
                        <button
                          aria-label={`${slotLabels[slot]}${item ? `: ${item.name}` : ': pusty slot'}`}
                          className={`equipment-slot slot-${slot}${item ? ' has-item' : ''}${compatibleSelection ? ' can-accept' : ''}`}
                          key={slot}
                          onClick={() => handleSlotClick(slot)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleDrop(event, slot)}
                          type="button"
                        >
                          {item ? <ItemImage item={item} /> : <span>{slotLabels[slot]}</span>}
                          <small>{slotLabels[slot]}</small>
                        </button>
                      );
                    })}
                  </div>

                  <footer className="character-card-footer">
                    <div>
                      <strong>{characterName}</strong>
                      <span>
                        {classLabel} · Lv. {level}
                      </span>
                    </div>
                    <button onClick={() => setFlipped(true)} type="button">
                      <Icon name="clock" size={15} /> Odwróć kartę
                    </button>
                  </footer>
                </article>

                <article
                  aria-hidden={!flipped}
                  className="character-card-face character-card-back"
                  inert={!flipped ? true : undefined}
                >
                  <header>
                    <div>
                      <span>Postęp postaci</span>
                      <strong>Timery</strong>
                    </div>
                    <button
                      aria-label="Wróć do ekwipunku"
                      onClick={() => setFlipped(false)}
                      type="button"
                    >
                      <Icon name="equipment" size={16} /> EQ
                    </button>
                  </header>
                  <div className="character-timer-list">
                    {timers.map((timer) => (
                      <article className={`character-timer is-${timer.status}`} key={timer.id}>
                        <div className="character-timer-heading">
                          <span className="character-timer-icon">
                            <Icon name="clock" size={17} />
                          </span>
                          <div>
                            <strong>{timer.label}</strong>
                            <span>{timer.detail}</span>
                          </div>
                          <em>{timer.readyLabel}</em>
                        </div>
                        <div className="timer-progress-track">
                          <span style={{ width: `${timer.progressPercent}%` }} />
                        </div>
                        <div className="character-timer-footer">
                          <span>
                            {timer.discordReminder ? 'PW Discord włączone' : 'bez PW Discord'}
                          </span>
                          {timer.status === 'ready' && (
                            <button
                              onClick={() => {
                                setTimers((current) => restartProgressTimer(current, timer.id));
                                setAnnouncement(
                                  `${timer.label}: potwierdzono wykonanie i rozpoczęto nowy timer.`,
                                );
                              }}
                              type="button"
                            >
                              <Icon name="check" size={14} /> Oznacz wykonane
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  <footer className="character-card-footer">
                    <div>
                      <strong>{characterName}</strong>
                      <span>timery rozwoju postaci</span>
                    </div>
                    <button onClick={() => setFlipped(false)} type="button">
                      <Icon name="equipment" size={15} /> Pokaż EQ
                    </button>
                  </footer>
                </article>
              </div>
            </div>
          </section>

          <section className="panel item-catalog-panel">
            <header className="panel-header item-catalog-header">
              <div>
                <span className="section-kicker">Wspólna baza</span>
                <h2>Przedmioty</h2>
              </div>
              <a className="secondary-button" href="/market">
                <Icon name="search" size={15} /> Otwórz bazę przedmiotów
              </a>
            </header>
            <div className="catalog-controls">
              <label className="catalog-search">
                <span className="sr-only">Szukaj przedmiotu lub bonusu</span>
                <Icon name="search" size={15} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Szukaj itemu lub bonusu…"
                  type="search"
                  value={query}
                />
              </label>
              <div className="catalog-categories" aria-label="Kategorie przedmiotów">
                {categoryOptions.map((option) => (
                  <button
                    aria-pressed={category === option.value}
                    key={option.value}
                    onClick={() => setCategory(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="catalog-guidance">
              <Icon name="equipment" size={15} />
              Przeciągnij item do zgodnego slotu. Na telefonie wybierz item, potem slot.
            </div>
            <div className="item-catalog-grid">
              {filteredCatalog.map((item) => (
                <button
                  aria-pressed={selectedItemId === item.id}
                  className="catalog-item"
                  draggable
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  onDragStart={(event) => event.dataTransfer.setData('text/item-id', item.id)}
                  type="button"
                >
                  <span className="catalog-item-image">
                    <ItemImage item={item} />
                  </span>
                  <span className="catalog-item-copy">
                    <strong>{item.name}</strong>
                    <small>{item.levelLabel}</small>
                  </span>
                  <span className={`catalog-layer layer-${item.catalogLayer}`}>
                    {item.catalogLayer === 'project_hard_source'
                      ? 'Hard'
                      : item.catalogLayer === 'destiled_curated'
                        ? 'DESTILED'
                        : 'Zespół'}
                  </span>
                </button>
              ))}
              {filteredCatalog.length === 0 && (
                <p className="catalog-empty">Brak przedmiotów dla tego filtra.</p>
              )}
            </div>
          </section>

          <aside className="panel item-inspector-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Szczegóły</span>
                <h2>Wybrany przedmiot</h2>
              </div>
            </header>
            {selectedItem ? (
              <div className="item-inspector">
                <div className="inspector-item-heading">
                  <span className="inspector-item-image">
                    <ItemImage item={selectedItem} />
                  </span>
                  <div>
                    <strong>{selectedItem.name}</strong>
                    <span>{selectedItem.levelLabel}</span>
                  </div>
                </div>
                <div className="inspector-bonuses">
                  <span>Bonusy</span>
                  <ul>
                    {selectedItem.bonuses.map((bonus) => (
                      <li key={bonus}>{bonus}</li>
                    ))}
                  </ul>
                </div>
                <div className="confirmed-location">
                  <span>Ostatnia potwierdzona lokalizacja</span>
                  <strong>{selectedItem.lastConfirmedCharacterName ?? 'brak potwierdzenia'}</strong>
                  {selectedItem.lastConfirmedBy && (
                    <small>
                      {selectedItem.lastConfirmedBy} · {selectedItem.lastConfirmedLabel}
                    </small>
                  )}
                </div>
                <p className="planning-warning">
                  Dodanie do setu planuje układ. Nie oznacza, że item został przeniesiony w grze.
                </p>
                <button
                  className="confirm-location-button"
                  onClick={handleLocationConfirmation}
                  type="button"
                >
                  <Icon name="check" size={15} /> Potwierdź: jest na {characterName}
                </button>
                {equipmentSlots.find((slot) => assignments[slot] === selectedItem.id) && (
                  <button
                    className="remove-planned-button"
                    onClick={() => {
                      const slot = equipmentSlots.find(
                        (candidate) => assignments[candidate] === selectedItem.id,
                      );
                      if (!slot) return;
                      setAssignmentsBySet((current) => ({
                        ...current,
                        [activeSetId]: removePlannedItem(assignments, slot),
                      }));
                      setAnnouncement(
                        `${selectedItem.name} usunięto z planu setu ${activeSet.name}.`,
                      );
                    }}
                    type="button"
                  >
                    Usuń z planu setu
                  </button>
                )}
              </div>
            ) : (
              <div className="item-inspector-empty">
                <Icon name="equipment" />
                <p>Wybierz przedmiot, aby zobaczyć bonusy i potwierdzoną lokalizację.</p>
              </div>
            )}
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div className="mock-notice">
          Interfejs produkcyjny · plan setu i fizyczna lokalizacja itemu są celowo osobnymi danymi.
          AI/skaner później doda propozycję do zatwierdzenia, nie zapis automatyczny.
        </div>
      </main>
    </AppShell>
  );
}
