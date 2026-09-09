from __future__ import annotations

from pathlib import Path
import json
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


# Remove obsolete week-only helpers.
for path in [
    "apps/web/app/economy/private/page.tsx",
    "apps/web/app/teams/[teamId]/economy/team-economy.tsx",
]:
    sub_once(
        path,
        r"\nfunction weekStartIso\(\): string \{.*?\n\}\n",
        "\n",
    )

# ---------------------------------------------------------------------------
# Central catalog bootstrap: migrations own it, not the browser.
# ---------------------------------------------------------------------------
catalog = json.loads(Path("apps/web/src/data/dobry-temat-item-catalog.json").read_text())
items = catalog["items"] if isinstance(catalog, dict) and "items" in catalog else catalog
wiki_map = json.loads(Path("apps/web/src/data/wiki-item-image-map.json").read_text())
ph_map = json.loads(Path("apps/web/src/data/ph-item-icon-map.json").read_text())


def source_image(item: dict[str, object]) -> str | None:
    title = str(item.get("title", "")).strip()
    item_id = str(item.get("id", "")).strip()
    ph_value = ph_map.get(title)
    if isinstance(ph_value, str) and ph_value:
        return ph_value
    wiki_value = wiki_map.get(item_id)
    if isinstance(wiki_value, str) and wiki_value:
        return wiki_value
    raw = item.get("image_url")
    if isinstance(raw, str) and raw.startswith("/item-database/wiki/"):
        return "/game/items/wiki/" + raw.rsplit("/", 1)[-1]
    if isinstance(raw, str) and raw.startswith("/game/items/"):
        return raw
    return None


rows: list[tuple[str, str, str, str | None]] = []
for raw_item in items:
    if not isinstance(raw_item, dict):
        continue
    item_id = str(raw_item.get("id", "")).strip()
    name = str(raw_item.get("title", "")).strip()
    category = str(raw_item.get("category", "") or "Pozostałe").strip() or "Pozostałe"
    if item_id and name:
        rows.append((item_id, name, category, source_image(raw_item)))


def sql(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


values = ",\n".join(
    f"    ({sql(item_id)}, {sql(name)}, {sql(category)}, {sql(image)})"
    for item_id, name, category, image in rows
)
seed_migration = """-- Seed any missing canonical economy items server-side.
-- The browser is no longer responsible for bootstrapping the shared catalog.

WITH canonical_items(id, canonical_name, category, image_url) AS (
  VALUES
""" + values + """
)
INSERT INTO player_team_economy_items (id, canonical_name, category, image_url)
SELECT id, canonical_name, category, image_url
FROM canonical_items
ON CONFLICT DO NOTHING;
"""
Path("services/player-team-service/migrations/009_economy_catalog_seed.sql").write_text(seed_migration)

team = "apps/web/app/teams/[teamId]/economy/team-economy.tsx"
# Remove frontend catalog sync state and callback.
replace_once(team, "  const [catalogReady, setCatalogReady] = useState(false);\n", "")
sub_once(
    team,
    r"\n  const ensureCatalog = useCallback\(async \(\) => \{.*?\n  \}, \[workspace, catalogReady\]\);\n",
    "\n",
)
replace_once(
    team,
    """  useEffect(() => {
    void ensureCatalog();
    void load();
  }, [ensureCatalog, load]);
""",
    """  useEffect(() => {
    void load();
  }, [load]);
""",
)
replace_once(
    team,
    "<small>{rangeLabel(range)} · katalog {catalogReady ? 'gotowy' : 'synchronizacja…'}</small>",
    "<small>{rangeLabel(range)} · katalog centralny</small>",
)

# ---------------------------------------------------------------------------
# Costs can already reference a drop_session in the backend: expose it in UI.
# ---------------------------------------------------------------------------
replace_once(
    team,
    """type Expense = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  ourShareBasisPoints: number;
  occurredAtIso: string;
};
""",
    """type Expense = {
  id: string;
  dropSessionId: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  ourShareBasisPoints: number;
  occurredAtIso: string;
};
""",
)
replace_once(
    team,
    """  const [expenseCurrency, setExpenseCurrency] = useState<Currency>('yang');
  const [expenseShare, setExpenseShare] = useState(100);
""",
    """  const [expenseCurrency, setExpenseCurrency] = useState<Currency>('yang');
  const [expenseShare, setExpenseShare] = useState(100);
  const [expenseDropSessionId, setExpenseDropSessionId] = useState('');
""",
)
# Upgrade source ranking to subtract linked Yang costs.
sub_once(
    team,
    r"  const ranking = useMemo\(\n    \(\) =>\n      Object\.entries\(\n        drops\.reduce<Record<string, number>>\(\(acc, drop\) => \{.*?\n    \[drops\],\n  \);",
    """  const ranking = useMemo(() => {
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
      const cost =
        (expense.quantity * expense.unitPrice * expense.ourShareBasisPoints) / 10_000;
      values.set(source, (values.get(source) ?? 0) - cost);
    }
    return [...values.entries()].sort((left, right) => right[1] - left[1]);
  }, [drops, expenses]);""",
)
# POST linkage.
replace_once(
    team,
    """        body: JSON.stringify({
          label: expenseLabel.trim(),
""",
    """        body: JSON.stringify({
          dropSessionId: expenseDropSessionId || null,
          label: expenseLabel.trim(),
""",
)
replace_once(team, "      setExpensePrice(0);\n", "      setExpensePrice(0);\n      setExpenseDropSessionId('');\n")
# Cost form selector.
expense_form_marker = """              <label className={`${styles.field} ${styles.wide}`}>
                Opis
                <input
                  placeholder="np. Przepustki na Azraela"
                  value={expenseLabel}
                  onChange={(event) => setExpenseLabel(event.target.value)}
                />
              </label>
"""
expense_form_new = expense_form_marker + """              <label className={`${styles.field} ${styles.wide}`}>
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
"""
replace_once(team, expense_form_marker, expense_form_new)
# Show linkage in cost history.
replace_once(
    team,
    """                    <p>
                      {new Date(expense.occurredAtIso).toLocaleString('pl-PL')} · udział{' '}
                      {(expense.ourShareBasisPoints / 100).toLocaleString('pl-PL')}%
                    </p>
""",
    """                    <p>
                      {new Date(expense.occurredAtIso).toLocaleString('pl-PL')} · udział{' '}
                      {(expense.ourShareBasisPoints / 100).toLocaleString('pl-PL')}%
                      {expense.dropSessionId
                        ? ` · ${drops.find((drop) => drop.id === expense.dropSessionId)?.source ?? 'powiązany drop'}`
                        : ' · koszt ogólny'}
                    </p>
""",
)
# Rename tab/header to actual net result by source.
replace_once(team, "            Źródła dropu\n", "            Wynik wg źródła\n")
replace_once(team, "<h2>Wartość dropu wg źródła · Yang</h2>", "<h2>Wynik wg źródła · Yang</h2>")
replace_once(
    team,
    "Brak danych o wartości dropów w wybranym okresie.",
    "Brak danych do wyliczenia wyniku wg źródła.",
)

# Private cost linkage uses the same existing backend field.
private = "apps/web/app/economy/private/page.tsx"
replace_once(
    private,
    """type Expense = {
  id: string;
  label: string;
""",
    """type Expense = {
  id: string;
  dropSessionId: string | null;
  label: string;
""",
)
replace_once(
    private,
    """  const [costUnitPrice, setCostUnitPrice] = useState(0);
  const [costCurrency, setCostCurrency] = useState<Currency>('yang');
""",
    """  const [costUnitPrice, setCostUnitPrice] = useState(0);
  const [costCurrency, setCostCurrency] = useState<Currency>('yang');
  const [costDropSessionId, setCostDropSessionId] = useState('');
""",
)
replace_once(
    private,
    """        body: JSON.stringify({
          label: costLabel.trim(),
""",
    """        body: JSON.stringify({
          dropSessionId: costDropSessionId || null,
          label: costLabel.trim(),
""",
)
replace_once(private, "      setCostUnitPrice(0);\n", "      setCostUnitPrice(0);\n      setCostDropSessionId('');\n")
# Insert selector before quantity field in private cost form.
private_cost_marker = """                <label className={styles.field}>Ilość<input min="0.0001" step="0.0001" type="number" onChange={(event) => setCostQuantity(Math.max(0.0001, Number(event.target.value)))} value={costQuantity} /></label>
"""
# Prettier likely expanded this, so use regex insertion instead.
sub_once(
    private,
    r"(\s*<label className=\{styles\.field\}>\s*Ilość\s*<input)",
    """
                <label className={styles.field}>
                  Powiąż z dropem / aktywnością
                  <select
                    value={costDropSessionId}
                    onChange={(event) => setCostDropSessionId(event.target.value)}
                  >
                    <option value="">Koszt ogólny</option>
                    {drops.map((drop) => (
                      <option key={drop.id} value={drop.id}>
                        {drop.source} · {new Date(drop.occurredAtIso).toLocaleString('pl-PL')}
                      </option>
                    ))}
                  </select>
                </label>\1""",
)

# Remove last non-semantic gold border from private notice; warning colors stay semantic amber.
private_css = Path("apps/web/app/economy/economy.module.css")
css = private_css.read_text().replace(
    "border: 1px solid rgba(210, 170, 84, 0.2);",
    "border: 1px solid rgba(57, 136, 255, 0.22);",
)
private_css.write_text(css)

print(f"central catalog seed rows: {len(rows)}")
