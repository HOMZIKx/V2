'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  characterAppearanceLabel,
  formatCharacterClassLine,
} from '../../src/character-profile';
import { usePlayerStore } from '../../src/player-store-react';
import { AppShell, Icon } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';

type ChoiceTarget = {
  readonly workspaceId: string;
  readonly characterId: string;
  readonly name: string;
};

export function CharacterDirectory() {
  const { state, hydrated, writesEnabled, archiveCharacter, addNote, removeNote } =
    usePlayerStore();
  const [query, setQuery] = useState('');
  const [rosterEdit, setRosterEdit] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [choice, setChoice] = useState<ChoiceTarget | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const characters = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pl');
    return state.workspaces.flatMap((workspace) =>
      workspace.characters
        .filter((character) => !character.archived)
        .filter((character) =>
          normalized.length === 0
            ? true
            : character.name.toLocaleLowerCase('pl').includes(normalized),
        )
        .map((character) => ({ character, workspace })),
    );
  }, [state.workspaces, query]);

  const choiceNotes = useMemo(() => {
    if (!choice) return [];
    const workspace = state.workspaces.find((entry) => entry.id === choice.workspaceId);
    if (!workspace) return [];
    return workspace.notes.filter(
      (note) => note.scope === 'character' && note.characterId === choice.characterId,
    );
  }, [choice, state.workspaces]);

  const primaryWorkspace = state.workspaces[0] ?? null;

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

  return (
    <AppShell activeSection="characters" viewerName={state.viewer.displayName}>
      <main className="characters-page" id="main-content">
        <header className="characters-page-header">
          <div>
            <span className="eyebrow">Wszystkie przestrzenie</span>
            <h1>Postacie</h1>
            <p>Lista postaci z Twoich zespołów.</p>
          </div>
          <div className="characters-page-actions">
            {writesEnabled && primaryWorkspace ? (
              <a
                className="secondary-button"
                href={`/teams/${primaryWorkspace.id}/characters/new`}
              >
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
            placeholder="Szukaj postaci…"
            value={query}
          />
        </label>

        {characters.length === 0 ? (
          <section className="panel">
            <p className="empty-copy">
              Brak postaci. Dodaj pierwszą kartę, żeby otworzyć EQ i Timer.
            </p>
            {writesEnabled && primaryWorkspace ? (
              <a
                className="primary-button"
                href={`/teams/${primaryWorkspace.id}/characters/new`}
              >
                Dodaj postać
              </a>
            ) : (
              <a className="primary-button" href="/">
                Przejdź na pulpit
              </a>
            )}
          </section>
        ) : (
          <div className={`character-cards${rosterEdit ? ' is-roster-edit' : ''}`}>
            {characters.map(({ character, workspace }) => {
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
                    <small>{workspace.name}</small>
                  </div>
                </>
              );

              if (rosterEdit) {
                return (
                  <article
                    className="character-card-manage"
                    key={`${workspace.id}-${character.id}`}
                  >
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
                            `Usunąć „${character.name}” ze składu przestrzeni ${workspace.name}? Kartę można będzie odtworzyć tylko z historii / backupu.`,
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
                  key={`${workspace.id}-${character.id}`}
                  onClick={() =>
                    setChoice({
                      workspaceId: workspace.id,
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
              aria-labelledby="character-choice-title"
              className="character-choice-panel"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <header>
                <h2 id="character-choice-title">{choice.name}</h2>
                <button
                  aria-label="Zamknij"
                  className="icon-button"
                  onClick={closeChoice}
                  type="button"
                >
                  <Icon name="x" size={16} />
                </button>
              </header>
              <div className="character-choice-actions">
                <a
                  className="secondary-button"
                  href={`/teams/${choice.workspaceId}/characters/${choice.characterId}`}
                >
                  <Icon name="equipment" size={16} /> EQ
                </a>
                <a
                  className="secondary-button"
                  href={`/teams/${choice.workspaceId}/characters/${choice.characterId}?view=timers`}
                >
                  <Icon name="clock" size={16} /> Timer
                </a>
                <button
                  className="secondary-button"
                  onClick={() => {
                    const el = document.getElementById('character-choice-notes');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  type="button"
                >
                  <Icon name="note" size={16} /> Notatki postaci
                </button>
              </div>
              <section className="character-choice-notes" id="character-choice-notes">
                <h3>Notatki postaci</h3>
                {writesEnabled ? (
                  <form
                    className="character-choice-note-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const body = noteDraft.trim();
                      if (!body) return;
                      addNote(choice.workspaceId, body, choice.characterId);
                      setNoteDraft('');
                    }}
                  >
                    <textarea
                      onChange={(event) => setNoteDraft(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                      placeholder="Treść notatki…"
                      rows={3}
                      value={noteDraft}
                    />
                    <button className="secondary-button" disabled={!noteDraft.trim()} type="submit">
                      Dodaj notatkę
                    </button>
                  </form>
                ) : null}
                {choiceNotes.length === 0 ? (
                  <p className="empty-copy">Brak notatek postaci.</p>
                ) : (
                  <ul className="character-choice-notes-list">
                    {choiceNotes.map((note) => (
                      <li key={note.id}>
                        <div className="character-choice-note-meta">
                          <span>
                            {note.authorName} · {note.createdAtLabel}
                          </span>
                          {writesEnabled ? (
                            <button
                              className="secondary-button is-danger character-choice-note-remove"
                              onClick={() => removeNote(choice.workspaceId, note.id)}
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
            </div>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
