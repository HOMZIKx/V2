'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { usePlayerStore } from '../../../../../src/player-store-react';
import { AppShell } from '../../../../app-shell';
import { DiscordEntryScreen } from '../../../../discord-entry';
import { WorkspaceSectionNav } from '../../workspace-section-nav';
import { EconomySubnav } from '../economy-subnav';
import styles from '../economy-tools.module.css';

type Currency = 'yang' | 'won' | 'gem';
type Range = '7d' | '30d' | '90d' | 'all';

type Drop = {
  id: string;
  source: string;
  occurredAtIso: string;
  items: Array<{
    displayName: string;
    ourQuantity: number;
    unitPrice: number;
    currency: Currency;
  }>;
  money: Array<{
    currency: Currency;
    ourAmount: number;
  }>;
  participants: Array<{
    participantId: string;
    displayName: string;
    isTeamMember: boolean;
  }>;
};

type Expense = {
  id: string;
  dropSessionId: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  ourShareBasisPoints: number;
  occurredAtIso: string;
};

type SourceRow = {
  source: string;
  runs: number;
  gross: number;
  costs: number;
  net: number;
};

function api(workspaceId: string, path: string): string {
  return `/player-team/v1/economy/workspaces/${encodeURIComponent(workspaceId)}/${path}`;
}

function sinceFor(range: Range): string | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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

function dropGross(drop: Drop, currency: Currency): number {
  const items = drop.items
    .filter((item) => item.currency === currency)
    .reduce((sum, item) => sum + item.ourQuantity * item.unitPrice, 0);
  const cash = drop.money
    .filter((row) => row.currency === currency)
    .reduce((sum, row) => sum + row.ourAmount, 0);
  return items + cash;
}

function expenseValue(expense: Expense): number {
  return (expense.quantity * expense.unitPrice * expense.ourShareBasisPoints) / 10_000;
}

export function EconomyAnalysis() {
  const { teamId } = useParams<{ teamId: string }>();
  const { state, hydrated } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === teamId && !entry.archived) ?? null;

  const [range, setRange] = useState<Range>('30d');
  const [drops, setDrops] = useState<Drop[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [costDropId, setCostDropId] = useState('');
  const [costLabel, setCostLabel] = useState('');
  const [costQty, setCostQty] = useState(1);
  const [costUnitPrice, setCostUnitPrice] = useState(0);
  const [costCurrency, setCostCurrency] = useState<Currency>('yang');
  const [costShare, setCostShare] = useState(100);

  const load = useCallback(async () => {
    if (!workspace) return;
    setError('');
    const since = sinceFor(range);
    const suffix = since ? `?since=${encodeURIComponent(since)}` : '';
    try {
      const [dropResponse, expenseResponse] = await Promise.all([
        fetch(api(workspace.id, `drops${suffix}`), { cache: 'no-store' }),
        fetch(api(workspace.id, `expenses${suffix}`), { cache: 'no-store' }),
      ]);
      if (!dropResponse.ok || !expenseResponse.ok) throw new Error('Nie udało się pobrać danych rentowności.');
      setDrops((await dropResponse.json()) as Drop[]);
      setExpenses((await expenseResponse.json()) as Expense[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd analizy ekonomii.');
    }
  }, [workspace, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const directExpenses = useMemo(() => expenses.filter((expense) => expense.dropSessionId), [expenses]);
  const generalExpenses = useMemo(() => expenses.filter((expense) => !expense.dropSessionId), [expenses]);

  const grossYang = useMemo(() => drops.reduce((sum, drop) => sum + dropGross(drop, 'yang'), 0), [drops]);
  const costYang = useMemo(
    () => expenses.filter((expense) => expense.currency === 'yang').reduce((sum, expense) => sum + expenseValue(expense), 0),
    [expenses],
  );

  const sourceRows = useMemo<SourceRow[]>(() => {
    const map = new Map<string, SourceRow>();
    for (const drop of drops) {
      const row = map.get(drop.source) ?? { source: drop.source, runs: 0, gross: 0, costs: 0, net: 0 };
      row.runs += 1;
      row.gross += dropGross(drop, 'yang');
      map.set(drop.source, row);
    }
    for (const expense of directExpenses) {
      if (expense.currency !== 'yang' || !expense.dropSessionId) continue;
      const drop = drops.find((entry) => entry.id === expense.dropSessionId);
      if (!drop) continue;
      const row = map.get(drop.source);
      if (row) row.costs += expenseValue(expense);
    }
    for (const row of map.values()) row.net = row.gross - row.costs;
    return Array.from(map.values()).sort((left, right) => right.net - left.net);
  }, [drops, directExpenses]);

  const runRows = useMemo(
    () => drops.map((drop) => {
      const gross = dropGross(drop, 'yang');
      const costs = directExpenses
        .filter((expense) => expense.dropSessionId === drop.id && expense.currency === 'yang')
        .reduce((sum, expense) => sum + expenseValue(expense), 0);
      return { drop, gross, costs, net: gross - costs };
    }).sort((left, right) => right.net - left.net),
    [drops, directExpenses],
  );

  const playerRows = useMemo(() => {
    const map = new Map<string, { name: string; runs: number }>();
    for (const drop of drops) {
      for (const participant of drop.participants.filter((entry) => entry.isTeamMember)) {
        const current = map.get(participant.participantId) ?? { name: participant.displayName, runs: 0 };
        current.runs += 1;
        map.set(participant.participantId, current);
      }
    }
    return Array.from(map.values()).sort((left, right) => right.runs - left.runs);
  }, [drops]);

  const itemRows = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; value: number }>();
    for (const drop of drops) {
      for (const item of drop.items.filter((entry) => entry.currency === 'yang')) {
        const key = item.displayName.toLocaleLowerCase('pl-PL');
        const current = map.get(key) ?? { name: item.displayName, quantity: 0, value: 0 };
        current.quantity += item.ourQuantity;
        current.value += item.ourQuantity * item.unitPrice;
        map.set(key, current);
      }
    }
    return Array.from(map.values()).sort((left, right) => right.value - left.value).slice(0, 20);
  }, [drops]);

  async function addRunCost(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !costDropId || !costLabel.trim() || costUnitPrice <= 0) return;
    const drop = drops.find((entry) => entry.id === costDropId);
    if (!drop) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspace.id, 'expenses'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dropSessionId: costDropId,
          label: costLabel.trim(),
          expenseType: 'other',
          quantity: costQty,
          unitPrice: costUnitPrice,
          currency: costCurrency,
          ourShareBasisPoints: Math.round(costShare * 100),
          occurredAtIso: drop.occurredAtIso,
        }),
      });
      if (!response.ok) throw new Error('Serwer odrzucił koszt wyprawy.');
      setCostLabel('');
      setCostUnitPrice(0);
      setNotice(`Koszt przypisany do wyprawy: ${drop.source}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu kosztu wyprawy.');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;
  if (!workspace) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className={styles.page}><section className={styles.panel}><h1>Nie znaleziono zespołu</h1></section></main>
      </AppShell>
    );
  }

  const generalYang = generalExpenses
    .filter((expense) => expense.currency === 'yang')
    .reduce((sum, expense) => sum + expenseValue(expense), 0);

  return (
    <>
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className={styles.page} id="main-content">
          <section className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>Zespół · Ekonomia · Rentowność</span>
              <h1>{workspace.name}</h1>
              <p>Wynik wypraw, koszty przypisane do konkretnego dropu, źródła zarobku i aktywność zespołu.</p>
            </div>
            <label className={styles.field}>
              Zakres
              <select value={range} onChange={(event) => setRange(event.target.value as Range)}>
                <option value="7d">7 dni</option>
                <option value="30d">30 dni</option>
                <option value="90d">90 dni</option>
                <option value="all">Cały okres</option>
              </select>
            </label>
          </section>

          <WorkspaceSectionNav active="economy" workspaceId={workspace.id} />

          <section className={styles.metrics}>
            <article className={styles.metric}><span>Wartość dropu · Yang</span><strong>{money(grossYang, 'yang')}</strong></article>
            <article className={styles.metric}><span>Koszty · Yang</span><strong>{money(costYang, 'yang')}</strong></article>
            <article className={styles.metric}><span>Wynik szacowany · Yang</span><strong>{money(grossYang - costYang, 'yang')}</strong></article>
          </section>

          {error ? <p className={styles.error}>{error}</p> : null}
          {notice ? <p className={styles.notice}>{notice}</p> : null}

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><h2>Przypisz koszt do konkretnej wyprawy</h2><small>Takie koszty odejmują się od wyniku danej wyprawy i danego źródła. Koszty ogólne pozostają osobno.</small></div>
            </div>
            <form className={styles.inline} onSubmit={(event) => void addRunCost(event)}>
              <label className={styles.field}>Wyprawa<select value={costDropId} onChange={(event) => setCostDropId(event.target.value)}><option value="">Wybierz…</option>{drops.map((drop) => <option key={drop.id} value={drop.id}>{new Date(drop.occurredAtIso).toLocaleString('pl-PL')} · {drop.source}</option>)}</select></label>
              <label className={styles.field}>Koszt<input placeholder="np. przepustki" value={costLabel} onChange={(event) => setCostLabel(event.target.value)} /></label>
              <label className={styles.field}>Ilość<input min="0.0001" step="0.0001" type="number" value={costQty} onChange={(event) => setCostQty(Math.max(0.0001, Number(event.target.value)))} /></label>
              <label className={styles.field}>Cena / jednostkę<input min="0" step="0.01" type="number" value={costUnitPrice} onChange={(event) => setCostUnitPrice(Math.max(0, Number(event.target.value)))} /></label>
              <label className={styles.field}>Waluta<select value={costCurrency} onChange={(event) => setCostCurrency(event.target.value as Currency)}><option value="yang">Yang</option><option value="won">Won</option><option value="gem">GEM</option></select></label>
              <label className={styles.field}>Nasza część %<input min="0" max="100" step="0.01" type="number" value={costShare} onChange={(event) => setCostShare(Math.max(0, Math.min(100, Number(event.target.value))))} /></label>
              <button className={styles.button} disabled={busy || !costDropId || !costLabel.trim() || costUnitPrice <= 0} type="submit">Zapisz koszt wyprawy</button>
            </form>
          </section>

          <div className={styles.cardGrid} style={{ marginTop: 14 }}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>Rentowność źródeł · Yang</h2><small>Koszty ogólne nie są arbitralnie rozrzucane na wyprawy.</small></div></div>
              <div className={styles.list}>
                {sourceRows.map((row, index) => (
                  <div className={styles.row} key={row.source}>
                    <span><strong>#{index + 1} {row.source}</strong><br /><small>{row.runs} wypraw</small></span>
                    <span>drop<br /><strong>{money(row.gross, 'yang')}</strong></span>
                    <span>koszty wypraw<br /><strong>{money(row.costs, 'yang')}</strong></span>
                    <span>netto<br /><strong>{money(row.net, 'yang')}</strong></span>
                  </div>
                ))}
                {!sourceRows.length ? <p className={styles.empty}>Brak danych.</p> : null}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>Najlepsze wyprawy · Yang</h2><small>Wartość naszej części dropu minus koszty przypisane do tej konkretnej wyprawy.</small></div></div>
              <div className={styles.list}>
                {runRows.slice(0, 20).map((row, index) => (
                  <div className={styles.row} key={row.drop.id}>
                    <span><strong>#{index + 1} {row.drop.source}</strong><br /><small>{new Date(row.drop.occurredAtIso).toLocaleString('pl-PL')}</small></span>
                    <span>drop<br /><strong>{money(row.gross, 'yang')}</strong></span>
                    <span>koszt<br /><strong>{money(row.costs, 'yang')}</strong></span>
                    <span>netto<br /><strong>{money(row.net, 'yang')}</strong></span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className={styles.cardGrid} style={{ marginTop: 14 }}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>Najcenniejsze przedmioty · Yang</h2><small>Łączna ilość naszej części i jej wartość z zapisanych wycen.</small></div></div>
              <div className={styles.list}>
                {itemRows.map((item, index) => (
                  <div className={styles.row} key={item.name}>
                    <span><strong>#{index + 1} {item.name}</strong></span>
                    <span>{item.quantity} szt.</span>
                    <strong>{money(item.value, 'yang')}</strong>
                    <span />
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>Uczestnictwo członków</h2><small>To ranking liczby wspólnych wypraw, nie „zarobku gracza”.</small></div></div>
              <div className={styles.list}>
                {playerRows.map((player, index) => (
                  <div className={styles.row} key={player.name}>
                    <span><strong>#{index + 1} {player.name}</strong></span>
                    <strong>{player.runs} wypraw</strong>
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className={styles.panel} style={{ marginTop: 14 }}>
            <div className={styles.panelHeader}><div><h2>Koszty ogólne</h2><small>Nie są przypisane do jednej wyprawy i dlatego nie fałszują rankingu źródeł.</small></div><strong className={styles.value}>{money(generalYang, 'yang')}</strong></div>
            <div className={styles.list}>
              {generalExpenses.map((expense) => (
                <div className={styles.row} key={expense.id}>
                  <span><strong>{expense.label}</strong><br /><small>{new Date(expense.occurredAtIso).toLocaleString('pl-PL')}</small></span>
                  <strong>{money(expenseValue(expense), expense.currency)}</strong>
                  <span className={styles.status}>ogólny</span>
                  <span />
                </div>
              ))}
              {!generalExpenses.length ? <p className={styles.empty}>Brak kosztów ogólnych w tym zakresie.</p> : null}
            </div>
          </section>
        </main>
      </AppShell>
      <EconomySubnav />
    </>
  );
}
