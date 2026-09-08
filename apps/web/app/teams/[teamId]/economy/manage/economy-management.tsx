'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { usePlayerStore } from '../../../../../src/player-store-react';
import { AppShell } from '../../../../app-shell';
import { DiscordEntryScreen } from '../../../../discord-entry';
import { WorkspaceSectionNav } from '../../workspace-section-nav';
import { CompactAmountInput } from '../compact-amount-input';
import { EconomySubnav } from '../economy-subnav';
import styles from '../economy-tools.module.css';

type Currency = 'yang' | 'won' | 'gem';
type Tab = 'warehouse' | 'catalog' | 'prices' | 'history';
type LeftoverStatus = 'stored' | 'sold' | 'distributed' | 'consumed' | 'moved';
type HistoryRange = '7d' | '30d' | '90d' | 'all';

type CatalogItem = {
  id: string;
  canonicalName: string;
  category: string;
  imageUrl: string | null;
  lastPrice: {
    unitPrice: number;
    currency: Currency;
    createdAtIso: string;
  } | null;
};

type PriceRecord = {
  id: string;
  itemId: string;
  itemName: string;
  unitPrice: number;
  currency: Currency;
  averagePrice: number;
  sampleCount: number;
  createdBy: string;
  createdAtIso: string;
};

type Leftover = {
  dropItemId: string;
  sessionId: string;
  source: string;
  itemId: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  status: LeftoverStatus;
  occurredAtIso: string;
  updatedBy: string;
  updatedAtIso: string;
};

type Drop = {
  id: string;
  source: string;
  occurredAtIso: string;
  pileCount: number;
  items: Array<{
    displayName: string;
    totalQuantity: number;
    ourQuantity: number;
    unitPrice: number;
    currency: Currency;
  }>;
  money: Array<{
    currency: Currency;
    totalAmount: number;
    ourAmount: number;
    ourShareBasisPoints: number;
  }>;
  participants: Array<{ displayName: string }>;
};

const statuses: Array<{ value: LeftoverStatus; label: string }> = [
  { value: 'stored', label: 'W magazynie' },
  { value: 'sold', label: 'Sprzedane' },
  { value: 'distributed', label: 'Rozdane' },
  { value: 'consumed', label: 'Zużyte' },
  { value: 'moved', label: 'Przeniesione' },
];

function api(workspaceId: string, path: string): string {
  return `/player-team/v1/economy/workspaces/${encodeURIComponent(workspaceId)}/${path}`;
}

function money(value: number, currency: Currency): string {
  if (currency === 'won') return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} Won`;
  if (currency === 'gem') return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} GEM`;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kkk`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kk`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}k`;
  }
  return `${value.toLocaleString('pl-PL')} Yang`;
}

function sinceFor(range: HistoryRange): string | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function statusLabel(status: LeftoverStatus): string {
  return statuses.find((entry) => entry.value === status)?.label ?? status;
}

export function EconomyManagement() {
  const { teamId } = useParams<{ teamId: string }>();
  const { state, hydrated } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === teamId && !entry.archived) ?? null;

  const [tab, setTab] = useState<Tab>('warehouse');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [leftovers, setLeftovers] = useState<Leftover[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [query, setQuery] = useState('');
  const [leftoverFilter, setLeftoverFilter] = useState<'all' | LeftoverStatus>('all');
  const [historyRange, setHistoryRange] = useState<HistoryRange>('30d');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Pozostałe');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [priceValue, setPriceValue] = useState(0);
  const [priceCurrency, setPriceCurrency] = useState<Currency>('yang');

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Pozostałe');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newAlias, setNewAlias] = useState('');

  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeDuplicate, setMergeDuplicate] = useState('');

  const loadCatalog = useCallback(async () => {
    if (!workspace) return;
    const response = await fetch(api(workspace.id, `items?q=${encodeURIComponent(query)}`), {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Nie udało się pobrać katalogu przedmiotów.');
    setItems((await response.json()) as CatalogItem[]);
  }, [workspace, query]);

  const loadPrices = useCallback(async () => {
    if (!workspace) return;
    const response = await fetch(api(workspace.id, 'management/prices?limit=200'), {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Nie udało się pobrać historii cen.');
    setPrices((await response.json()) as PriceRecord[]);
  }, [workspace]);

  const loadLeftovers = useCallback(async () => {
    if (!workspace) return;
    const suffix = leftoverFilter === 'all' ? '' : `?status=${leftoverFilter}`;
    const response = await fetch(api(workspace.id, `management/leftovers${suffix}`), {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Nie udało się pobrać magazynu.');
    setLeftovers((await response.json()) as Leftover[]);
  }, [workspace, leftoverFilter]);

  const loadHistory = useCallback(async () => {
    if (!workspace) return;
    const since = sinceFor(historyRange);
    const suffix = since ? `?since=${encodeURIComponent(since)}` : '';
    const response = await fetch(api(workspace.id, `drops${suffix}`), { cache: 'no-store' });
    if (!response.ok) throw new Error('Nie udało się pobrać pełnej historii dropów.');
    setDrops((await response.json()) as Drop[]);
  }, [workspace, historyRange]);

  const refresh = useCallback(async () => {
    if (!workspace) return;
    setError('');
    try {
      await Promise.all([loadCatalog(), loadPrices(), loadLeftovers(), loadHistory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd pobierania ekonomii.');
    }
  }, [workspace, loadCatalog, loadPrices, loadLeftovers, loadHistory]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const latestGlobalPriceFor = useCallback(
    (itemId: string) => prices.find((row) => row.itemId === itemId) ?? null,
    [prices],
  );

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.canonicalName);
    setEditCategory(selected.category);
    setEditImageUrl(selected.imageUrl ?? '');
    setEditAlias('');
    const latest = latestGlobalPriceFor(selected.id);
    setPriceValue(latest?.unitPrice ?? 0);
    setPriceCurrency(latest?.currency ?? 'yang');
  }, [selected, latestGlobalPriceFor]);

  useEffect(() => {
    void loadLeftovers().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Błąd magazynu.');
    });
  }, [loadLeftovers]);

  useEffect(() => {
    void loadHistory().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Błąd historii.');
    });
  }, [loadHistory]);

  const stored = leftovers.filter((row) => row.status === 'stored');
  const storedYang = stored
    .filter((row) => row.currency === 'yang')
    .reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const totalPriceItems = new Set(prices.map((row) => row.itemId)).size;

  async function updateLeftover(row: Leftover, status: LeftoverStatus) {
    if (!workspace) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspace.id, `management/leftovers/${row.dropItemId}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Nie udało się zmienić statusu. Zmiana magazynu wymaga ownera zespołu.');
      setNotice(`${row.itemName}: ${statusLabel(status)}.`);
      await loadLeftovers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd aktualizacji magazynu.');
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !selected) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspace.id, `items/${selected.id}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          canonicalName: editName.trim(),
          category: editCategory.trim() || 'Pozostałe',
          imageUrl: editImageUrl.trim() || null,
          alias: editAlias.trim() || null,
        }),
      });
      if (!response.ok) throw new Error('Edycja globalnego przedmiotu wymaga ownera zespołu.');
      setNotice('Przedmiot zaktualizowany.');
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd edycji przedmiotu.');
    } finally {
      setBusy(false);
    }
  }

  async function createItem(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !newName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspace.id, 'items'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          canonicalName: newName.trim(),
          category: newCategory.trim() || 'Pozostałe',
          imageUrl: newImageUrl.trim() || null,
          alias: newAlias.trim() || null,
        }),
      });
      if (!response.ok) throw new Error('Nie udało się dodać przedmiotu. Sprawdź, czy nie istnieje już pod podobną nazwą.');
      setNewName('');
      setNewImageUrl('');
      setNewAlias('');
      setNotice('Nowy przedmiot dodany do wspólnej bazy.');
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd dodawania przedmiotu.');
    } finally {
      setBusy(false);
    }
  }

  async function addPrice(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !selected || priceValue <= 0) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspace.id, 'prices'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId: selected.id,
          unitPrice: priceValue,
          currency: priceCurrency,
        }),
      });
      if (!response.ok) throw new Error('Nie udało się zapisać ceny.');
      setNotice(`Cena ${selected.canonicalName} zapisana do wspólnej historii rynku.`);
      await Promise.all([loadPrices(), loadCatalog()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu ceny.');
    } finally {
      setBusy(false);
    }
  }

  async function mergeItems(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !mergeTarget || !mergeDuplicate || mergeTarget === mergeDuplicate) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspace.id, 'management/merge-items'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetItemId: mergeTarget, duplicateItemId: mergeDuplicate }),
      });
      if (!response.ok) throw new Error('Scalanie wymaga ownera zespołu albo wskazano nieprawidłowe rekordy.');
      setMergeDuplicate('');
      setNotice('Duplikat scalony. Ceny, aliasy i historyczne dropy zostały przepięte do rekordu głównego.');
      await Promise.all([loadCatalog(), loadPrices()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd scalania.');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) {
    return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  }
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;
  if (!workspace) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className={styles.page}><section className={styles.panel}><h1>Nie znaleziono zespołu</h1></section></main>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className={styles.page} id="main-content">
          <section className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>Zespół · Ekonomia · Zarządzanie</span>
              <h1>{workspace.name}</h1>
              <p>Magazyn resztek, wspólna baza przedmiotów, ceny i pełna historia.</p>
            </div>
            <button className={styles.buttonGhost} disabled={busy} onClick={() => void refresh()} type="button">
              Odśwież dane
            </button>
          </section>

          <WorkspaceSectionNav active="economy" workspaceId={workspace.id} />

          <section className={styles.metrics}>
            <article className={styles.metric}>
              <span>Pozycje w magazynie</span>
              <strong>{stored.length}</strong>
            </article>
            <article className={styles.metric}>
              <span>Szacowana wartość magazynu · Yang</span>
              <strong>{money(storedYang, 'yang')}</strong>
            </article>
            <article className={styles.metric}>
              <span>Przedmioty z historią cen</span>
              <strong>{totalPriceItems}</strong>
            </article>
          </section>

          {error ? <p className={styles.error}>{error}</p> : null}
          {notice ? <p className={styles.notice}>{notice}</p> : null}

          <div className={styles.tabs}>
            <button data-active={tab === 'warehouse'} onClick={() => setTab('warehouse')} type="button">Magazyn</button>
            <button data-active={tab === 'catalog'} onClick={() => setTab('catalog')} type="button">Baza przedmiotów</button>
            <button data-active={tab === 'prices'} onClick={() => setTab('prices')} type="button">Historia cen</button>
            <button data-active={tab === 'history'} onClick={() => setTab('history')} type="button">Historia dropów</button>
          </div>

          {tab === 'warehouse' ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Magazyn nierozdzielonych przedmiotów</h2>
                  <small>Resztki z podziałów nie znikają. Można je później oznaczyć jako sprzedane, rozdane, zużyte lub przeniesione.</small>
                </div>
                <label className={styles.field}>
                  Status
                  <select value={leftoverFilter} onChange={(event) => setLeftoverFilter(event.target.value as typeof leftoverFilter)}>
                    <option value="all">Wszystkie</option>
                    {statuses.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                  </select>
                </label>
              </div>
              {leftovers.length ? (
                <div className={styles.cardGrid}>
                  {leftovers.map((row) => (
                    <article className={styles.card} key={row.dropItemId}>
                      <header>
                        <div>
                          <h3>{row.itemName} × {row.quantity}</h3>
                          <small>{row.source} · {new Date(row.occurredAtIso).toLocaleString('pl-PL')}</small>
                        </div>
                        <span className={styles.status}>{statusLabel(row.status)}</span>
                      </header>
                      <p>Wartość szacowana: <strong className={styles.value}>{money(row.quantity * row.unitPrice, row.currency)}</strong></p>
                      <label className={styles.field}>
                        Zmień status
                        <select
                          disabled={busy}
                          value={row.status}
                          onChange={(event) => void updateLeftover(row, event.target.value as LeftoverStatus)}
                        >
                          {statuses.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                        </select>
                      </label>
                    </article>
                  ))}
                </div>
              ) : <p className={styles.empty}>Brak pozycji dla wybranego filtra.</p>}
            </section>
          ) : null}

          {tab === 'catalog' ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Wspólna baza przedmiotów</h2>
                  <small>Wyszukaj podobne rekordy przed dodaniem nowego. Owner może poprawiać globalne wpisy i scalać duplikaty.</small>
                </div>
              </div>
              <div className={styles.toolbar}>
                <label className={styles.field}>Szukaj po nazwie / aliasie<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                <button className={styles.button} onClick={() => void loadCatalog()} type="button">Szukaj</button>
                <button className={styles.buttonGhost} onClick={() => { setQuery(''); void loadCatalog(); }} type="button">Wyczyść</button>
              </div>

              <div className={styles.cardGrid}>
                {items.map((item) => {
                  const latest = latestGlobalPriceFor(item.id);
                  return (
                    <button
                      className={styles.card}
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      type="button"
                    >
                      <span className={styles.itemHead}>
                        <span className={styles.image} style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined} />
                        <span>
                          <strong>{item.canonicalName}</strong><br />
                          <small>{item.category}{latest ? ` · ostatnio ${money(latest.unitPrice, latest.currency)}` : ' · brak ceny'}</small>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.cardGrid} style={{ marginTop: 14 }}>
                <form className={styles.card} onSubmit={(event) => void saveItem(event)}>
                  <h3>Edytuj wybrany przedmiot</h3>
                  <p className={styles.muted}>{selected ? selected.canonicalName : 'Najpierw wybierz rekord z listy.'}</p>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>Nazwa<input disabled={!selected} value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
                    <label className={styles.field}>Kategoria<input disabled={!selected} value={editCategory} onChange={(event) => setEditCategory(event.target.value)} /></label>
                    <label className={styles.field}>Ilustracja · URL<input disabled={!selected} placeholder="https://…" value={editImageUrl} onChange={(event) => setEditImageUrl(event.target.value)} /></label>
                    <label className={styles.field}>Dodaj alias<input disabled={!selected} placeholder="inna nazwa / literówka" value={editAlias} onChange={(event) => setEditAlias(event.target.value)} /></label>
                  </div>
                  <button className={styles.button} disabled={!selected || busy} type="submit">Zapisz zmiany</button>
                </form>

                <form className={styles.card} onSubmit={(event) => void createItem(event)}>
                  <h3>Nowy nierozpoznany przedmiot</h3>
                  <p className={styles.muted}>Po utworzeniu trafia do wspólnej bazy i może być rozpoznawany następnym razem.</p>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>Nazwa<input value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
                    <label className={styles.field}>Kategoria<input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} /></label>
                    <label className={styles.field}>Ilustracja · URL<input placeholder="https://…" value={newImageUrl} onChange={(event) => setNewImageUrl(event.target.value)} /></label>
                    <label className={styles.field}>Alias<input value={newAlias} onChange={(event) => setNewAlias(event.target.value)} /></label>
                  </div>
                  <button className={styles.button} disabled={!newName.trim() || busy} type="submit">Dodaj do bazy</button>
                </form>
              </div>

              <form className={styles.card} style={{ marginTop: 14 }} onSubmit={(event) => void mergeItems(event)}>
                <h3>Scal duplikaty</h3>
                <p className={styles.muted}>Rekord główny zostaje. Alias, ceny i historyczne dropy duplikatu zostaną przepięte do niego.</p>
                <div className={styles.inline}>
                  <label className={styles.field}>Rekord główny<select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Wybierz…</option>{items.map((item) => <option key={item.id} value={item.id}>{item.canonicalName}</option>)}</select></label>
                  <label className={styles.field}>Duplikat do usunięcia<select value={mergeDuplicate} onChange={(event) => setMergeDuplicate(event.target.value)}><option value="">Wybierz…</option>{items.map((item) => <option key={item.id} value={item.id}>{item.canonicalName}</option>)}</select></label>
                  <button className={styles.buttonGhost} disabled={!mergeTarget || !mergeDuplicate || mergeTarget === mergeDuplicate || busy} type="submit">Scal rekordy</button>
                </div>
              </form>
            </section>
          ) : null}

          {tab === 'prices' ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>Historia cen · baza ogólna</h2><small>Każda cena ma datę i autora. Ceny wpisane w dropie zapisują się automatycznie i są wspólne dla wszystkich zespołów.</small></div></div>
              <form className={styles.inline} onSubmit={(event) => void addPrice(event)}>
                <label className={styles.field}>Przedmiot<select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}><option value="">Wybierz…</option>{items.map((item) => <option key={item.id} value={item.id}>{item.canonicalName}</option>)}</select></label>
                <label className={styles.field}>Cena<CompactAmountInput value={priceValue} onValueChange={setPriceValue} /></label>
                <label className={styles.field}>Waluta<select value={priceCurrency} onChange={(event) => setPriceCurrency(event.target.value as Currency)}><option value="yang">Yang</option><option value="won">Won</option><option value="gem">GEM</option></select></label>
                <button className={styles.button} disabled={!selected || priceValue <= 0 || busy} type="submit">Zapisz cenę</button>
              </form>
              <div className={styles.list} style={{ marginTop: 16 }}>
                {prices.map((row) => (
                  <div className={styles.row} key={row.id}>
                    <span><strong>{row.itemName}</strong><br /><small>{new Date(row.createdAtIso).toLocaleString('pl-PL')}</small></span>
                    <strong>{money(row.unitPrice, row.currency)}</strong>
                    <span className={styles.muted}>średnia: {money(row.averagePrice, row.currency)} · {row.sampleCount} wpisów</span>
                    <span className={styles.muted}>wprowadził: {row.createdBy}</span>
                  </div>
                ))}
                {!prices.length ? <p className={styles.empty}>Brak zapisanych cen.</p> : null}
              </div>
            </section>
          ) : null}

          {tab === 'history' ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><h2>Historia dropów</h2><small>Ta sekcja nie jest ograniczona do bieżącego tygodnia.</small></div>
                <label className={styles.field}>Zakres<select value={historyRange} onChange={(event) => setHistoryRange(event.target.value as HistoryRange)}><option value="7d">7 dni</option><option value="30d">30 dni</option><option value="90d">90 dni</option><option value="all">Cały okres</option></select></label>
              </div>
              <div className={styles.list}>
                {drops.map((drop) => {
                  const itemYang = drop.items.filter((item) => item.currency === 'yang').reduce((sum, item) => sum + item.ourQuantity * item.unitPrice, 0);
                  const cashYang = drop.money.filter((row) => row.currency === 'yang').reduce((sum, row) => sum + row.ourAmount, 0);
                  return (
                    <article className={styles.card} key={drop.id}>
                      <header><div><h3>{drop.source}</h3><small>{new Date(drop.occurredAtIso).toLocaleString('pl-PL')} · {drop.participants.map((row) => row.displayName).join(', ') || 'bez listy uczestników'}</small></div><strong className={styles.value}>{money(itemYang + cashYang, 'yang')}</strong></header>
                      <p>{drop.items.map((item) => `${item.displayName} ${item.ourQuantity}/${item.totalQuantity}`).join(' · ') || 'bez przedmiotów'}</p>
                    </article>
                  );
                })}
                {!drops.length ? <p className={styles.empty}>Brak dropów w wybranym zakresie.</p> : null}
              </div>
            </section>
          ) : null}
        </main>
      </AppShell>
      <EconomySubnav />
    </>
  );
}
