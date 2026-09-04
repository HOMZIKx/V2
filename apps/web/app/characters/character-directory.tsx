'use client';

import { useMemo, useState } from 'react';

import {
  characterAppearanceLabel,
  formatCharacterClassLine,
} from '../../src/character-profile';
import { usePlayerStore } from '../../src/player-store-react';
import { AppShell, Icon } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';

export function CharacterDirectory() {
  const { state, hydrated, writesEnabled, archiveCharacter } = usePlayerStore();
  const [query, setQuery] = useState('');
  const [rosterEdit, setRosterEdit] = useState(false);
  const [announcement, setAnnouncement] = useState('');

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

  const primaryWorkspace = state.workspaces[0] ?? null;

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
            <p>
              Lista postaci z Twoich zespołów. EQ i timery PH są na karcie postaci. Skład edytujesz
            przyciskiem Edycja składu.
            </p>
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
            Tryb edycji składu: możesz edytować profil albo usunąć postać z listy.
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
            placeholder="Szukaj postaci…"
            value={query}
          />
        </label>

        {characters.length === 0 ? (
          <section className="panel">
            <p className="empty-copy">
              Brak postaci w Twoich przestrzeniach. Utwórz przestrzeń i dodaj pierwszą kartę.
            </p>
            <a className="primary-button" href="/">
              Przejdź na pulpit
            </a>
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
                    {!rosterEdit ? <span className="character-card-cta">EQ · Timery</span> : null}
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
                <a
                  className="character-card-link"
                  href={href}
                  key={`${workspace.id}-${character.id}`}
                >
                  {cardBody}
                </a>
              );
            })}
          </div>
        )}

        <div className="mock-notice">
          Postacie są osobnym modułem. Lista pochodzi ze wspólnego store first-slice.
        </div>
      </main>
    </AppShell>
  );
}
