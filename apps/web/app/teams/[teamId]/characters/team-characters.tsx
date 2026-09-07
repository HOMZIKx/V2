'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  characterAppearanceLabel,
  formatCharacterClassLine,
} from '../../../../src/character-profile';
import { usePlayerStore } from '../../../../src/player-store-react';
import { AppShell, Icon } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';
import { WorkspaceSectionNav } from '../workspace-section-nav';

type ChoiceTarget = {
  readonly characterId: string;
  readonly name: string;
};

export function TeamCharacters() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const { state, hydrated, writesEnabled, archiveCharacter, addNote, removeNote, openWorkspace } =
    usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === teamId) ?? null;
  const [query, setQuery] = useState('');
  const [rosterEdit, setRosterEdit] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [choice, setChoice] = useState<ChoiceTarget | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    if (workspace && !workspace.archived) openWorkspace(workspace.id);
  }, [workspace, openWorkspace]);

  const characters = useMemo(() => {
    if (!workspace) return [];
    const normalized = query.trim().toLocaleLowerCase('pl');
    return workspace.characters
      .filter((character) => !character.archived)
      .filter((character) =>
        normalized.length === 0
          ? true
          : character.name.toLocaleLowerCase('pl').includes(normalized),
      );
  }, [workspace, query]);

  const choiceNotes = useMemo(() => {
    if (!choice || !workspace) return [];
    return workspace.notes.filter(
      (note) => note.scope === 'character' && note.characterId === choice.characterId,
    );
  }, [choice, workspace]);

  useEffect(() => {
    if (!choice) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setChoice(null);
        setNoteDraft('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choice]);

  const closeChoice = () => {
    setChoice(null);
    setNoteDraft('');
  };

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

  if (!workspace || workspace.archived) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="characters-page" id="main-content">
          <h1>Nie znaleziono zespołu</h1>
          <a className="secondary-button" href="/">
            Wróć na pulpit
          </a>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="characters-page team-characters-page" id="main-content">
        <nav aria-label="Okruszki" className="breadcrumbs">
          <a href="/">Pulpit</a>
          <Icon name="chevron" size={13} />
          <a href={`/teams/${workspace.id}`}>{workspace.name}</a>
          <Icon name="chevron" size={13} />
          <strong>Postacie</strong>
        </nav>

        <div className="team-section-back">
          <a className="secondary-button" href={`/teams/${workspace.id}/members`}>
            ← Zarządzanie zespołem
          </a>
          <a className="panel-text-link" href={`/teams/${workspace.id}`}>
            Przegląd zespołu
          </a>
        </div>

        <WorkspaceSectionNav active="characters" workspaceId={workspace.id} />

        <header className="characters-page-header">
          <div>
            <span className="eyebrow">Skład zespołu</span>
            <h1>Postacie · {workspace.name}</h1>
            <p>Karty tego zespołu — EQ i timery otwierasz z karty postaci.</p>
          </div>
          <div className="characters-page-actions">
            {writesEnabled ? (
              <a className="secondary-button" href={`/teams/${workspace.id}/characters/new`}>
                <Icon name="plus" size={16} /> Dodaj postać
              </a>
            ) : null}
            {writesEnabled ? (
              <button
                aria-pressed={rosterEdit}
                className={`secondary-button${rosterEdit ? ' is-active' : ''}`}
                onClick={() => setRosterEdit((open) => !open)}
                type="button"
              >
                <Icon name="settings" size={16} />
                {rosterEdit ? 'Zakończ edycję' : 'Edycja składu'}
              </button>
            ) : null}
          </div>
        </header>

        {rosterEdit ? (
          <p className="roster-edit-banner" role="status">
            Edycja składu: profil albo usunięcie postaci.
          </p>
        ) : null}
        {announcement ? (
          <p className="roster-edit-banner is-success" role="status">
            {announcement}
          </p>
        ) : null}

        <label className="market-search">
          <Icon name="search" size={16} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Szukaj postaci w tym zespole…"
            value={query}
          />
        </label>

        {characters.length === 0 ? (
          <section className="panel">
            <p className="empty-copy">
              Brak postaci w tym zespole. Dodaj pierwszą kartę, żeby otworzyć EQ i Timer.
            </p>
            {writesEnabled ? (
              <a className="primary-button" href={`/teams/${workspace.id}/characters/new`}>
                Dodaj postać
              </a>
            ) : null}
          </section>
        ) : (
          <div className={`character-cards${rosterEdit ? ' is-roster-edit' : ''}`}>
            {characters.map((character) => {
              const href = `/teams/${workspace.id}/characters/${character.id}`;
              const editHref = `${href}/edit`;
              const cardBody = (
                <>
                  <div className="character-card-visual">
                    {character.imagePath ? (
                      <img alt="" src={character.imagePath} />
                    ) : (
                      <span className="missing-render">Brak renderu</span>
                    )}
                  </div>
                  <div className="character-card-copy">
                    <h3>{character.name}</h3>
                    <p>
                      {formatCharacterClassLine(character.characterClass, character.skillPath)}
                      {character.level ? ` · ${character.level}` : ''}
                    </p>
                    <p>{characterAppearanceLabel(character.appearanceLook ?? 'desert')}</p>
                  </div>
                </>
              );

              if (rosterEdit) {
                return (
                  <article className="character-card-manage" key={character.id}>
                    {cardBody}
                    <div className="character-card-manage-actions">
                      <a className="secondary-button" href={editHref}>
                        Edytuj
                      </a>
                      <button
                        className="secondary-button is-danger"
                        disabled={!writesEnabled}
                        onClick={() => {
                          const ok = window.confirm(
                            `Usunąć „${character.name}” ze składu zespołu ${workspace.name}?`,
                          );
                          if (!ok) return;
                          archiveCharacter(workspace.id, character.id);
                          setAnnouncement(`Usunięto „${character.name}” ze składu.`);
                        }}
                        type="button"
                      >
                        Usuń
                      </button>
                    </div>
                  </article>
                );
              }

              return (
                <button
                  className="character-card-link"
                  key={character.id}
                  onClick={() =>
                    setChoice({
                      characterId: character.id,
                      name: character.name,
                    })
                  }
                  type="button"
                >
                  {cardBody}
                </button>
              );
            })}
          </div>
        )}

        {choice ? (
          <div
            aria-modal="true"
            className="character-choice-backdrop"
            onClick={closeChoice}
            role="presentation"
          >
            <div
              aria-labelledby="team-character-choice-title"
              className="character-choice-panel"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <header>
                <h2 id="team-character-choice-title">{choice.name}</h2>
                <button
                  aria-label="Zamknij"
                  className="icon-button"
                  onClick={closeChoice}
                  type="button"
                >
                  <Icon name="x" />
                </button>
              </header>
              <div className="character-choice-actions">
                <a
                  className="primary-button"
                  href={`/teams/${workspace.id}/characters/${choice.characterId}`}
                >
                  Otwórz EQ
                </a>
                <a
                  className="secondary-button"
                  href={`/teams/${workspace.id}/characters/${choice.characterId}?view=timers`}
                >
                  Timery
                </a>
                <a
                  className="secondary-button"
                  href={`/teams/${workspace.id}/characters/${choice.characterId}/edit`}
                >
                  Profil
                </a>
              </div>
              <section className="character-choice-notes">
                <h3>Notatki postaci</h3>
                <form
                  className="character-note-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!writesEnabled || noteDraft.trim().length === 0) return;
                    addNote(workspace.id, noteDraft, choice.characterId, 'character');
                    setNoteDraft('');
                    setAnnouncement('Dodano notatkę postaci.');
                  }}
                >
                  <label>
                    Nowa notatka
                    <textarea
                      maxLength={280}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      rows={3}
                      value={noteDraft}
                    />
                  </label>
                  <div className="character-note-form-actions">
                    <small>{noteDraft.trim().length}/280</small>
                    <button
                      className="primary-button"
                      disabled={!writesEnabled || noteDraft.trim().length === 0}
                      type="submit"
                    >
                      Dodaj
                    </button>
                  </div>
                </form>
                {choiceNotes.length === 0 ? (
                  <p className="empty-copy">Brak notatek przy tej postaci.</p>
                ) : (
                  <ul>
                    {choiceNotes.map((note) => (
                      <li key={note.id}>
                        <div>
                          <strong>{note.authorName}</strong>
                          <span> · {note.createdAtLabel}</span>
                          <p>{note.body}</p>
                        </div>
                        <button
                          className="secondary-button"
                          disabled={!writesEnabled}
                          onClick={() => removeNote(workspace.id, note.id)}
                          type="button"
                        >
                          Usuń
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
