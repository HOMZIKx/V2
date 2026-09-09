'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { usePlayerStore } from '../../src/player-store-react';
import { AppShell } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';
import styles from './economy.module.css';

type Scope = 'private' | 'team';
type Currency = 'yang' | 'won' | 'gem';

type Summary = {
  readonly runCount: number;
  readonly totals: readonly {
    readonly currency: Currency;
    readonly gross: number;
    readonly itemGross: number;
    readonly moneyGross: number;
    readonly costs: number;
    readonly net: number;
  }[];
};

type Drop = {
  readonly id: string;
  readonly source: string;
  readonly occurredAtIso: string;
  readonly money: readonly {
    readonly currency: Currency;
    readonly totalAmount: number;
    readonly ourAmount: number;
  }[];
  readonly items: readonly {
    readonly displayName: string;
    readonly ourQuantity: number;
    readonly unitPrice: number;
    readonly currency: Currency;
  }[];
};

type Expense = {
  readonly id: string;
  readonly label: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currency: Currency;
  readonly ourShareBasisPoints: number;
  readonly occurredAtIso: string;
};

function api(path: string): string {
  return `/player-team/v1/economy/workspaces/private/${path}`;
}

function startOfWeekIso(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day).toISOString();
}

function amount(value: number, currency: Currency): string {
  const label = currency === 'yang' ? 'Yang' : currency === 'won' ? 'Won' : 'GEM';
  return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} ${label}`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function EconomyHub() {
  const { state, hydrated } = usePlayerStore();
  const [scope, setScope] = useState<Scope>('private');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [incomeSource, setIncomeSource] = useState('Drop / sprzedaż');
  const [incomeAmount, setIncomeAmount] = useState(0);
  const [incomeCurrency, setIncomeCurrency] = useState<Currency>('yang');
  const [expenseLabel, setExpenseLabel] = useState('');
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expenseCurrency, setExpenseCurrency] = useState<Currency>('yang');

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('scope');
    if (requested === 'team' || requested === 'private') setScope(requested);
  }, []);

  const loadPrivate = useCallback(async () => {
    if (!hydrated || state.authStatus !== 'authenticated' || !state.viewer) return;
    setError('');
    const since = encodeURIComponent(startOfWeekIso());
    try {
      const [summaryResponse, dropsResponse, expensesResponse] = await Promise.all([
        fetch(api(`summary?since=${since}`), { cache: 'no-store' }),
        fetch(api(`drops?since=${since}`), { cache: 'no-store' }),
        fetch(api(`expenses?since=${since}`), { cache: 'no-store' }),
      ]);
      if (!summaryResponse.ok || !dropsResponse.ok || !expensesResponse.ok) {
        throw new Error('Nie udało się pobrać prywatnej ekonomii z serwera.');
      }
      setSummary((await summaryResponse.json()) as Summary);
      setDrops((await dropsResponse.json()) as Drop[]);
      setExpenses((await expensesResponse.json()) as Expense[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Błąd pobierania ekonomii.');
    }
  }, [hydrated, state.authStatus, state.viewer]);

  useEffect(() => {
    if (scope === 'private') void loadPrivate();
  }, [loadPrivate, scope]);

  const selectedTotal = useMemo(
    () => summary?.totals.find((entry) => entry.currency === 'yang') ?? null,
    [summary],
  );

  async function submitIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (incomeAmount <= 0) {
      setError('Podaj kwotę większą od zera.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('drops'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: incomeSource.trim() || 'Przychód prywatny',
          occurredAtIso: new Date().toISOString(),
          ourShareBasisPoints: 10_000,
          pileCount: 1,
          splitMode: 'max_equal',
          participants: state.viewer
            ? [
                {
                  participantId: state.viewer.id,
                  displayName: state.viewer.displayName,
                  isTeamMember: true,
                },
              ]
            : [],
          items: [],
          money: [
            {
              currency: incomeCurrency,
              totalAmount: incomeAmount,
              ourShareBasisPoints: 10_000,
            },
          ],
        }),
      });
      if (!response.ok) throw new Error('Serwer odrzucił zapis przychodu.');
      setIncomeAmount(0);
      setIncomeOpen(false);
      setNotice('Przychód zapisany w Twojej prywatnej ekonomii.');
      await loadPrivate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Błąd zapisu przychodu.');
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expenseLabel.trim() || expenseAmount <= 0) {
      setError('Podaj nazwę kosztu i kwotę większą od zera.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('expenses'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: expenseLabel.trim(),
          expenseType: 'other',
          quantity: 1,
          unitPrice: expenseAmount,
          currency: expenseCurrency,
          ourShareBasisPoints: 10_000,
          occurredAtIso: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error('Serwer odrzucił zapis kosztu.');
      setExpenseLabel('');
      setExpenseAmount(0);
      setExpenseOpen(false);
      setNotice('Koszt zapisany w Twojej prywatnej ekonomii.');
      await loadPrivate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Błąd zapisu kosztu.');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) {
    return (
      <main className="discord-entry">
        <p className="entry-status">Ładowanie…</p>
      </main>
    );
  }
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;

  const workspaces = state.workspaces.filter((workspace) => !workspace.archived);

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className={styles.page} id="main-content">
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>DESTILED · Ekonomia</span>
            <h1>Ekonomia</h1>
            <p>Jedno miejsce, dwa całkowicie oddzielne zakresy danych.</p>
          </div>
          <div className={styles.scopeSwitch} aria-label="Zakres ekonomii">
            <button
              className={scope === 'private' ? styles.scopeActive : styles.scopeButton}
              onClick={() => setScope('private')}
              type="button"
            >
              Prywatna
            </button>
            <button
              className={scope === 'team' ? styles.scopeActive : styles.scopeButton}
              onClick={() => setScope('team')}
              type="button"
            >
              Zespół
            </button>
          </div>
        </section>

        {scope === 'team' ? (
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>Ekonomia zespołowa</span>
                <h2>Wybierz zespół</h2>
              </div>
              <span className={styles.serverBadge}>wspólny zapis serwerowy</span>
            </div>
            {workspaces.length === 0 ? (
              <p className={styles.muted}>Nie masz jeszcze aktywnego zespołu.</p>
            ) : (
              <div className={styles.teamGrid}>
                {workspaces.map((workspace) => (
                  <a className={styles.teamCard} href={`/teams/${workspace.id}/economy`} key={workspace.id}>
                    <strong>{workspace.name}</strong>
                    <span>{workspace.members.length} członków</span>
                    <em>Otwórz ekonomię zespołu →</em>
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className={styles.privateBanner}>
              <div>
                <strong>Prywatny zakres konta</strong>
                <span>
                  Dane są zapisywane przez player-team API pod serwerowym identyfikatorem przypisanym wyłącznie do zalogowanego konta.
                </span>
              </div>
              <span className={styles.serverBadge}>bez localStorage</span>
            </section>

            <section className={styles.metrics}>
              <article>
                <span>Przychód · tydzień</span>
                <strong>{amount(selectedTotal?.gross ?? 0, 'yang')}</strong>
              </article>
              <article>
                <span>Koszty · tydzień</span>
                <strong>{amount(selectedTotal?.costs ?? 0, 'yang')}</strong>
              </article>
              <article>
                <span>Wynik netto</span>
                <strong>{amount(selectedTotal?.net ?? 0, 'yang')}</strong>
              </article>
              <article>
                <span>Wpisy przychodowe</span>
                <strong>{summary?.runCount ?? 0}</strong>
              </article>
            </section>

            <div className={styles.actions}>
              <button onClick={() => setIncomeOpen((value) => !value)} type="button">
                + Przychód
              </button>
              <button onClick={() => setExpenseOpen((value) => !value)} type="button">
                + Koszt
              </button>
              <button disabled={busy} onClick={() => void loadPrivate()} type="button">
                Odśwież
              </button>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}
            {notice ? <p className={styles.notice}>{notice}</p> : null}

            {incomeOpen ? (
              <section className={styles.panel}>
                <h2>Dodaj prywatny przychód</h2>
                <form className={styles.form} onSubmit={submitIncome}>
                  <label>
                    Źródło
                    <input value={incomeSource} onChange={(event) => setIncomeSource(event.target.value)} />
                  </label>
                  <label>
                    Kwota
                    <input
                      min="0"
                      step="0.01"
                      type="number"
                      value={incomeAmount}
                      onChange={(event) => setIncomeAmount(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Waluta
                    <select
                      value={incomeCurrency}
                      onChange={(event) => setIncomeCurrency(event.target.value as Currency)}
                    >
                      <option value="yang">Yang</option>
                      <option value="won">Won</option>
                      <option value="gem">GEM</option>
                    </select>
                  </label>
                  <button disabled={busy} type="submit">Zapisz przychód</button>
                </form>
              </section>
            ) : null}

            {expenseOpen ? (
              <section className={styles.panel}>
                <h2>Dodaj prywatny koszt</h2>
                <form className={styles.form} onSubmit={submitExpense}>
                  <label>
                    Nazwa
                    <input value={expenseLabel} onChange={(event) => setExpenseLabel(event.target.value)} />
                  </label>
                  <label>
                    Kwota
                    <input
                      min="0"
                      step="0.01"
                      type="number"
                      value={expenseAmount}
                      onChange={(event) => setExpenseAmount(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Waluta
                    <select
                      value={expenseCurrency}
                      onChange={(event) => setExpenseCurrency(event.target.value as Currency)}
                    >
                      <option value="yang">Yang</option>
                      <option value="won">Won</option>
                      <option value="gem">GEM</option>
                    </select>
                  </label>
                  <button disabled={busy} type="submit">Zapisz koszt</button>
                </form>
              </section>
            ) : null}

            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}>Ten tydzień</span>
                  <h2>Ostatnie wpisy</h2>
                </div>
              </div>
              {drops.length === 0 && expenses.length === 0 ? (
                <p className={styles.muted}>Brak prywatnych wpisów w tym tygodniu.</p>
              ) : (
                <div className={styles.history}>
                  {drops.map((drop) => {
                    const moneyValue = drop.money.reduce((sum, row) => sum + row.ourAmount, 0);
                    const itemValue = drop.items
                      .filter((item) => item.currency === 'yang')
                      .reduce((sum, item) => sum + item.ourQuantity * item.unitPrice, 0);
                    return (
                      <article key={drop.id}>
                        <div>
                          <strong>{drop.source}</strong>
                          <span>{dateLabel(drop.occurredAtIso)}</span>
                        </div>
                        <em>+ {amount(moneyValue + itemValue, 'yang')}</em>
                      </article>
                    );
                  })}
                  {expenses.map((expense) => (
                    <article key={expense.id}>
                      <div>
                        <strong>{expense.label}</strong>
                        <span>{dateLabel(expense.occurredAtIso)}</span>
                      </div>
                      <em className={styles.cost}>
                        − {amount((expense.quantity * expense.unitPrice * expense.ourShareBasisPoints) / 10_000, expense.currency)}
                      </em>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
