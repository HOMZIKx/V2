'use client';

import { useMemo, useState } from 'react';

import {
  filterAccessibleCharacters,
  getCharacterDirectorySummary,
  type CharacterDirectoryScope,
  type CharacterDirectorySnapshot,
} from '../../src/character-directory';
import { AppShell, Icon } from '../app-shell';

const scopes: ReadonlyArray<{ id: CharacterDirectoryScope; label: string }> = [
  { id: 'all', label: 'Wszystkie dostępne' },
  { id: 'mine', label: 'Prowadzone przeze mnie' },
  { id: 'attention', label: 'Wymagają uwagi' },
];

export function CharacterDirectory({
  initialSnapshot,
}: {
  initialSnapshot: CharacterDirectorySnapshot;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<CharacterDirectoryScope>('all');
  const summary = useMemo(() => getCharacterDirectorySummary(initialSnapshot), [initialSnapshot]);
  const visibleCharacters = useMemo(
    () => filterAccessibleCharacters(initialSnapshot.characters, query, scope),
    [initialSnapshot.characters, query, scope],
  );

  return (
    <AppShell activeSection="characters" viewerName={initialSnapshot.viewerName}>
      <main className="character-directory-page" id="main-content">
        <header className="character-directory-header">
          <div>
            <span className="eyebrow">Oddzielny moduł</span>
            <h1>Postacie</h1>
            <p>
              Widzisz wyłącznie postacie własne albo udostępnione przez zaakceptowane zespoły. Brak
              postaci jest prawidłowym stanem konta.
            </p>
          </div>
          {initialSnapshot.canCreateCharacter && initialSnapshot.createHref && (
            <a className="primary-button character-create-button" href={initialSnapshot.createHref}>
              <Icon name="plus" size={16} /> Dodaj postać
            </a>
          )}
        </header>

        <section aria-label="Podsumowanie postaci" className="character-directory-metrics">
          <article>
            <strong>{summary.total}</strong>
            <span>dostępne postacie</span>
          </article>
          <article>
            <strong>{summary.responsible}</strong>
            <span>prowadzisz osobiście</span>
          </article>
          <article>
            <strong>{summary.attention}</strong>
            <span>wymagają uwagi</span>
          </article>
          <article>
            <strong>{summary.readyTimers}</strong>
            <span>gotowe timery</span>
          </article>
        </section>

        <section className="panel character-directory-panel">
          <header className="character-directory-toolbar">
            <div className="character-directory-scopes" role="group" aria-label="Zakres postaci">
              {scopes.map((item) => (
                <button
                  aria-pressed={scope === item.id}
                  className={scope === item.id ? 'is-active' : ''}
                  key={item.id}
                  onClick={() => setScope(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="character-directory-search">
              <Icon name="search" size={16} />
              <span className="sr-only">Szukaj postaci</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Szukaj po nazwie, klasie, zespole lub opiekunie…"
                value={query}
              />
            </label>
          </header>

          {visibleCharacters.length > 0 ? (
            <div className="character-directory-grid">
              {visibleCharacters.map((character) => {
                const equipmentPercent = Math.round(
                  (character.equipmentConfirmed / character.equipmentCapacity) * 100,
                );
                return (
                  <article className="directory-character-card" key={character.id}>
                    <div className="directory-character-art">
                      <img
                        alt={`${character.classLabel} — ${character.name}`}
                        src={character.imagePath}
                      />
                      <span>{character.classLabel}</span>
                    </div>
                    <div className="directory-character-body">
                      <div className="directory-character-title">
                        <div>
                          <span>
                            {character.teamName} · poziom {character.level}
                          </span>
                          <h2>{character.name}</h2>
                        </div>
                        <span className={character.access === 'responsible' ? 'is-owner' : ''}>
                          {character.access === 'responsible' ? 'Prowadzisz' : 'Dostęp zespołu'}
                        </span>
                      </div>
                      <dl>
                        <div>
                          <dt>Osoba prowadząca</dt>
                          <dd>{character.responsibleMember}</dd>
                        </div>
                        <div>
                          <dt>Aktywny set</dt>
                          <dd>{character.activeSetName}</dd>
                        </div>
                      </dl>
                      <div className="directory-equipment-progress">
                        <div>
                          <span>Potwierdzone EQ</span>
                          <strong>
                            {character.equipmentConfirmed}/{character.equipmentCapacity}
                          </strong>
                        </div>
                        <span className="set-progress-track">
                          <span style={{ width: `${equipmentPercent}%` }} />
                        </span>
                      </div>
                      <div className="directory-character-footer">
                        <span
                          className={
                            character.readyTimers > 0 ? 'timer-chip is-ready' : 'timer-chip'
                          }
                        >
                          <Icon name="clock" size={14} /> {character.nextTimerLabel}
                        </span>
                        <a href={character.detailHref}>
                          {character.detailLabel} <Icon name="chevron" size={14} />
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="character-directory-empty">
              <span>
                <Icon name="character" size={28} />
              </span>
              <h2>
                {initialSnapshot.characters.length === 0
                  ? 'Nie masz dostępu do postaci'
                  : 'Brak wyników'}
              </h2>
              <p>
                {initialSnapshot.characters.length === 0
                  ? 'Postacie pojawią się tutaj po ich utworzeniu albo po uzyskaniu dostępu do zespołu. Możesz nadal korzystać z niezależnych modułów, np. map.'
                  : 'Zmień zakres albo wpisaną frazę. Żadne dane nie zostały usunięte.'}
              </p>
            </div>
          )}
        </section>

        <div className="mock-notice">
          Postacie są osobnym modułem. Dostęp zespołowy nie oznacza własności postaci, a konto nie
          wymaga przypisania żadnej postaci.
        </div>
      </main>
    </AppShell>
  );
}
