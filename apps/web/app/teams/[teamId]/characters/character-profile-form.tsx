'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  characterClassLabels,
  characterGenderLabels,
  getApprovedCharacterRender,
  validateCharacterProfile,
  type CharacterClass,
  type CharacterGender,
  type CharacterProfileDraft,
} from '../../../../src/character-profile';
import { usePlayerStore } from '../../../../src/player-store-react';
import { AppShell, Icon } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';

export function CharacterProfileForm({
  mode,
  characterId,
}: {
  readonly mode: 'create' | 'edit';
  readonly characterId?: string;
}) {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const { state, hydrated, createCharacter, updateCharacter, writesEnabled } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === teamId) ?? null;
  const existing =
    mode === 'edit' && characterId
      ? (workspace?.characters.find((character) => character.id === characterId) ?? null)
      : null;

  const [draft, setDraft] = useState<CharacterProfileDraft>({
    name: '',
    characterClass: 'sura',
    gender: 'male',
    level: null,
    responsibleMemberId: 'mateusz',
    startingSetName: 'Główny',
    teamNote: '',
  });
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    if (!hydrated || state.authStatus !== 'authenticated') return;
    if (!workspace) return;
    if (draftReady) return;
    if (mode === 'edit') {
      if (!existing) return;
      setDraft({
        name: existing.name,
        characterClass: existing.characterClass,
        gender: existing.gender,
        level: existing.level,
        responsibleMemberId: existing.responsibleMemberId,
        startingSetName: existing.sets[0]?.name ?? 'Główny',
        teamNote: existing.note,
      });
    } else {
      setDraft({
        name: '',
        characterClass: 'sura',
        gender: 'male',
        level: null,
        responsibleMemberId: state.viewer?.id ?? 'mateusz',
        startingSetName: 'Główny',
        teamNote: '',
      });
    }
    setDraftReady(true);
  }, [hydrated, state.authStatus, state.viewer?.id, workspace, existing, mode, draftReady]);

  const validation = useMemo(() => validateCharacterProfile(draft), [draft]);
  const renderPath = getApprovedCharacterRender(draft.characterClass, draft.gender);

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

  if (!workspace) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="character-profile-page" id="main-content">
          <h1>Brak przestrzeni</h1>
          <a href="/">Wróć</a>
        </main>
      </AppShell>
    );
  }

  if (mode === 'edit' && !existing) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="character-profile-page" id="main-content">
          <h1>Nie znaleziono postaci</h1>
          <a href={`/teams/${teamId}`}>Wróć do przestrzeni</a>
        </main>
      </AppShell>
    );
  }

  if (!draftReady) {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Ładowanie formularza…</p>
      </main>
    );
  }

  const members = workspace.members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
  }));
  const responsibleMember =
    members.find((member) => member.id === draft.responsibleMemberId)?.displayName ?? 'Nie wybrano';

  const updateDraft = <Key extends keyof CharacterProfileDraft>(
    key: Key,
    value: CharacterProfileDraft[Key],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (!validation.valid || !writesEnabled) {
      setAnnouncement('Popraw oznaczone pola przed zapisem postaci.');
      return;
    }

    if (mode === 'create') {
      const id = createCharacter(workspace.id, {
        name: draft.name,
        characterClass: draft.characterClass,
        gender: draft.gender,
        level: draft.level,
        responsibleMemberId: draft.responsibleMemberId,
        startingSetName: draft.startingSetName.trim() || 'Główny',
        note: draft.teamNote,
      });
      setSubmittedId(id);
      setAnnouncement(
        `${draft.name.trim()}: utworzono profil oraz pusty zestaw „${draft.startingSetName.trim() || 'Główny'}”.`,
      );
      return;
    }

    if (!characterId) return;
    updateCharacter(workspace.id, characterId, {
      name: draft.name,
      characterClass: draft.characterClass,
      gender: draft.gender,
      level: draft.level,
      responsibleMemberId: draft.responsibleMemberId,
      note: draft.teamNote,
    });
    setSubmittedId(characterId);
    setAnnouncement('Profil zaktualizowany');
  };

  if (submittedId) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="character-profile-page" id="main-content">
          <section className="character-save-result">
            <span className="save-result-icon">
              <Icon name="check" size={26} />
            </span>
            <span className="eyebrow">
              {mode === 'edit' ? 'Profil zaktualizowany' : 'Postać utworzona'}
            </span>
            <h1>{draft.name.trim()}</h1>
            <p>
              {mode === 'edit'
                ? 'Profil zaktualizowany'
                : `Utworzono profil oraz pusty zestaw „${draft.startingSetName.trim() || 'Główny'}”.`}
            </p>
            <div className="save-result-summary">
              <span>{characterClassLabels[draft.characterClass]}</span>
              <span>{draft.level ? `Poziom ${draft.level}` : 'Poziom nieustalony'}</span>
              <span>Prowadzi: {responsibleMember}</span>
            </div>
            <div className="save-result-actions">
              <a href={`/teams/${workspace.id}`}>Wróć do zespołu</a>
              <a href={`/teams/${workspace.id}/characters/${submittedId}`}>Otwórz kartę EQ</a>
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
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="character-profile-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${workspace.id}`}>{workspace.name}</a>
          <Icon name="chevron" size={13} />
          <strong>{mode === 'edit' ? 'Edytuj postać' : 'Dodaj postać'}</strong>
        </nav>

        <section className="character-profile-layout">
          <form className="panel character-profile-form" onSubmit={handleSubmit}>
            <header>
              <span className="eyebrow">Karta postaci</span>
              <h1>{mode === 'edit' ? 'Edytuj postać' : 'Dodaj postać'}</h1>
              <p>Wymagane: nazwa i klasa. Reszta opcjonalna. To nie jest weryfikacja w grze.</p>
            </header>

            <label className="field">
              <span>Nazwa postaci</span>
              <input
                aria-invalid={attempted && Boolean(validation.errors.name)}
                onChange={(event) => updateDraft('name', event.target.value)}
                value={draft.name}
              />
              {attempted && validation.errors.name ? <small>{validation.errors.name}</small> : null}
            </label>

            <div className="field-row">
              <label className="field">
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
              <label className="field">
                <span>Płeć / wariant</span>
                <select
                  onChange={(event) => updateDraft('gender', event.target.value as CharacterGender)}
                  value={draft.gender}
                >
                  {Object.entries(characterGenderLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Poziom opcjonalnie</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    updateDraft('level', value ? Number(value) : null);
                  }}
                  value={draft.level ?? ''}
                />
                {attempted && validation.errors.level ? (
                  <small>{validation.errors.level}</small>
                ) : null}
              </label>
              <label className="field">
                <span>Osoba prowadząca</span>
                <select
                  onChange={(event) => updateDraft('responsibleMemberId', event.target.value)}
                  value={draft.responsibleMemberId}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {mode === 'create' ? (
              <label className="field">
                <span>Nazwa pierwszego zestawu (opcjonalnie)</span>
                <input
                  onChange={(event) => updateDraft('startingSetName', event.target.value)}
                  value={draft.startingSetName}
                />
              </label>
            ) : null}

            <label className="field">
              <span>Notatka zespołu opcjonalnie</span>
              <textarea
                maxLength={280}
                onChange={(event) => updateDraft('teamNote', event.target.value)}
                value={draft.teamNote}
              />
            </label>

            <button className="primary-button" disabled={!writesEnabled} type="submit">
              <Icon name="check" size={16} /> {mode === 'edit' ? 'Zapisz zmiany' : 'Utwórz postać'}
            </button>
          </form>

          <aside className="panel character-preview">
            <span className="eyebrow">Podgląd</span>
            <div className="character-preview-visual">
              {renderPath ? (
                <img alt="" src={renderPath} />
              ) : (
                <span className="missing-render">
                  Brak zatwierdzonego renderu dla tej kombinacji
                </span>
              )}
            </div>
            <h2>{draft.name.trim() || 'Nowa postać'}</h2>
            <p>
              {characterClassLabels[draft.characterClass]} · {characterGenderLabels[draft.gender]}
            </p>
          </aside>
        </section>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div className="mock-notice">
          Zapis trafia do wspólnego store first-slice i historii przestrzeni.
        </div>
      </main>
    </AppShell>
  );
}
