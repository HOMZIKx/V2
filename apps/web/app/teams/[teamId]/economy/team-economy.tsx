'use client';

import { useParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

import { resolveAiObservationFeedback } from '../../../../src/ai-observation-feedback';
import { economyAiErrorMessage } from '../../../../src/economy-ai-error';
import { gameItemCatalog } from '../../../../src/item-catalog';
import { usePlayerStore } from '../../../../src/player-store-react';
import { AppShell } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';
import { CompactAmountInput } from './compact-amount-input';
import { DropHistoryActions } from './drop-history-actions';
import { EconomyContextNav } from './economy-context-nav';
import { MarketPriceHint } from './market-price-hint';
import styles from './team-economy.module.css';

type Currency = 'yang' | 'won' | 'gem';
type Tab = 'drop' | 'costs' | 'history' | 'ranking';
type RangePreset = 'day' | '7d' | '30d' | 'all';

const RANGE_OPTIONS: readonly { value: RangePreset; label: string }[] = [
  { value: 'day', label: 'Dzisiaj' },
  { value: '7d', label: '7 dni' },
  { value: '30d', label: '30 dni' },
  { value: 'all', label: 'Całość' },
];

function rangeSinceIso(range: RangePreset): string | null {
  if (range === 'all') return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (range === '7d') start.setDate(start.getDate() - 6);
  if (range === '30d') start.setDate(start.getDate() - 29);
  return start.toISOString();
}

function rangeLabel(range: RangePreset): string {
  return RANGE_OPTIONS.find((option) => option.value === range)?.label ?? '7 dni';
}

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
  itemId: string | null;
  displayName: string;
  totalQuantity: number;
  ourQuantity: number;
  unitPrice: number;
  currency: Currency;
  aiConfidence?: number | null;
  perPile: number;
  leftover: number;
};

type DropMoney = {
  id: string;
  currency: Currency;
  totalAmount: number;
  ourShareBasisPoints: number;
  ourAmount: number;
};

type Drop = {
  id: string;
  source: string;
  occurredAtIso: string;
  ourShareBasisPoints: number;
  pileCount: number;
  splitMode: 'max_equal' | 'strict_equal';
  items: DropItem[];
  money: DropMoney[];
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

type DraftItem = {
  key: string;
  itemId: string | null;
  name: string;
  category: string;
  totalQuantity: number;
  ourQuantity: number;
  unitPrice: number;
  currency: Currency;
  confidence: number | null;
};

type DraftMoney = {
  key: string;
  currency: Currency;
  totalAmount: number;
  sharePercent: number;
};

type AiItem = {
  recognizedName: string;
  quantity: number;
  confidence: number;
  catalogMatch: {
    id: string;
    name: string;
    category: string;
    imageUrl: string | null;
  } | null;
};

type CatalogSearchItem = {
  id: string;
  canonicalName: string;
  category: string;
  imageUrl: string | null;
  lastPrice: { unitPrice: number; currency: Currency; createdAtIso: string } | null;
};

const dobryTematSeed = Array.from(
  gameItemCatalog
    .reduce((map, item) => {
      const key = item.title.trim().toLocaleLowerCase('pl-PL');
      if (!map.has(key)) {
        map.set(key, {
          id: item.id,
          canonicalName: item.title,
          category: item.category || 'Pozostałe',
          imageUrl: item.sourceImageUrl ?? item.imagePath,
        });
      }
      return map;
    }, new Map<string, { id: string; canonicalName: string; category: string; imageUrl: string | null }>())
    .values(),
);

const CURRENCIES: readonly Currency[] = ['yang', 'won', 'gem'];

function summaryRows(summary: Summary | null) {
  return CURRENCIES.map(
    (currency) =>
      summary?.totals.find((row) => row.currency === currency) ?? {
        currency,
        gross: 0,
        itemGross: 0,
        moneyGross: 0,
        costs: 0,
        net: 0,
      },
  );
}

function money(value: number, currency: Currency): string {
  if (currency === 'won') {
    return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} Won`;
  }
  if (currency === 'gem') {
    return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} GEM`;
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toLocaleString('pl-PL', {
      maximumFractionDigits: 2,
    })} kkk`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('pl-PL', {
      maximumFractionDigits: 2,
    })} kk`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toLocaleString('pl-PL', {
      maximumFractionDigits: 1,
    })}k`;
  }
  return `${value.toLocaleString('pl-PL')} Yang`;
}

function api(workspaceId: string, path: string): string {
  return `/player-team/v1/economy/workspaces/${encodeURIComponent(workspaceId)}/${path}`;
}

function directMoneyShare(row: DraftMoney): number {
  return (row.totalAmount * row.sharePercent) / 100;
}

function normalizedParticipantName(value: string): string {
  return value.trim().toLocaleLowerCase('pl-PL');
}

export function TeamEconomy() {
  const { teamId } = useParams<{ teamId: string }>();
  const { state, hydrated } = usePlayerStore();
  const workspace =
    state.workspaces.find((entry) => entry.id === teamId && !entry.archived) ?? null;

  const [tab, setTab] = useState<Tab>('drop');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [range, setRange] = useState<RangePreset>('7d');

  const [dropOpen, setDropOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [source, setSource] = useState('Azrael');
  const [share, setShare] = useState(100);
  const [piles, setPiles] = useState(1);
  const [splitMode, setSplitMode] = useState<'max_equal' | 'strict_equal'>('max_equal');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [draftMoney, setDraftMoney] = useState<DraftMoney[]>([]);
  const [dropAnalysisId, setDropAnalysisId] = useState<string | null>(null);
  const [outsiders, setOutsiders] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [partySessionId, setPartySessionId] = useState<string | null>(null);
  const initializedMembersForWorkspaceRef = useRef<string | null>(null);
  const appliedPartyContextRef = useRef<string | null>(null);

  const [expenseLabel, setExpenseLabel] = useState('');
  const [expenseQty, setExpenseQty] = useState(1);
  const [expensePrice, setExpensePrice] = useState(0);
  const [expenseCurrency, setExpenseCurrency] = useState<Currency>('yang');
  const [expenseShare, setExpenseShare] = useState(100);
  const [expenseDropSessionId, setExpenseDropSessionId] = useState('');

  useEffect(() => {
    if (!workspace) {
      initializedMembersForWorkspaceRef.current = null;
      appliedPartyContextRef.current = null;
      return;
    }

    const query = window.location.search.replace(/^\?/, '');
    const params = new URLSearchParams(query);
    const isPartyContext = params.get('scope') === 'team';
    const contextKey = `${workspace.id}:${query}`;

    if (isPartyContext && appliedPartyContextRef.current !== contextKey) {
      appliedPartyContextRef.current = contextKey;
      initializedMembersForWorkspaceRef.current = workspace.id;

      const sourceParam = params.get('source')?.trim() ?? '';
      const mapParam = params.get('map')?.trim() ?? '';
      const channelParam = params.get('channel')?.trim() ?? '';
      const sourceParts = [sourceParam, mapParam, channelParam ? `CH${channelParam}` : ''].filter(
        Boolean,
      );
      if (sourceParts.length > 0) setSource(sourceParts.join(' · ').slice(0, 120));

      const sessionId = params.get('sessionId')?.trim() ?? '';
      setPartySessionId(sessionId || null);

      const participantNames = (params.get('participants') ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      const participantNameSet = new Set(participantNames.map(normalizedParticipantName));
      const matchedMembers = workspace.members.filter((member) =>
        participantNameSet.has(normalizedParticipantName(member.displayName)),
      );
      setSelectedMembers(matchedMembers.map((member) => member.id));
      const matchedNameSet = new Set(
        matchedMembers.map((member) => normalizedParticipantName(member.displayName)),
      );
      setOutsiders(
        participantNames
          .filter((name) => !matchedNameSet.has(normalizedParticipantName(name)))
          .join(', '),
      );
      setDropOpen(true);
      setNotice(
        'Kontekst sesji Party wczytany: źródło, mapa, CH i uczestnicy zostały uzupełnione.',
      );
      return;
    }

    if (initializedMembersForWorkspaceRef.current === workspace.id) return;
    initializedMembersForWorkspaceRef.current = workspace.id;
    setSelectedMembers(workspace.members.map((member) => member.id));
  }, [workspace]);

  const load = useCallback(async () => {
    if (!workspace) return;
    setError('');
    const since = rangeSinceIso(range);
    const suffix = since ? `?since=${encodeURIComponent(since)}` : '';
    try {
      const [summaryResponse, dropsResponse, expensesResponse] = await Promise.all([
        fetch(api(workspace.id, `summary${suffix}`), { cache: 'no-store' }),
        fetch(api(workspace.id, `drops${suffix}`), { cache: 'no-store' }),
        fetch(api(workspace.id, `expenses${suffix}`), { cache: 'no-store' }),
      ]);
      if (!summaryResponse.ok || !dropsResponse.ok || !expensesResponse.ok) {
        throw new Error('Nie udało się pobrać ekonomii zespołu.');
      }
      setSummary((await summaryResponse.json()) as Summary);
      setDrops((await dropsResponse.json()) as Drop[]);
      setExpenses((await expensesResponse.json()) as Expense[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd pobierania danych.');
    }
  }, [workspace, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = summaryRows(summary);

  const ranking = useMemo(() => {
    const values = new Map<string, number>();
    const sourceByDropId = new Map<string, string>();
    for (const drop of drops) {
      sourceByDropId.set(drop.id, drop.source);
      const itemValue = drop.items
        .filter((item) => item.currency === 'yang')
        .reduce((sum, item) => sum + item.ourQuantity * item.unitPrice, 0);
      const cashValue = drop.money
        .filter((entry) => entry.currency === 'yang')
        .reduce((sum, entry) => sum + entry.ourAmount, 0);
      values.set(drop.source, (values.get(drop.source) ?? 0) + itemValue + cashValue);
    }
    for (const expense of expenses) {
      if (expense.currency !== 'yang' || !expense.dropSessionId) continue;
      const source = sourceByDropId.get(expense.dropSessionId);
      if (!source) continue;
      const cost = (expense.quantity * expense.unitPrice * expense.ourShareBasisPoints) / 10_000;
      values.set(source, (values.get(source) ?? 0) - cost);
    }
    return [...values.entries()].sort((left, right) => right[1] - left[1]);
  }, [drops, expenses]);

  const recognizeFile = useCallback(
    async (file: File) => {
      if (!workspace) return;
      if (!file.type.startsWith('image/')) {
        setError('Wklej lub wybierz plik obrazu PNG, JPG albo WEBP.');
        return;
      }
      setBusy(true);
      setError('');
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Nie udało się odczytać screena.'));
          reader.readAsDataURL(file);
        });
        const response = await fetch('/api/team-economy/recognize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageDataUrl: dataUrl, workspaceId: workspace.id }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            retryAfterSeconds?: number | null;
          };
          throw new Error(economyAiErrorMessage(body.error, body.retryAfterSeconds));
        }
        const body = (await response.json()) as { analysisId?: string | null; items: AiItem[] };
        if (!Array.isArray(body.items) || body.items.length === 0) {
          throw new Error('AI nie znalazło żadnego zajętego slotu na tym screenie.');
        }
        setDropAnalysisId(
          typeof body.analysisId === 'string' && body.analysisId.trim()
            ? body.analysisId.trim()
            : null,
        );
        const resolvedAiItems = await Promise.all(
          body.items.map(async (item, index): Promise<DraftItem> => {
            const name = item.catalogMatch?.name ?? item.recognizedName;
            let catalogItem: CatalogSearchItem | null = null;
            const catalogResponse = await fetch(
              api(workspace.id, `items?q=${encodeURIComponent(name)}`),
              { cache: 'no-store' },
            );
            if (catalogResponse.ok) {
              const candidates = (await catalogResponse.json()) as CatalogSearchItem[];
              catalogItem =
                candidates.find(
                  (candidate) =>
                    candidate.canonicalName.trim().toLocaleLowerCase('pl-PL') ===
                    name.trim().toLocaleLowerCase('pl-PL'),
                ) ?? null;
            }
            return {
              key: `ai-${Date.now()}-${index}`,
              itemId: catalogItem?.id ?? null,
              name: catalogItem?.canonicalName ?? name,
              category: catalogItem?.category ?? item.catalogMatch?.category ?? 'Pozostałe',
              totalQuantity: item.quantity,
              ourQuantity: item.quantity,
              unitPrice: catalogItem?.lastPrice?.unitPrice ?? 0,
              currency: catalogItem?.lastPrice?.currency ?? 'yang',
              confidence: item.confidence,
            };
          }),
        );
        setDraftItems(resolvedAiItems);
        setNotice(
          `AI rozpoznało ${body.items.length} pozycji slot po slocie. Sprawdź szczególnie małe cyfry ilości przed zapisem.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Błąd AI.');
      } finally {
        setBusy(false);
      }
    },
    [workspace],
  );

  function recognize(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void recognizeFile(file);
  }

  useEffect(() => {
    if (!dropOpen) return;
    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find(
        (item) => item.kind === 'file' && item.type.startsWith('image/'),
      );
      const file = imageItem?.getAsFile() ?? null;
      if (!file) return;
      event.preventDefault();
      void recognizeFile(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [dropOpen, recognizeFile]);

  function patchItem(key: string, patch: Partial<DraftItem>) {
    setDraftItems((items) =>
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function patchMoney(key: string, patch: Partial<DraftMoney>) {
    setDraftMoney((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function applyShareToMoney() {
    setDraftMoney((rows) => rows.map((row) => ({ ...row, sharePercent: share })));
  }

  function addManualItem() {
    setDraftItems((items) => [
      ...items,
      {
        key: `manual-${Date.now()}`,
        itemId: null,
        name: '',
        category: 'Pozostałe',
        totalQuantity: 1,
        ourQuantity: 1,
        unitPrice: 0,
        currency: 'yang',
        confidence: null,
      },
    ]);
  }

  function addMoney() {
    setDraftMoney((rows) => [
      ...rows,
      {
        key: `money-${Date.now()}`,
        currency: 'yang',
        totalAmount: 0,
        sharePercent: share,
      },
    ]);
  }

  async function submitDrop(event: FormEvent) {
    event.preventDefault();
    if (!workspace || (draftItems.length === 0 && !draftMoney.some((row) => row.totalAmount > 0))) {
      setError('Dodaj przynajmniej jeden przedmiot albo kwotę pieniędzy.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const resolved: DraftItem[] = [];
      for (const item of draftItems) {
        if (!item.name.trim()) throw new Error('Każdy przedmiot musi mieć nazwę.');
        let itemId = item.itemId;
        if (!itemId) {
          const searchResponse = await fetch(
            api(workspace.id, `items?q=${encodeURIComponent(item.name.trim())}`),
            { cache: 'no-store' },
          );
          if (searchResponse.ok) {
            const candidates = (await searchResponse.json()) as CatalogSearchItem[];
            const exactMatch = candidates.find(
              (candidate) =>
                candidate.canonicalName.trim().toLocaleLowerCase('pl-PL') ===
                item.name.trim().toLocaleLowerCase('pl-PL'),
            );
            if (exactMatch) itemId = exactMatch.id;
          }
        }
        if (!itemId) {
          const response = await fetch(api(workspace.id, 'items'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              canonicalName: item.name.trim(),
              category: item.category || 'Pozostałe',
            }),
          });
          if (!response.ok) throw new Error(`Nie udało się zapisać przedmiotu: ${item.name}.`);
          const saved = (await response.json()) as { id: string };
          itemId = saved.id;
        }
        resolved.push({ ...item, itemId });
      }

      const participants = [
        ...workspace.members
          .filter((member) => selectedMembers.includes(member.id))
          .map((member) => ({
            participantId: member.id,
            displayName: member.displayName,
            isTeamMember: true,
          })),
        ...outsiders
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
          .map((name, index) => ({
            participantId: `external-${Date.now()}-${index}`,
            displayName: name,
            isTeamMember: false,
          })),
      ];

      const response = await fetch(api(workspace.id, 'drops'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source,
          occurredAtIso: new Date().toISOString(),
          notes: partySessionId ? `Sesja Party: ${partySessionId}` : undefined,
          ourShareBasisPoints: Math.round(share * 100),
          pileCount: piles,
          splitMode,
          participants,
          items: resolved.map((item) => ({
            itemId: item.itemId,
            displayName: item.name,
            totalQuantity: item.totalQuantity,
            ourQuantity: item.ourQuantity,
            unitPrice: item.unitPrice,
            currency: item.currency,
            aiConfidence: item.confidence,
          })),
          money: draftMoney
            .filter((row) => row.totalAmount > 0)
            .map((row) => ({
              currency: row.currency,
              totalAmount: row.totalAmount,
              ourShareBasisPoints: Math.round(row.sharePercent * 100),
            })),
        }),
      });
      if (!response.ok) throw new Error('Serwer odrzucił zapis dropu.');
      if (dropAnalysisId) {
        void resolveAiObservationFeedback(dropAnalysisId, {
          items: resolved.map((item) => ({
            name: item.name.trim(),
            quantity: item.totalQuantity,
          })),
        });
      }
      setDropAnalysisId(null);
      setPartySessionId(null);
      setDraftItems([]);
      setDraftMoney([]);
      setOutsiders('');
      setDropOpen(false);
      setNotice('Drop zapisany i doliczony do ekonomii zespołu.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu dropu.');
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !expenseLabel.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspace.id, 'expenses'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dropSessionId: expenseDropSessionId || null,
          label: expenseLabel,
          expenseType: 'other',
          quantity: expenseQty,
          unitPrice: expensePrice,
          currency: expenseCurrency,
          ourShareBasisPoints: Math.round(expenseShare * 100),
          occurredAtIso: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error('Serwer odrzucił koszt.');
      setExpenseOpen(false);
      setExpenseLabel('');
      setExpensePrice(0);
      setExpenseDropSessionId('');
      setNotice('Koszt zapisany.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu kosztu.');
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
  if (!workspace) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className={styles.page}>
          <section className="panel">
            <h1>Nie znaleziono zespołu</h1>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className={styles.page} id="main-content">
        <EconomyContextNav
          currentLabel="Ekonomia"
          workspaceId={workspace.id}
          workspaceName={workspace.name}
        />

        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Zespół · Ekonomia</span>
            <h1>{workspace.name}</h1>
            <p>Drop, nasza część, podział na kupki, ceny, koszty i wynik dla wybranego okresu.</p>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.button}
              onClick={() => setDropOpen((value) => !value)}
              type="button"
            >
              + Dodaj drop
            </button>
            <button
              className={styles.buttonGhost}
              onClick={() => setExpenseOpen((value) => !value)}
              type="button"
            >
              + Koszt
            </button>
          </div>
        </section>

        <div className={styles.periods} aria-label="Zakres danych ekonomii">
          {RANGE_OPTIONS.map((option) => (
            <button
              className={range === option.value ? styles.periodActive : styles.period}
              key={option.value}
              onClick={() => setRange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <section className={styles.metrics}>
          <article className={styles.metric}>
            <span>Przychód · {rangeLabel(range)}</span>
            <div className={styles.currencyValues}>
              {totals.map((total) => (
                <strong key={total.currency}>{money(total.gross, total.currency)}</strong>
              ))}
            </div>
          </article>
          <article className={styles.metric}>
            <span>Koszty</span>
            <div className={styles.currencyValues}>
              {totals.map((total) => (
                <strong key={total.currency}>{money(total.costs, total.currency)}</strong>
              ))}
            </div>
          </article>
          <article className={styles.metric}>
            <span>Wynik netto</span>
            <div className={`${styles.currencyValues} ${styles.net}`}>
              {totals.map((total) => (
                <strong key={total.currency}>{money(total.net, total.currency)}</strong>
              ))}
            </div>
          </article>
          <article className={styles.metric}>
            <span>Wpisy dropów</span>
            <strong>{summary?.runCount ?? 0}</strong>
            <small>{rangeLabel(range)} · katalog centralny</small>
          </article>
        </section>

        {error ? <p className={styles.error}>{error}</p> : null}
        {notice ? <p className={styles.warning}>{notice}</p> : null}

        {dropOpen ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Nowy drop</h2>
              <span className={styles.tag}>AI + ręczna kontrola</span>
            </div>
            <form onSubmit={submitDrop}>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  Źródło
                  <input value={source} onChange={(event) => setSource(event.target.value)} />
                </label>
                <label className={styles.field}>
                  Domyślny udział pieniędzy %
                  <input
                    min="0"
                    max="100"
                    step="0.01"
                    type="number"
                    value={share}
                    onChange={(event) =>
                      setShare(Math.max(0, Math.min(100, Number(event.target.value))))
                    }
                  />
                  <small className={styles.shareHint}>
                    Pieniądze dzielimy procentowo. Przedmioty wyłącznie w pełnych sztukach.
                  </small>
                </label>
                <label className={styles.field}>
                  Liczba kupek
                  <input
                    min="1"
                    max="100"
                    type="number"
                    value={piles}
                    onChange={(event) =>
                      setPiles(Math.max(1, Math.min(100, Math.floor(Number(event.target.value)))))
                    }
                  />
                </label>
                <label className={styles.field}>
                  Tryb podziału przedmiotów
                  <select
                    value={splitMode}
                    onChange={(event) => setSplitMode(event.target.value as typeof splitMode)}
                  >
                    <option value="max_equal">Maksymalnie równo + reszta</option>
                    <option value="strict_equal">Tylko idealnie równo</option>
                  </select>
                </label>

                <label className={`${styles.field} ${styles.full}`}>
                  <span>Screen dropu</span>
                  <span className={styles.dropZone}>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={recognize}
                      type="file"
                    />
                    <small>
                      Wybierz plik albo wklej screen Ctrl+V. AI czyta sloty, ikony i liczby; wynik
                      zawsze można poprawić.
                    </small>
                  </span>
                </label>

                <div className={`${styles.actions} ${styles.full}`}>
                  <button className={styles.buttonGhost} type="button" onClick={addManualItem}>
                    + Przedmiot ręcznie
                  </button>
                  <button className={styles.buttonGhost} type="button" onClick={addMoney}>
                    + Pieniądze
                  </button>
                  <button className={styles.buttonGhost} type="button" onClick={applyShareToMoney}>
                    Ustaw kasę na {share}%
                  </button>
                </div>
              </div>

              {draftItems.length ? (
                <>
                  <h3 className={styles.sectionTitle}>Przedmioty · podział liczbowy</h3>
                  <table className={styles.itemTable}>
                    <thead>
                      <tr>
                        <th>Przedmiot</th>
                        <th>Całość</th>
                        <th>Nasze szt.</th>
                        <th>Cena / szt.</th>
                        <th>Waluta ceny</th>
                        <th>Na kupkę</th>
                        <th>Reszta</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {draftItems.map((item) => {
                        const perPile =
                          splitMode === 'strict_equal' && item.ourQuantity % piles !== 0
                            ? 0
                            : Math.floor(item.ourQuantity / piles);
                        const leftover = item.ourQuantity - perPile * piles;
                        return (
                          <tr key={item.key}>
                            <td>
                              <input
                                list="economy-item-catalog"
                                value={item.name}
                                onChange={(event) =>
                                  patchItem(item.key, { name: event.target.value, itemId: null })
                                }
                              />
                              {item.confidence !== null ? (
                                <small>AI {Math.round(item.confidence * 100)}%</small>
                              ) : null}
                            </td>
                            <td>
                              <input
                                min="1"
                                type="number"
                                value={item.totalQuantity}
                                onChange={(event) => {
                                  const totalQuantity = Math.max(
                                    1,
                                    Math.floor(Number(event.target.value)),
                                  );
                                  patchItem(item.key, {
                                    totalQuantity,
                                    ourQuantity: Math.min(item.ourQuantity, totalQuantity),
                                  });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                min="0"
                                max={item.totalQuantity}
                                type="number"
                                value={item.ourQuantity}
                                onChange={(event) =>
                                  patchItem(item.key, {
                                    ourQuantity: Math.max(
                                      0,
                                      Math.min(
                                        item.totalQuantity,
                                        Math.floor(Number(event.target.value)),
                                      ),
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <CompactAmountInput
                                value={item.unitPrice}
                                onValueChange={(value) => patchItem(item.key, { unitPrice: value })}
                              />
                              <MarketPriceHint
                                currency={item.currency}
                                itemName={item.name}
                                onUsePrice={(value) => patchItem(item.key, { unitPrice: value })}
                                workspaceId={workspace.id}
                              />
                            </td>
                            <td>
                              <select
                                value={item.currency}
                                onChange={(event) =>
                                  patchItem(item.key, { currency: event.target.value as Currency })
                                }
                              >
                                <option value="yang">Yang</option>
                                <option value="won">Won</option>
                                <option value="gem">GEM</option>
                              </select>
                            </td>
                            <td>{perPile}</td>
                            <td>{leftover}</td>
                            <td>
                              <button
                                className={styles.buttonGhost}
                                type="button"
                                onClick={() =>
                                  setDraftItems((items) =>
                                    items.filter((candidate) => candidate.key !== item.key),
                                  )
                                }
                              >
                                Usuń
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              ) : null}

              <datalist id="economy-item-catalog">
                {dobryTematSeed.map((item) => (
                  <option key={item.id} value={item.canonicalName} />
                ))}
              </datalist>

              {draftMoney.length ? (
                <div className={styles.moneyBlock}>
                  <h3 className={styles.sectionTitle}>Pieniądze · podział procentowy</h3>
                  <div className={styles.moneyRows}>
                    {draftMoney.map((row) => (
                      <div className={styles.moneyRow} key={row.key}>
                        <label className={styles.field}>
                          Kwota całkowita
                          <CompactAmountInput
                            value={row.totalAmount}
                            onValueChange={(value) => patchMoney(row.key, { totalAmount: value })}
                          />
                        </label>
                        <label className={styles.field}>
                          Waluta
                          <select
                            value={row.currency}
                            onChange={(event) =>
                              patchMoney(row.key, { currency: event.target.value as Currency })
                            }
                          >
                            <option value="yang">Yang</option>
                            <option value="won">Won</option>
                            <option value="gem">GEM</option>
                          </select>
                        </label>
                        <label className={styles.field}>
                          Nasz udział %
                          <input
                            min="0"
                            max="100"
                            step="0.01"
                            type="number"
                            value={row.sharePercent}
                            onChange={(event) =>
                              patchMoney(row.key, {
                                sharePercent: Math.max(
                                  0,
                                  Math.min(100, Number(event.target.value)),
                                ),
                              })
                            }
                          />
                        </label>
                        <div className={styles.moneyResult}>
                          <span>Nasza kwota</span>
                          <strong>{money(directMoneyShare(row), row.currency)}</strong>
                        </div>
                        <button
                          className={styles.buttonGhost}
                          type="button"
                          onClick={() =>
                            setDraftMoney((rows) =>
                              rows.filter((candidate) => candidate.key !== row.key),
                            )
                          }
                        >
                          Usuń
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.grid}>
                <fieldset className={styles.participants}>
                  <legend>Członkowie zespołu na wyprawie</legend>
                  {workspace.members.map((member) => (
                    <label key={member.id}>
                      <input
                        checked={selectedMembers.includes(member.id)}
                        onChange={(event) =>
                          setSelectedMembers((current) =>
                            event.target.checked
                              ? [...new Set([...current, member.id])]
                              : current.filter((id) => id !== member.id),
                          )
                        }
                        type="checkbox"
                      />
                      {member.displayName}
                    </label>
                  ))}
                </fieldset>
                <label className={styles.field}>
                  Osoby / ekipy z zewnątrz
                  <textarea
                    placeholder="np. Hated, Kowalski — oddziel przecinkami"
                    value={outsiders}
                    onChange={(event) => setOutsiders(event.target.value)}
                  />
                </label>
              </div>

              <div className={styles.rowActions}>
                <button className={styles.button} disabled={busy} type="submit">
                  {busy ? 'Zapisywanie…' : 'Zapisz drop'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {expenseOpen ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Nowy koszt</h2>
            </div>
            <form className={styles.formGrid} onSubmit={submitExpense}>
              <label className={`${styles.field} ${styles.wide}`}>
                Opis
                <input
                  placeholder="np. Przepustki na Azraela"
                  value={expenseLabel}
                  onChange={(event) => setExpenseLabel(event.target.value)}
                />
              </label>
              <label className={`${styles.field} ${styles.wide}`}>
                Powiąż z dropem / aktywnością
                <select
                  value={expenseDropSessionId}
                  onChange={(event) => setExpenseDropSessionId(event.target.value)}
                >
                  <option value="">Koszt ogólny</option>
                  {drops.map((drop) => (
                    <option key={drop.id} value={drop.id}>
                      {drop.source} · {new Date(drop.occurredAtIso).toLocaleString('pl-PL')}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Ilość
                <input
                  min="0.0001"
                  step="0.0001"
                  type="number"
                  value={expenseQty}
                  onChange={(event) => setExpenseQty(Math.max(0.0001, Number(event.target.value)))}
                />
              </label>
              <label className={styles.field}>
                Cena / jednostkę
                <CompactAmountInput value={expensePrice} onValueChange={setExpensePrice} />
              </label>
              <label className={styles.field}>
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
              <label className={styles.field}>
                Nasza część kosztu %
                <input
                  min="0"
                  max="100"
                  step="0.01"
                  type="number"
                  value={expenseShare}
                  onChange={(event) =>
                    setExpenseShare(Math.max(0, Math.min(100, Number(event.target.value))))
                  }
                />
              </label>
              <div className={`${styles.rowActions} ${styles.full}`}>
                <button className={styles.button} disabled={busy} type="submit">
                  Zapisz koszt
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <div className={styles.tabs}>
          <button data-active={tab === 'drop'} onClick={() => setTab('drop')} type="button">
            Bilans
          </button>
          <button data-active={tab === 'costs'} onClick={() => setTab('costs')} type="button">
            Koszty
          </button>
          <button data-active={tab === 'history'} onClick={() => setTab('history')} type="button">
            Historia dropów
          </button>
          <button data-active={tab === 'ranking'} onClick={() => setTab('ranking')} type="button">
            Wynik wg źródła
          </button>
        </div>

        {tab === 'drop' ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Bilans · {rangeLabel(range)}</h2>
            </div>
            <div className={styles.grid}>
              {(summary?.totals ?? []).map((total) => (
                <article className={styles.breakdown} key={total.currency}>
                  <span>{total.currency.toUpperCase()}</span>
                  <strong>{money(total.net, total.currency)}</strong>
                  <small>
                    przedmioty {money(total.itemGross, total.currency)} · kasa{' '}
                    {money(total.moneyGross, total.currency)} · koszty{' '}
                    {money(total.costs, total.currency)}
                  </small>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'costs' ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Koszty</h2>
            </div>
            {expenses.length ? (
              <div className={styles.history}>
                {expenses.map((expense) => (
                  <article key={expense.id}>
                    <header>
                      <h3>{expense.label}</h3>
                      <strong>
                        {money(
                          (expense.quantity * expense.unitPrice * expense.ourShareBasisPoints) /
                            10_000,
                          expense.currency,
                        )}
                      </strong>
                    </header>
                    <p>
                      {new Date(expense.occurredAtIso).toLocaleString('pl-PL')} · udział{' '}
                      {(expense.ourShareBasisPoints / 100).toLocaleString('pl-PL')}%
                      {expense.dropSessionId
                        ? ` · ${drops.find((drop) => drop.id === expense.dropSessionId)?.source ?? 'powiązany drop'}`
                        : ' · koszt ogólny'}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>Brak kosztów w wybranym okresie.</p>
            )}
          </section>
        ) : null}

        {tab === 'history' ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Historia dropów</h2>
            </div>
            {drops.length ? (
              <div className={styles.history}>
                {drops.map((drop) => (
                  <article key={drop.id}>
                    <header>
                      <h3>{drop.source}</h3>
                      <strong>{new Date(drop.occurredAtIso).toLocaleString('pl-PL')}</strong>
                    </header>
                    <p>
                      Udział pieniędzy {(drop.ourShareBasisPoints / 100).toLocaleString('pl-PL')}% ·{' '}
                      {drop.pileCount} kupek ·{' '}
                      {drop.participants.map((entry) => entry.displayName).join(', ') ||
                        'bez listy'}
                    </p>
                    {drop.items.length ? (
                      <p>
                        Przedmioty:{' '}
                        {drop.items
                          .map(
                            (item) =>
                              `${item.displayName} ${item.ourQuantity}/${item.totalQuantity}`,
                          )
                          .join(' · ')}
                      </p>
                    ) : null}
                    {drop.money.length ? (
                      <p>
                        Kasa:{' '}
                        {drop.money
                          .map(
                            (entry) =>
                              `${money(entry.ourAmount, entry.currency)} z ${money(entry.totalAmount, entry.currency)} (${(entry.ourShareBasisPoints / 100).toLocaleString('pl-PL')}%)`,
                          )
                          .join(' · ')}
                      </p>
                    ) : null}
                    <DropHistoryActions
                      drop={drop}
                      members={workspace.members}
                      onChanged={load}
                      workspaceId={workspace.id}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>Brak zapisanych dropów w wybranym okresie.</p>
            )}
          </section>
        ) : null}

        {tab === 'ranking' ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Wynik wg źródła · Yang</h2>
            </div>
            {ranking.length ? (
              <div className={styles.rank}>
                {ranking.map(([name, value], index) => (
                  <div key={name}>
                    <b>{index + 1}</b>
                    <span>{name}</span>
                    <strong>{money(value, 'yang')}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>Brak danych do wyliczenia wyniku wg źródła.</p>
            )}
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
