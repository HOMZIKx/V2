'use client';

import { useMemo, useState } from 'react';

import { characterClassLabels } from '../../src/character-profile';
import { usePlayerStore } from '../../src/player-store-react';
import { AppShell, Icon } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';

export function CharacterDirectory() {
  const { state, hydrated } = usePlayerStore();
  const [query, setQuery] = useState('');

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
        <header>
          <span className="eyebrow">Wszystkie przestrzenie</span>
          <h1>Postacie</h1>
          <p>
            Lista postaci z Twoich przestrzeni. Miejsce w zespole nie znaczy, że postać jest Twoja —
            prowadzi ją przypisana osoba.
          </p>
        </header>

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
          <div className="character-cards">
            {characters.map(({ character, workspace }) => (
              <article key={`${workspace.id}-${character.id}`}>
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
                    {characterClassLabels[character.characterClass]}
                    {character.level ? ` · ${character.level}` : ''}
                  </p>
                  <small>{workspace.name}</small>
                  <a href={`/teams/${workspace.id}/characters/${character.id}`}>Otwórz kartę EQ</a>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mock-notice">
          Postacie są osobnym modułem. Lista pochodzi ze wspólnego store first-slice.
        </div>
      </main>
    </AppShell>
  );
}
