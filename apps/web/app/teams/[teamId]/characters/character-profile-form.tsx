'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  buildSaveCharacterProfileCommand,
  characterClassLabels,
  characterGenderLabels,
  getApprovedCharacterRender,
  validateCharacterProfile,
  type CharacterClass,
  type CharacterGender,
  type CharacterProfileDraft,
  type CharacterProfileSnapshot,
} from '../../../../src/character-profile';
import { AppShell, Icon } from '../../../app-shell';

export function CharacterProfileForm({
  initialSnapshot,
}: {
  initialSnapshot: CharacterProfileSnapshot;
}) {
  const [draft, setDraft] = useState(initialSnapshot.draft);
  const [submitted, setSubmitted] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const editing = initialSnapshot.characterId !== null;
  const validation = useMemo(() => validateCharacterProfile(draft), [draft]);
  const renderPath = getApprovedCharacterRender(draft.characterClass, draft.gender);
  const responsibleMember =
    initialSnapshot.members.find((member) => member.id === draft.responsibleMemberId)
      ?.displayName ?? 'Nie wybrano';

  useEffect(() => {
    if (!editing) return;
    const saved = window.localStorage.getItem(`destiled:character-profile:${initialSnapshot.characterId}`);
    if (!saved) return;
    try { setDraft(JSON.parse(saved) as CharacterProfileDraft); } catch { window.localStorage.removeItem(`destiled:character-profile:${initialSnapshot.characterId}`); }
  }, [editing, initialSnapshot.characterId]);

  const updateDraft = <Key extends keyof CharacterProfileDraft>(
    key: Key,
    value: CharacterProfileDraft[Key],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (!validation.valid) {
      setAnnouncement('Popraw oznaczone pola przed zapisem postaci.');
      return;
    }

    const command = buildSaveCharacterProfileCommand(
      initialSnapshot,
      draft,
      `local-character-${editing ? initialSnapshot.characterId : 'new'}`,
    );
    setDraft(command.profile);
    if (editing) window.localStorage.setItem(`destiled:character-profile:${initialSnapshot.characterId}`, JSON.stringify(command.profile));
    setSubmitted(true);
    setAnnouncement(
      editing
        ? `${command.profile.name}: zmiany profilu są gotowe do zapisania.`
        : `${command.profile.name}: postać i pierwszy zestaw są gotowe do utworzenia.`,
    );
  };

  if (submitted) {
    return (
      <AppShell activeSection="teams" viewerName={initialSnapshot.viewerName}>
        <main className="character-profile-page" id="main-content">
          <section className="character-save-result">
            <span className="save-result-icon">
              <Icon name="check" size={26} />
            </span>
            <span className="eyebrow">
              {editing ? 'Profil zaktualizowany' : 'Postać utworzona'}
            </span>
            <h1>{draft.name}</h1>
            <p>
              {editing
                ? 'Zmiana ma gotowy kontrakt wersji. API zapisze ją bez cichego nadpisania nowszych danych.'
                : `Utworzono profil oraz pusty zestaw „${draft.startingSetName}”. Przedmioty dodasz osobno.`}
            </p>
            <div className="save-result-summary">
              <span>{characterClassLabels[draft.characterClass]}</span>
              <span>{draft.level ? `Poziom ${draft.level}` : 'Poziom nieustalony'}</span>
              <span>Prowadzi: {responsibleMember}</span>
            </div>
            <div className="save-result-actions">
              <a href={`/teams/${initialSnapshot.teamId}`}>Wróć do zespołu</a>
              {editing && (
                <a
                  href={`/teams/${initialSnapshot.teamId}/characters/${initialSnapshot.characterId}`}
                >
                  Otwórz kartę EQ
                </a>
              )}
              {!editing && (
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setDraft(initialSnapshot.draft);
                    setAttempted(false);
                  }}
                  type="button"
                >
                  Dodaj kolejną postać
                </button>
              )}
            </div>
          </section>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell activeSection="teams" viewerName={initialSnapshot.viewerName}>
      <main className="character-profile-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${initialSnapshot.teamId}`}>{initialSnapshot.teamName}</a>
          <Icon name="chevron" size={13} />
          <strong>{editing ? `Edytuj ${draft.name}` : 'Nowa postać'}</strong>
        </nav>

        <header className="character-profile-header">
          <div>
            <span className="eyebrow">{editing ? 'Ustawienia postaci' : 'Nowa karta zespołu'}</span>
            <h1>{editing ? 'Edytuj postać' : 'Dodaj postać'}</h1>
            <p>
              To wspólna notatka zespołu, nie połączenie z klientem gry. Wszystkie dane można
              później zmienić.
            </p>
          </div>
          <a href={`/teams/${initialSnapshot.teamId}`}>
            <Icon name="x" size={15} /> Anuluj
          </a>
        </header>

        <div className="character-profile-layout">
          <form className="panel character-profile-form" noValidate onSubmit={handleSubmit}>
            <section>
              <header>
                <span>01</span>
                <div>
                  <h2>Tożsamość postaci</h2>
                  <p>Nazwa i wariant widoczny na karcie.</p>
                </div>
              </header>
              <div className="profile-form-grid">
                <label className="is-wide">
                  <span>Nazwa postaci</span>
                  <input
                    aria-invalid={attempted && Boolean(validation.errors.name)}
                    maxLength={24}
                    onChange={(event) => updateDraft('name', event.target.value)}
                    placeholder="np. NerwNicht"
                    value={draft.name}
                  />
                  {attempted && validation.errors.name && <small>{validation.errors.name}</small>}
                </label>
                <label>
                  <span>Klasa</span>
                  <select
                    onChange={(event) =>
                      updateDraft('characterClass', event.target.value as CharacterClass)
                    }
                    value={draft.characterClass}
                  >
                    {Object.entries(characterClassLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Płeć postaci</span>
                  <select
                    onChange={(event) =>
                      updateDraft('gender', event.target.value as CharacterGender)
                    }
                    value={draft.gender}
                  >
                    {Object.entries(characterGenderLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    Poziom <em>opcjonalnie</em>
                  </span>
                  <input
                    aria-invalid={attempted && Boolean(validation.errors.level)}
                    inputMode="numeric"
                    min="1"
                    onChange={(event) =>
                      updateDraft(
                        'level',
                        event.target.value === '' ? null : Number(event.target.value),
                      )
                    }
                    placeholder="np. 75"
                    type="number"
                    value={draft.level ?? ''}
                  />
                  {attempted && validation.errors.level && <small>{validation.errors.level}</small>}
                </label>
              </div>
            </section>

            <section>
              <header>
                <span>02</span>
                <div>
                  <h2>Współpraca zespołu</h2>
                  <p>Kto prowadzi postać i co zespół powinien wiedzieć.</p>
                </div>
              </header>
              <div className="profile-form-grid">
                <label>
                  <span>Osoba prowadząca</span>
                  <select
                    onChange={(event) => updateDraft('responsibleMemberId', event.target.value)}
                    value={draft.responsibleMemberId}
                  >
                    {initialSnapshot.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Pierwszy zestaw</span>
                  <input
                    aria-invalid={attempted && Boolean(validation.errors.startingSetName)}
                    maxLength={32}
                    onChange={(event) => updateDraft('startingSetName', event.target.value)}
                    value={draft.startingSetName}
                  />
                  {attempted && validation.errors.startingSetName && (
                    <small>{validation.errors.startingSetName}</small>
                  )}
                </label>
                <label className="is-wide">
                  <span>
                    Notatka zespołu <em>opcjonalnie</em>
                  </span>
                  <textarea
                    maxLength={280}
                    onChange={(event) => updateDraft('teamNote', event.target.value)}
                    placeholder="Do czego służy postać, czego pilnować, co jest ważne…"
                    rows={4}
                    value={draft.teamNote}
                  />
                  <small className="character-count">{draft.teamNote.length}/280</small>
                </label>
              </div>
            </section>

            <footer>
              <p>
                <Icon name="history" size={14} /> Zapis będzie miał osobę, czas, wersję i operation
                ID.
              </p>
              <button type="submit">
                <Icon name="check" size={16} /> {editing ? 'Zapisz zmiany' : 'Utwórz postać'}
              </button>
            </footer>
          </form>

          <aside className="panel character-profile-preview">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Podgląd na żywo</span>
                <h2>Karta zespołu</h2>
              </div>
            </header>
            <div className="profile-preview-card">
              <div className={`profile-preview-art${renderPath ? '' : ' is-missing'}`}>
                {renderPath ? (
                  <img
                    alt={`${characterClassLabels[draft.characterClass]} — podgląd`}
                    src={renderPath}
                  />
                ) : (
                  <div>
                    <Icon name="character" size={26} />
                    <strong>Brak zatwierdzonego renderu</strong>
                    <span>
                      Nie podstawiamy grafiki innej klasy. Render dodamy do biblioteki później.
                    </span>
                  </div>
                )}
              </div>
              <div className="profile-preview-copy">
                <span>
                  {characterClassLabels[draft.characterClass]} ·{' '}
                  {characterGenderLabels[draft.gender]}
                </span>
                <h3>{draft.name.trim() || 'Nazwa postaci'}</h3>
                <p>
                  {draft.level ? `Poziom ${draft.level}` : 'Poziom nieustalony'} · prowadzi{' '}
                  <strong>{responsibleMember}</strong>
                </p>
                <div>
                  <span>Startowy set</span>
                  <strong>{draft.startingSetName.trim() || 'Bez nazwy'}</strong>
                </div>
                {draft.teamNote.trim() && <blockquote>{draft.teamNote.trim()}</blockquote>}
              </div>
            </div>
            <p className="profile-preview-hint">
              <Icon name="equipment" size={14} /> Utworzenie postaci nie dodaje fikcyjnego EQ.
              Zestaw startuje pusty.
            </p>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div className="mock-notice">
          Interfejs produkcyjny · zapis demonstracyjny przez typed adapter. API zastąpi adapter bez
          zmiany formularza.
        </div>
      </main>
    </AppShell>
  );
}
