'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  HttpCharacterProfileAdapter,
  PlayerWorkspaceConflictError,
} from '../../../../src/adapters/http-character-profile-adapter';
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
import { getTeamDetail } from '../../../../src/lib/player-workspace-api';
import { mapTeamDetailToCharacterProfileSnapshot } from '../../../../src/lib/player-workspace-mappers';
import { AppShell, Icon } from '../../../app-shell';

const profileAdapter = new HttpCharacterProfileAdapter();

export function CharacterProfilePageClient({ mode }: { mode: 'new' | 'edit' }) {
  const params = useParams<{ teamId: string; characterId?: string }>();
  const teamId = params.teamId;
  const characterId = mode === 'edit' ? params.characterId : undefined;
  const [snapshot, setSnapshot] = useState<CharacterProfileSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<CharacterProfileDraft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadError('');
      try {
        const detail = await getTeamDetail(teamId);
        let board = null;
        if (characterId !== undefined) {
          const { getCharacterBoard } = await import('../../../../src/lib/player-workspace-api');
          board = await getCharacterBoard(teamId, characterId);
        }
        const mapped = mapTeamDetailToCharacterProfileSnapshot('Gracz', detail, board);
        if (!cancelled) {
          setSnapshot(mapped);
          setDraft(mapped.draft);
        }
      } catch {
        if (!cancelled) setLoadError('Nie udało się załadować formularza postaci.');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [characterId, teamId]);

  if (loadError) {
    return (
      <main className="character-profile-page panel" id="main-content">
        <p>{loadError}</p>
      </main>
    );
  }

  if (snapshot === null || draft === null) {
    return (
      <main className="character-profile-page panel" id="main-content">
        <p>Ładowanie formularza…</p>
      </main>
    );
  }

  const editing = snapshot.characterId !== null;
  const validation = validateCharacterProfile(draft);
  const renderPath = getApprovedCharacterRender(draft.characterClass, draft.gender);
  const responsibleMember =
    snapshot.members.find((member) => member.id === draft.responsibleMemberId)?.displayName ??
    'Nie wybrano';

  const updateDraft = <Key extends keyof CharacterProfileDraft>(
    key: Key,
    value: CharacterProfileDraft[Key],
  ) => setDraft((current) => (current === null ? current : { ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    setSaveError('');
    if (!validation.valid) {
      setAnnouncement('Popraw oznaczone pola przed zapisem postaci.');
      return;
    }

    setSaving(true);
    try {
      const command = buildSaveCharacterProfileCommand(snapshot, draft, crypto.randomUUID());
      await profileAdapter.saveProfile(command);
      setSubmitted(true);
      setAnnouncement(
        editing
          ? `${command.profile.name}: profil zapisany.`
          : `${command.profile.name}: postać utworzona.`,
      );
    } catch (error) {
      if (error instanceof PlayerWorkspaceConflictError) {
        setSaveError('Konflikt wersji — odśwież stronę i spróbuj ponownie.');
      } else {
        setSaveError('Nie udało się zapisać profilu postaci.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <AppShell activeSection="teams" viewerName={snapshot.viewerName}>
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
                ? 'Zmiana została zapisana przez API Player Workspace.'
                : 'Profil postaci został utworzony. Zestawy EQ dodasz w kolejnym etapie.'}
            </p>
            <div className="save-result-summary">
              <span>{characterClassLabels[draft.characterClass]}</span>
              <span>{draft.level ? `Poziom ${draft.level}` : 'Poziom nieustalony'}</span>
              <span>Prowadzi: {responsibleMember}</span>
            </div>
            <div className="save-result-actions">
              <a href={`/teams/${snapshot.teamId}`}>Wróć do zespołu</a>
              {editing && characterId !== undefined && (
                <a href={`/teams/${snapshot.teamId}/characters/${characterId}`}>Otwórz kartę EQ</a>
              )}
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell activeSection="teams" viewerName={snapshot.viewerName}>
      <main className="character-profile-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${snapshot.teamId}`}>{snapshot.teamName}</a>
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
          <a href={`/teams/${snapshot.teamId}`}>
            <Icon name="x" size={15} /> Anuluj
          </a>
        </header>

        {saveError && <p className="form-error">{saveError}</p>}

        <div className="character-profile-layout">
          <form
            className="panel character-profile-form"
            noValidate
            onSubmit={(e) => void handleSubmit(e)}
          >
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
                  <p>Opcjonalne pola prezentacyjne — nie są jeszcze persistowane przez API.</p>
                </div>
              </header>
              <div className="profile-form-grid">
                <label>
                  <span>Osoba prowadząca</span>
                  <select
                    onChange={(event) => updateDraft('responsibleMemberId', event.target.value)}
                    value={draft.responsibleMemberId}
                  >
                    {snapshot.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Pierwszy zestaw (opcjonalnie)</span>
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
                <Icon name="history" size={14} /> Zapis przez Player Workspace API z wersjonowaniem.
              </p>
              <button disabled={saving} type="submit">
                <Icon name="check" size={16} />{' '}
                {saving ? 'Zapisywanie…' : editing ? 'Zapisz zmiany' : 'Utwórz postać'}
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
                  </div>
                )}
              </div>
              <div className="profile-preview-copy">
                <span>
                  {characterClassLabels[draft.characterClass]} ·{' '}
                  {characterGenderLabels[draft.gender]}
                </span>
                <h3>{draft.name.trim() || 'Nazwa postaci'}</h3>
              </div>
            </div>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </main>
    </AppShell>
  );
}
