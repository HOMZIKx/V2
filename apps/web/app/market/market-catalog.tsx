'use client';
import { useMemo, useState } from 'react';
import { gameItemCatalog, gameItemCategories, searchGameItems } from '../../src/item-catalog';
import { AppShell, Icon } from '../app-shell';

export function MarketCatalog() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const results = useMemo(() => searchGameItems(query, category).slice(0, 60), [query, category]);
  const selected = gameItemCatalog.find((item) => item.id === selectedId) ?? results[0] ?? null;
  return (
    <AppShell activeSection="market" viewerName="Mateusz">
      <main className="market-page" id="main-content">
        <header className="market-header">
          <div>
            <span className="eyebrow">Podgląd katalogu (nie Targ)</span>
            <h1>Katalog referencyjny</h1>
            <p>
              To nie jest Targ. Targ = ogłoszenia i ceny. Ten ekran jest tylko podglądem nazw z
              katalogu gry; karty EQ z ulepszeniem 0–9 dodajesz przy postaci.
            </p>
          </div>
        </header>
        <section className="market-layout">
          <section className="panel market-catalog-panel">
            <header>
              <label className="market-search">
                <Icon name="search" size={16} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Szukaj przedmiotu, bonusu lub ulepszacza…"
                  value={query}
                />
              </label>
              <select
                aria-label="Kategoria"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                <option value="all">Wszystkie kategorie</option>
                {gameItemCategories.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </header>
            <div className="market-items">
              {results.map((item) => (
                <button
                  aria-pressed={item.id === selected?.id}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <span className="market-item-image">
                    {item.sourceImageUrl ? (
                      <img alt="" src={item.sourceImageUrl} />
                    ) : (
                      <Icon name="equipment" size={18} />
                    )}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.category}</small>
                  </span>
                </button>
              ))}
              {results.length === 0 && <p>Brak wyników.</p>}
            </div>
          </section>
          <aside className="panel market-inspector">
            {selected ? (
              <>
                <span className="market-inspector-image">
                  {selected.sourceImageUrl ? (
                    <img alt="" src={selected.sourceImageUrl} />
                  ) : (
                    <Icon name="equipment" size={30} />
                  )}
                </span>
                <span className="section-kicker">{selected.category}</span>
                <h2>{selected.title}</h2>
                {selected.upgradeDescription && <p>{selected.upgradeDescription}</p>}
                {selected.wikiUrl && (
                  <a href={selected.wikiUrl} rel="noreferrer" target="_blank">
                    Otwórz opis Wiki <Icon name="chevron" size={13} />
                  </a>
                )}
                <div className="market-note">
                  Ceny, ogłoszenia i historia transakcji zostaną podpięte do API targu. Ten sam ID
                  przedmiotu będzie użyty w EQ oraz skanerze.
                </div>
              </>
            ) : (
              <p>Wybierz przedmiot.</p>
            )}
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
