'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';

import { resolveAiObservationFeedback } from '../../../src/ai-observation-feedback';
import { gameItemCatalog } from '../../../src/item-catalog';
import { usePlayerStore } from '../../../src/player-store-react';
import { AppShell } from '../../app-shell';
import { DiscordEntryScreen } from '../../discord-entry';
import { EconomyScopeNav } from '../economy-scope-nav';
import styles from '../economy.module.css';

type Currency = 'yang' | 'won' | 'gem';
type Summary = {
  runCount: number;
  totals: Array<{
    currency: Currency;
    gross: number;
    itemGross: number;
    moneyGross: number;
    costs: number;
    net: number;
  }>;
};
type DropItem = {
  id: string;
  displayName: string;
  totalQuantity: number;
  ourQuantity: number;
  unitPrice: number;
  currency: Currency;
  aiConfidence?: number | null;
};
type Drop = {
  id: string;
  source: string;
  occurredAtIso: string;
  items: DropItem[];
  money: Array<{ id: string; currency: Currency; totalAmount: number; ourAmount: number }>;
};
type Expense = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  occurredAtIso: string;
};
type DraftItem = {
  key: string;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  confidence: number | null;
};
type AiItem = {
  recognizedName: string;
  quantity: number;
  confidence: number;
  catalogMatch: { name: string } | null;
};

const api = (path: string) => `/player-team/v1/economy/private/${path}`;

function weekStartIso(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, 0, 0, 0, 0).toISOString();
}

function money(value: number, currency: Currency): string {
  const suffix = currency === 'yang' ? 'Yang' : currency === 'won' ? 'Won' : 'GEM';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (currency === 'yang' && abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kkk`;
  if (currency === 'yang' && abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kk`;
  return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} ${suffix}`;
}

export default function PrivateEconomyPage() {
  const { state, hydrated } = usePlayerStore();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dropOpen, setDropOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [source, setSource] = useState('Wyprawa');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [moneyAmount, setMoneyAmount] = useState(0);
  const [moneyCurrency, setMoneyCurrency] = useState<Currency>('yang');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [costLabel, setCostLabel] = useState('');
  const [costQuantity, setCostQuantity] = useState(1);
  const [costUnitPrice, setCostUnitPrice] = useState(0);
  const [costCurrency, setCostCurrency] = useState<Currency>('yang');

  const catalogNames = useMemo(
    () => Array.from(new Set(gameItemCatalog.map((item) => item.title.trim()).filter(Boolean))).slice(0, 2500),
    [],
  );

  const load = useCallback(async () => {
    const since = encodeURIComponent(weekStartIso());
    setError('');
    try {
      const [summaryResponse, dropsResponse, expensesResponse] = await Promise.all([
        fetch(api(`summary?since=${since}`), { cache: 'no-store' }),
        fetch(api(`drops?since=${since}`), { cache: 'no-store' }),
        fetch(api(`expenses?since=${since}`), { cache: 'no-store' }),
      ]);
      if (!summaryResponse.ok || !dropsResponse.ok || !expensesResponse.ok) {
        throw new Error('Nie udało się pobrać prywatnej ekonomii.');
      }
      setSummary((await summaryResponse.json()) as Summary);
      setDrops((await dropsResponse.json()) as Drop[]);
      setExpenses((await expensesResponse.json()) as Expense[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd pobierania danych.');
    }
  }, []);

  useEffect(() => {
    if (hydrated && state.authStatus === 'authenticated') void load();
  }, [hydrated, load, state.authStatus]);

  const yang = summary?.totals.find((row) => row.currency === 'yang') ?? {
    gross: 0,
    itemGross: 0,
    moneyGross: 0,
    costs: 0,
    net: 0,
    currency: 'yang' as const,
  };

  const addManualItem = () => {
    setItems((current) => [
      ...current,
      { key: `manual-${Date.now()}`, name: '', quantity: 1, unitPrice: 0, currency: 'yang', confidence: null },
    ]);
  };

  const patchItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };

  const recognize = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Wybierz plik PNG, JPG/JPEG albo WEBP.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Nie udało się odczytać obrazu.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/team-economy/recognize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        analysisId?: string | null;
        items?: AiItem[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(body.error === 'ai_not_configured' ? 'AI nie jest skonfigurowane w tym wdrożeniu.' : 'AI nie rozpoznało screena.');
      }
      setAnalysisId(typeof body.analysisId === 'string' && body.analysisId.trim() ? body.analysisId : null);
      setItems(body.items.map((item, index) => ({
        key: `ai-${Date.now()}-${index}`,
        name: item.catalogMatch?.name ?? item.recognizedName,
        quantity: Math.max(1, Math.floor(item.quantity)),
        unitPrice: 0,
        currency: 'yang',
        confidence: item.confidence,
      })));
      setNotice(`AI (beta) rozpoznało ${body.items.length} pozycji. Zweryfikuj każdą nazwę i ilość przed zapisem.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd AI.');
    } finally {
      setBusy(false);
    }
  };

  const submitDrop = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (items.length === 0 && moneyAmount <= 0) {
      setError('Dodaj przedmiot albo kwotę pieniędzy.');
      return;
    }
    if (items.some((item) => item.name.trim().length < 1)) {
      setError('Każdy przedmiot musi mieć nazwę.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('drops'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: source.trim() || 'Wyprawa',
          occurredAtIso: new Date().toISOString(),
          ourShareBasisPoints: 10_000,
          pileCount: 1,
          splitMode: 'max_equal',
          participants: [],
          items: items.map((item) => ({
            itemId: null,
            displayName: item.name.trim(),
            totalQuantity: item.quantity,
            ourQuantity: item.quantity,
            unitPrice: item.unitPrice,
            currency: item.currency,
            aiConfidence: item.confidence,
          })),
          money: moneyAmount > 0 ? [{ currency: moneyCurrency, totalAmount: moneyAmount, ourShareBasisPoints: 10_000 }] : [],
        }),
      });
      if (!response.ok) throw new Error('Serwer odrzucił zapis prywatnego dropu.');
      if (analysisId) {
        void resolveAiObservationFeedback(analysisId, {
          items: items.map((item) => ({ name: item.name.trim(), quantity: item.quantity })),
        });
      }
      setItems([]);
      setMoneyAmount(0);
      setAnalysisId(null);
      setDropOpen(false);
      setNotice('Drop zapisany w prywatnej ekonomii.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd zapisu dropu.');
    } finally {
      setBusy(false);
    }
  };

  const submitCost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!costLabel.trim()) {
      setError('Podaj nazwę kosztu.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('expenses'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: costLabel.trim(),
          expenseType: 'other',
          quantity: costQuantity,
          unitPrice: costUnitPrice,
          currency: costCurrency,
          ourShareBasisPoints: 10_000,
          occurredAtIso: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error('Serwer odrzucił koszt.');
      setCostLabel('');
      setCostUnitPrice(0);
      setCostOpen(false);
      setNotice('Koszt zapisany w prywatnej ekonomii.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Błąd zapisu kosztu.');
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;

  return (
    <AppShell activeSection="economy" viewerName={state.viewer.displayName}>
      <main className={styles.page} id="main-content">
        <EconomyScopeNav active="private" />
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Ekonomia · Prywatna</span>
            <h1>Moja ekonomia</h1>
            <p>Dropy, koszty i wynik należą wyłącznie do zalogowanego konta. Ten zakres nie jest agregowany z ekonomią zespołu.</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => setDropOpen((value) => !value)} type="button">+ Dodaj drop</button>
            <button className={styles.secondary} onClick={() => setCostOpen((value) => !value)} type="button">+ Koszt</button>
          </div>
        </section>

        <section className={styles.metrics}>
          <article className={styles.metric}><span>Przychód · tydzień</span><strong>{money(yang.gross, 'yang')}</strong><small>przedmioty {money(yang.itemGross, 'yang')} · kasa {money(yang.moneyGross, 'yang')}</small></article>
          <article className={styles.metric}><span>Koszty</span><strong>{money(yang.costs, 'yang')}</strong></article>
          <article className={styles.metric}><span>Wynik netto</span><strong>{money(yang.net, 'yang')}</strong></article>
          <article className={styles.metric}><span>Wyprawy</span><strong>{summary?.runCount ?? 0}</strong></article>
        </section>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {notice ? <p className={styles.notice}>{notice}</p> : null}

        {dropOpen ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><h2>Nowy prywatny drop</h2><p className={styles.muted}>Dodaj ręcznie albo użyj rozpoznawania screena.</p></div>
              <span className={styles.beta}>AI (beta)</span>
            </div>
            <p className={styles.aiWarning}>AI może się pomylić. Zawsze sprawdź nazwy, ilości i wartości przed zapisaniem wyniku.</p>
            <form onSubmit={submitDrop}>
              <div className={styles.grid}>
                <label className={styles.field}>Źródło<input onChange={(event) => setSource(event.target.value)} value={source} /></label>
                <label className={styles.field}>Screen dropu · AI (beta)<input accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => void recognize(event)} type="file" /></label>
              </div>
              <div className={styles.actions} style={{ marginTop: 12 }}>
                <button className={styles.secondary} onClick={addManualItem} type="button">+ Przedmiot ręcznie</button>
              </div>
              <datalist id="private-economy-catalog">{catalogNames.map((name) => <option key={name} value={name} />)}</datalist>
              <div className={styles.itemRows}>
                {items.map((item) => (
                  <div className={styles.itemRow} key={item.key}>
                    <label className={styles.field}>Przedmiot<input list="private-economy-catalog" onChange={(event) => patchItem(item.key, { name: event.target.value })} value={item.name} />{item.confidence !== null ? <small>AI (beta): {Math.round(item.confidence * 100)}%</small> : null}</label>
                    <label className={styles.field}>Ilość<input min="1" onChange={(event) => patchItem(item.key, { quantity: Math.max(1, Math.floor(Number(event.target.value))) })} type="number" value={item.quantity} /></label>
                    <label className={styles.field}>Cena / szt.<input min="0" onChange={(event) => patchItem(item.key, { unitPrice: Math.max(0, Number(event.target.value)) })} type="number" value={item.unitPrice} /></label>
                    <label className={styles.field}>Waluta<select onChange={(event) => patchItem(item.key, { currency: event.target.value as Currency })} value={item.currency}><option value="yang">Yang</option><option value="won">Won</option><option value="gem">GEM</option></select></label>
                    <button className={styles.secondary} onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))} type="button">Usuń</button>
                  </div>
                ))}
              </div>
              <div className={styles.grid} style={{ marginTop: 14 }}>
                <label className={styles.field}>Pieniądze<input min="0" onChange={(event) => setMoneyAmount(Math.max(0, Number(event.target.value)))} type="number" value={moneyAmount} /></label>
                <label className={styles.field}>Waluta pieniędzy<select onChange={(event) => setMoneyCurrency(event.target.value as Currency)} value={moneyCurrency}><option value="yang">Yang</option><option value="won">Won</option><option value="gem">GEM</option></select></label>
              </div>
              <div className={styles.actions} style={{ marginTop: 16 }}><button className={styles.primary} disabled={busy} type="submit">Zapisz prywatny drop</button></div>
            </form>
          </section>
        ) : null}

        {costOpen ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>Nowy koszt</h2></div>
            <form onSubmit={submitCost}>
              <div className={styles.grid}>
                <label className={styles.field}>Nazwa<input onChange={(event) => setCostLabel(event.target.value)} value={costLabel} /></label>
                <label className={styles.field}>Ilość<input min="0.0001" onChange={(event) => setCostQuantity(Math.max(0.0001, Number(event.target.value)))} step="0.0001" type="number" value={costQuantity} /></label>
                <label className={styles.field}>Cena / szt.<input min="0" onChange={(event) => setCostUnitPrice(Math.max(0, Number(event.target.value)))} type="number" value={costUnitPrice} /></label>
                <label className={styles.field}>Waluta<select onChange={(event) => setCostCurrency(event.target.value as Currency)} value={costCurrency}><option value="yang">Yang</option><option value="won">Won</option><option value="gem">GEM</option></select></label>
              </div>
              <div className={styles.actions} style={{ marginTop: 16 }}><button className={styles.primary} disabled={busy} type="submit">Zapisz koszt</button></div>
            </form>
          </section>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Historia · ten tydzień</h2><p className={styles.muted}>Tylko wpisy przypisane do Twojego prywatnego scope.</p></div></div>
          <div className={styles.history}>
            {drops.map((drop) => (
              <div className={styles.historyRow} key={drop.id}>
                <div><strong>{drop.source}</strong><span> · {new Date(drop.occurredAtIso).toLocaleString('pl-PL')}</span><small> · {drop.items.length} przedm. · {drop.money.length} wpisów kasy</small></div>
                <strong>{money(drop.items.filter((item) => item.currency === 'yang').reduce((sum, item) => sum + item.ourQuantity * item.unitPrice, 0) + drop.money.filter((entry) => entry.currency === 'yang').reduce((sum, entry) => sum + entry.ourAmount, 0), 'yang')}</strong>
              </div>
            ))}
            {expenses.map((expense) => (
              <div className={styles.historyRow} key={expense.id}>
                <div><strong>Koszt · {expense.label}</strong><span> · {new Date(expense.occurredAtIso).toLocaleString('pl-PL')}</span></div>
                <strong>-{money(expense.quantity * expense.unitPrice, expense.currency)}</strong>
              </div>
            ))}
            {drops.length === 0 && expenses.length === 0 ? <p className={styles.muted}>Brak prywatnych wpisów w tym tygodniu.</p> : null}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
