from __future__ import annotations

from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one literal match, got {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


def sub_once(path: str, pattern: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, got {count}: {pattern[:110]}")
    file.write_text(updated)


RANGE_TYPES = """type RangePreset = 'day' | '7d' | '30d' | 'all';

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
"""

TOTAL_HELPER = """const CURRENCIES: readonly Currency[] = ['yang', 'won', 'gem'];

function summaryRows(summary: Summary | null) {
  return CURRENCIES.map((currency) =>
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
"""

# ---------------------------------------------------------------------------
# TEAM ECONOMY: period filters, all currencies, honest source ranking label.
# ---------------------------------------------------------------------------
team = "apps/web/app/teams/[teamId]/economy/team-economy.tsx"
replace_once(team, "type Tab = 'drop' | 'costs' | 'history' | 'ranking';\n", "type Tab = 'drop' | 'costs' | 'history' | 'ranking';\n" + RANGE_TYPES)
replace_once(team, "function money(value: number, currency: Currency): string {", TOTAL_HELPER + "\nfunction money(value: number, currency: Currency): string {")
replace_once(
    team,
    """  const [notice, setNotice] = useState('');
  const [catalogReady, setCatalogReady] = useState(false);
""",
    """  const [notice, setNotice] = useState('');
  const [catalogReady, setCatalogReady] = useState(false);
  const [range, setRange] = useState<RangePreset>('7d');
""",
)
# Replace week-only load with selected range.
sub_once(
    team,
    r"  const load = useCallback\(async \(\) => \{\n    if \(!workspace\) return;\n    setError\(''\);\n    const since = encodeURIComponent\(weekStartIso\(\)\);\n    try \{\n      const \[summaryResponse, dropsResponse, expensesResponse\] = await Promise\.all\(\[\n        fetch\(api\(workspace\.id, `summary\?since=\$\{since\}`\), \{ cache: 'no-store' \}\),\n        fetch\(api\(workspace\.id, `drops\?since=\$\{since\}`\), \{ cache: 'no-store' \}\),\n        fetch\(api\(workspace\.id, `expenses\?since=\$\{since\}`\), \{ cache: 'no-store' \}\),\n      \]\);(.*?)\n  \}, \[workspace\]\);",
    """  const load = useCallback(async () => {
    if (!workspace) return;
    setError('');
    const since = rangeSinceIso(range);
    const suffix = since ? `?since=${encodeURIComponent(since)}` : '';
    try {
      const [summaryResponse, dropsResponse, expensesResponse] = await Promise.all([
        fetch(api(workspace.id, `summary${suffix}`), { cache: 'no-store' }),
        fetch(api(workspace.id, `drops${suffix}`), { cache: 'no-store' }),
        fetch(api(workspace.id, `expenses${suffix}`), { cache: 'no-store' }),
      ]);\1
  }, [workspace, range]);""",
)
# Old Yang-only helper -> all currencies.
sub_once(
    team,
    r"  const yang = summary\?\.totals\.find\(\(total\) => total\.currency === 'yang'\) \?\? \{.*?\n  \};\n",
    "  const totals = summaryRows(summary);\n",
)
# Hero copy and insert range selector.
replace_once(team, "<p>Drop, nasza część, podział na kupki, ceny, koszty i wynik tygodnia.</p>", "<p>Drop, nasza część, podział na kupki, ceny, koszty i wynik dla wybranego okresu.</p>")
metrics_start = """        <section className={styles.metrics}>
          <article className={styles.metric}>
            <span>Przychód · ten tydzień</span>
            <strong>{money(yang.gross, 'yang')}</strong>
            <small>
              przedmioty {money(yang.itemGross, 'yang')} · kasa {money(yang.moneyGross, 'yang')}
            </small>
          </article>
          <article className={styles.metric}>
            <span>Koszty</span>
            <strong>{money(yang.costs, 'yang')}</strong>
          </article>
          <article className={styles.metric}>
            <span>Wynik netto</span>
            <strong className={styles.net}>{money(yang.net, 'yang')}</strong>
          </article>
          <article className={styles.metric}>
            <span>Wyprawy</span>
            <strong>{summary?.runCount ?? 0}</strong>
            <small>
              {catalogReady
                ? `${dobryTematSeed.length} pozycji katalogu lokalnego`
                : 'synchronizacja katalogu…'}
            </small>
          </article>
        </section>
"""
metrics_new = """        <div className={styles.periods} aria-label="Zakres danych ekonomii">
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
            <small>{rangeLabel(range)} · katalog {catalogReady ? 'gotowy' : 'synchronizacja…'}</small>
          </article>
        </section>
"""
replace_once(team, metrics_start, metrics_new)
# Rename misleading profitability ranking and hardcoded weekly copy.
for old, new in {
    ">Tydzień<": ">Bilans<",
    "<h2>Bilans tygodnia</h2>": "<h2>Bilans · {rangeLabel(range)}</h2>",
    "Brak kosztów w tym tygodniu.": "Brak kosztów w wybranym okresie.",
    "Brak zapisanych dropów w tym tygodniu.": "Brak zapisanych dropów w wybranym okresie.",
    ">Dochodowość<": ">Źródła dropu<",
    "<h2>Dochodowość aktywności · Yang</h2>": "<h2>Wartość dropu wg źródła · Yang</h2>",
    "Za mało danych do rankingu.": "Brak danych o wartości dropów w wybranym okresie.",
}.items():
    text = Path(team).read_text()
    if old not in text:
        raise SystemExit(f"team copy not found: {old}")
    Path(team).write_text(text.replace(old, new, 1))

# Team CSS range/filter and stacked currencies.
team_css = Path("apps/web/app/teams/[teamId]/economy/team-economy.module.css")
css = team_css.read_text()
css += """

.periods {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 14px 0 0;
}

.period,
.periodActive {
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(11, 16, 26, 0.86);
  color: var(--muted-strong);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.periodActive {
  border-color: rgba(57, 136, 255, 0.55);
  background: rgba(57, 136, 255, 0.16);
  color: #c8dcff;
  box-shadow: inset 0 0 0 1px rgba(57, 136, 255, 0.1);
}

.currencyValues {
  display: grid;
  gap: 3px;
  margin-top: 5px;
}

.currencyValues strong {
  margin: 0;
}
"""
team_css.write_text(css)

# ---------------------------------------------------------------------------
# PRIVATE ECONOMY: same date filters, all currencies and live catalog binding.
# ---------------------------------------------------------------------------
private = "apps/web/app/economy/private/page.tsx"
# Types.
replace_once(private, "type Currency = 'yang' | 'won' | 'gem';\n", "type Currency = 'yang' | 'won' | 'gem';\n" + RANGE_TYPES)
replace_once(
    private,
    """type DraftItem = {
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
""",
    """type DraftItem = {
  key: string;
  itemId: string | null;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  confidence: number | null;
};
type AiItem = {
  recognizedName: string;
  quantity: number;
  confidence: number;
  catalogMatch: { id: string; name: string; category: string; imageUrl: string | null } | null;
};
type CatalogSearchItem = {
  id: string;
  canonicalName: string;
  category: string;
  imageUrl: string | null;
  lastPrice: { unitPrice: number; currency: Currency; createdAtIso: string } | null;
};
""",
)
replace_once(private, "function money(value: number, currency: Currency): string {", TOTAL_HELPER + "\nfunction money(value: number, currency: Currency): string {")
# State range.
replace_once(
    private,
    """  const [notice, setNotice] = useState('');
  const [source, setSource] = useState('Wyprawa');
""",
    """  const [notice, setNotice] = useState('');
  const [range, setRange] = useState<RangePreset>('7d');
  const [source, setSource] = useState('Wyprawa');
""",
)
# Load selected period.
sub_once(
    private,
    r"  const load = useCallback\(async \(\) => \{\n    const since = encodeURIComponent\(weekStartIso\(\)\);\n    setError\(''\);\n    try \{\n      const \[summaryResponse, dropsResponse, expensesResponse\] = await Promise\.all\(\[\n        fetch\(api\(`summary\?since=\$\{since\}`\), \{ cache: 'no-store' \}\),\n        fetch\(api\(`drops\?since=\$\{since\}`\), \{ cache: 'no-store' \}\),\n        fetch\(api\(`expenses\?since=\$\{since\}`\), \{ cache: 'no-store' \}\),\n      \]\);(.*?)\n  \}, \[\]\);",
    """  const load = useCallback(async () => {
    const since = rangeSinceIso(range);
    const suffix = since ? `?since=${encodeURIComponent(since)}` : '';
    setError('');
    try {
      const [summaryResponse, dropsResponse, expensesResponse] = await Promise.all([
        fetch(api(`summary${suffix}`), { cache: 'no-store' }),
        fetch(api(`drops${suffix}`), { cache: 'no-store' }),
        fetch(api(`expenses${suffix}`), { cache: 'no-store' }),
      ]);\1
  }, [range]);""",
)
# Yang only -> all totals.
sub_once(
    private,
    r"  const yang = summary\?\.totals\.find\(\(row\) => row\.currency === 'yang'\) \?\? \{.*?\n  \};\n",
    "  const totals = summaryRows(summary);\n",
)
# Manual item fields.
replace_once(
    private,
    "{ key: `manual-${Date.now()}`, name: '', quantity: 1, unitPrice: 0, currency: 'yang', confidence: null },",
    "{ key: `manual-${Date.now()}`, itemId: null, name: '', category: 'Pozostałe', quantity: 1, unitPrice: 0, currency: 'yang', confidence: null },",
)
# Resolver used by AI/manual blur/submit.
resolver = """
  const resolveCatalogItem = useCallback(async (name: string): Promise<CatalogSearchItem | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const response = await fetch(api(`items?q=${encodeURIComponent(trimmed)}`), { cache: 'no-store' });
    if (!response.ok) return null;
    const candidates = (await response.json()) as CatalogSearchItem[];
    return (
      candidates.find(
        (candidate) =>
          candidate.canonicalName.trim().toLocaleLowerCase('pl-PL') ===
          trimmed.toLocaleLowerCase('pl-PL'),
      ) ?? null
    );
  }, []);

  const bindDraftToCatalog = useCallback(
    async (key: string, name: string) => {
      const match = await resolveCatalogItem(name);
      if (!match) return;
      setItems((current) =>
        current.map((item) =>
          item.key === key
            ? {
                ...item,
                itemId: match.id,
                name: match.canonicalName,
                category: match.category,
                unitPrice: item.unitPrice > 0 ? item.unitPrice : (match.lastPrice?.unitPrice ?? 0),
                currency: item.unitPrice > 0 ? item.currency : (match.lastPrice?.currency ?? item.currency),
              }
            : item,
        ),
      );
    },
    [resolveCatalogItem],
  );
"""
replace_once(private, "  const recognize = async (event: ChangeEvent<HTMLInputElement>) => {", resolver + "\n  const recognize = async (event: ChangeEvent<HTMLInputElement>) => {")
# AI mapping becomes live catalog-aware.
sub_once(
    private,
    r"      setItems\(body\.items\.map\(\(item, index\) => \(\{.*?\}\)\)\);",
    """      const resolved = await Promise.all(
        body.items.map(async (item, index): Promise<DraftItem> => {
          const recognizedName = item.catalogMatch?.name ?? item.recognizedName;
          const match = await resolveCatalogItem(recognizedName);
          return {
            key: `ai-${Date.now()}-${index}`,
            itemId: match?.id ?? null,
            name: match?.canonicalName ?? recognizedName,
            category: match?.category ?? item.catalogMatch?.category ?? 'Pozostałe',
            quantity: Math.max(1, Math.floor(item.quantity)),
            unitPrice: match?.lastPrice?.unitPrice ?? 0,
            currency: match?.lastPrice?.currency ?? 'yang',
            confidence: item.confidence,
          };
        }),
      );
      setItems(resolved);""",
)
# submit resolves IDs / creates only if truly missing.
replace_once(private, "    setBusy(true);\n    setError('');\n    try {\n      const response = await fetch(api('drops'), {", """    setBusy(true);
    setError('');
    try {
      const resolvedItems: DraftItem[] = [];
      for (const item of items) {
        let itemId = item.itemId;
        let category = item.category;
        if (!itemId) {
          const match = await resolveCatalogItem(item.name);
          if (match) {
            itemId = match.id;
            category = match.category;
          }
        }
        if (!itemId) {
          const createResponse = await fetch(api('items'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              canonicalName: item.name.trim(),
              category: category || 'Pozostałe',
            }),
          });
          if (!createResponse.ok) throw new Error(`Nie udało się powiązać przedmiotu: ${item.name}.`);
          const created = (await createResponse.json()) as { id: string };
          itemId = created.id;
        }
        resolvedItems.push({ ...item, itemId, category });
      }
      const response = await fetch(api('drops'), {""")
replace_once(
    private,
    """          items: items.map((item) => ({
            itemId: null,
            displayName: item.name.trim(),
""",
    """          items: resolvedItems.map((item) => ({
            itemId: item.itemId,
            displayName: item.name.trim(),
""",
)
replace_once(private, "items: items.map((item) => ({ name: item.name.trim(), quantity: item.quantity })),", "items: resolvedItems.map((item) => ({ name: item.name.trim(), quantity: item.quantity })),")
# Manual input resets binding on edit and binds on blur.
replace_once(
    private,
    "<label className={styles.field}>Przedmiot<input list=\"private-economy-catalog\" onChange={(event) => patchItem(item.key, { name: event.target.value })} value={item.name} />",
    "<label className={styles.field}>Przedmiot<input list=\"private-economy-catalog\" onBlur={() => void bindDraftToCatalog(item.key, item.name)} onChange={(event) => patchItem(item.key, { name: event.target.value, itemId: null })} value={item.name} />",
)
# Metrics + periods.
old_private_metrics = """        <section className={styles.metrics}>
          <article className={styles.metric}><span>Przychód · tydzień</span><strong>{money(yang.gross, 'yang')}</strong><small>przedmioty {money(yang.itemGross, 'yang')} · kasa {money(yang.moneyGross, 'yang')}</small></article>
          <article className={styles.metric}><span>Koszty</span><strong>{money(yang.costs, 'yang')}</strong></article>
          <article className={styles.metric}><span>Wynik netto</span><strong>{money(yang.net, 'yang')}</strong></article>
          <article className={styles.metric}><span>Wyprawy</span><strong>{summary?.runCount ?? 0}</strong></article>
        </section>
"""
new_private_metrics = """        <div className={styles.periods} aria-label="Zakres danych ekonomii">
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
              {totals.map((total) => <strong key={total.currency}>{money(total.gross, total.currency)}</strong>)}
            </div>
          </article>
          <article className={styles.metric}>
            <span>Koszty</span>
            <div className={styles.currencyValues}>
              {totals.map((total) => <strong key={total.currency}>{money(total.costs, total.currency)}</strong>)}
            </div>
          </article>
          <article className={styles.metric}>
            <span>Wynik netto</span>
            <div className={styles.currencyValues}>
              {totals.map((total) => <strong key={total.currency}>{money(total.net, total.currency)}</strong>)}
            </div>
          </article>
          <article className={styles.metric}><span>Wpisy dropów</span><strong>{summary?.runCount ?? 0}</strong><small>{rangeLabel(range)}</small></article>
        </section>
"""
replace_once(private, old_private_metrics, new_private_metrics)

# Private CSS selectors.
private_css = Path("apps/web/app/economy/economy.module.css")
css = private_css.read_text()
css += """

.periods {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 14px 0 0;
}

.period,
.periodActive {
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(11, 16, 26, 0.86);
  color: var(--muted-strong);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.periodActive {
  border-color: rgba(57, 136, 255, 0.55);
  background: rgba(57, 136, 255, 0.16);
  color: #c8dcff;
}

.currencyValues {
  display: grid;
  gap: 3px;
  margin-top: 5px;
}

.currencyValues strong {
  margin: 0;
  font-size: 17px;
}
"""
private_css.write_text(css)

print("economy data UX polish applied")
