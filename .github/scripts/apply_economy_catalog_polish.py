from __future__ import annotations

from pathlib import Path
import json
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one literal match, got {count}: {old[:90]!r}")
    file.write_text(text.replace(old, new, 1))


def sub_once(path: str, pattern: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, got {count}: {pattern[:100]}")
    file.write_text(updated)


# 1. Canonical imports must repair stale/wrong image URLs already stored in PostgreSQL.
replace_once(
    "services/player-team-service/src/infrastructure/db/team-economy.repository.ts",
    "image_url = COALESCE(image_url, $3),",
    "image_url = COALESCE($3, image_url),",
)

# 2. Missing local wiki image: exact item-title redirect before fuzzy page-image matching.
proxy = "apps/web/src/server/item-image-proxy.ts"
fuzzy = """  const resolvedUrl = await resolveWikiImageUrl(item, fetchImpl);
  if (resolvedUrl) {
    const image = await fetchRemoteImage(fetchImpl, resolvedUrl);
    if (image) return image;
  }
"""
exact = """  for (const candidate of itemTitleRedirectCandidates(item)) {
    const image = await fetchRemoteImage(fetchImpl, candidate);
    if (image) return image;
  }
"""
replace_once(
    proxy,
    fuzzy + "\n" + exact,
    """  // Prefer an exact item filename first. Wiki pages can contain several visually
  // similar images and fuzzy matching must only be a last-resort fallback.
"""
    + exact
    + "\n"
    + fuzzy,
)

# 3. One-time DB repair generated from the canonical retained item catalog.
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


canonical_rows: list[tuple[str, str]] = []
for item in items:
    if not isinstance(item, dict):
        continue
    name = str(item.get("title", "")).strip()
    image = source_image(item)
    if name and image:
        canonical_rows.append((name, image))

values = ",\n".join(
    "    ('" + name.replace("'", "''") + "', '" + image.replace("'", "''") + "')"
    for name, image in canonical_rows
)
migration = """-- Repair economy catalog images from the canonical DOBRYTEMAT catalog.
-- Generated from the retained V2 item dump and its image maps.
-- Update by canonical name so legacy IDs and foreign-key history stay intact.

WITH canonical_images(canonical_name, image_url) AS (
  VALUES
""" + values + """
)
UPDATE player_team_economy_items AS item
SET image_url = canonical_images.image_url,
    updated_at = NOW()
FROM canonical_images
WHERE LOWER(item.canonical_name) = LOWER(canonical_images.canonical_name)
  AND item.image_url IS DISTINCT FROM canonical_images.image_url;
"""
Path("services/player-team-service/migrations/008_economy_catalog_image_repair.sql").write_text(migration)

# 4. Team AI: bind recognized items to the live DB catalog and prefill latest known price.
team = "apps/web/app/teams/[teamId]/economy/team-economy.tsx"
sub_once(
    team,
    r"(type AiItem = \{.*?\n\};\n)",
    r"""\1
type CatalogSearchItem = {
  id: string;
  canonicalName: string;
  category: string;
  imageUrl: string | null;
  lastPrice: { unitPrice: number; currency: Currency; createdAtIso: string } | null;
};
""",
)
sub_once(
    team,
    r"      setDraftItems\(\s*body\.items\.map\(\(item, index\) => \(\{.*?\}\)\),\s*\);",
    """      const resolvedAiItems = await Promise.all(
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
      setDraftItems(resolvedAiItems);""",
)

# Exact canonical lookup before creating a catalog item while saving a new drop.
sub_once(
    team,
    r"        if \(!itemId\) \{\n          const response = await fetch\(api\(workspace\.id, 'items'\), \{.*?          itemId = saved\.id;\n        \}",
    """        if (!itemId) {
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
        }""",
)

# 5. Same exact lookup before creating an item from historical-drop editing.
history = "apps/web/app/teams/[teamId]/economy/drop-history-actions.tsx"
sub_once(
    history,
    r"      const response = await fetch\(api\(workspaceId, 'items'\), \{.*?      resolved\.push\(\{ \.\.\.item, itemId: saved\.id \}\);",
    """      const searchResponse = await fetch(
        api(workspaceId, `items?q=${encodeURIComponent(item.displayName.trim())}`),
        { cache: 'no-store' },
      );
      if (searchResponse.ok) {
        const candidates = (await searchResponse.json()) as Array<{
          id: string;
          canonicalName: string;
        }>;
        const exactMatch = candidates.find(
          (candidate) =>
            candidate.canonicalName.trim().toLocaleLowerCase('pl-PL') ===
            item.displayName.trim().toLocaleLowerCase('pl-PL'),
        );
        if (exactMatch) {
          resolved.push({ ...item, itemId: exactMatch.id });
          continue;
        }
      }
      const response = await fetch(api(workspaceId, 'items'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canonicalName: item.displayName.trim(), category: 'Pozostałe' }),
      });
      if (!response.ok) throw new Error(`Nie udało się zapisać przedmiotu: ${item.displayName}.`);
      const saved = (await response.json()) as { id: string };
      resolved.push({ ...item, itemId: saved.id });""",
)

# 6. Price hints: median + freshness, while retaining average as context.
hint = "apps/web/app/teams/[teamId]/economy/market-price-hint.tsx"
replace_once(
    hint,
    """  const selected = useMemo(
    () => prices.find((price) => price.currency === currency) ?? null,
    [currency, prices],
  );
""",
    """  const stats = useMemo(() => {
    const rows = prices.filter((price) => price.currency === currency);
    const latest = rows[0] ?? null;
    if (!latest) return null;
    const values = rows.map((price) => price.unitPrice).sort((left, right) => left - right);
    const middle = Math.floor(values.length / 2);
    const median =
      values.length % 2 === 0
        ? ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2
        : (values[middle] ?? 0);
    const ageDays = Math.max(
      0,
      (Date.now() - new Date(latest.createdAtIso).getTime()) / 86_400_000,
    );
    const freshness = ageDays <= 3 ? 'świeża' : ageDays <= 14 ? 'starsza' : 'nieaktualna';
    return { latest, median, freshness, recentCount: rows.length };
  }, [currency, prices]);
""",
)
hint_file = Path(hint)
hint_text = hint_file.read_text()
hint_text = hint_text.replace("if (!selected) {", "if (!stats) {", 1)
hint_text = hint_text.replace("selected.unitPrice", "stats.latest.unitPrice")
hint_text = hint_text.replace("selected.createdAtIso", "stats.latest.createdAtIso")
hint_text = hint_text.replace("selected.averagePrice", "stats.latest.averagePrice")
hint_text = hint_text.replace("selected.sampleCount", "stats.latest.sampleCount")
average_marker = """      <div className={styles.row}>
        <span>Średnia:</span>"""
median_row = """      <div className={styles.row}>
        <span>Mediana:</span>
        <strong>{compact(stats.median, currency)}</strong>
        <span>· {stats.recentCount} ostatnich wpisów · {stats.freshness}</span>
        <button className={styles.action} onClick={() => onUsePrice(stats.median)} type="button">
          Użyj mediany
        </button>
      </div>
"""
if hint_text.count(average_marker) != 1:
    raise SystemExit("market price hint: average marker mismatch")
hint_file.write_text(hint_text.replace(average_marker, median_row + average_marker, 1))

# 7. Economy visual identity = application visual identity, not a separate gold/green theme.
economy_css = Path("apps/web/app/economy/economy.module.css")
css = economy_css.read_text()
for old, new in {
    "#fff3c8": "var(--text)",
    "rgba(196, 154, 69, 0.22)": "rgba(57, 136, 255, 0.18)",
    "rgba(196, 154, 69, 0.1)": "rgba(57, 136, 255, 0.08)",
    "rgba(224, 186, 99, 0.35)": "rgba(57, 136, 255, 0.34)",
    "rgba(196, 154, 69, 0.055)": "rgba(57, 136, 255, 0.055)",
    "#d2aa54": "#82b0ff",
    "linear-gradient(180deg, #d4aa55, #b98b35)": "linear-gradient(180deg, var(--red), var(--red-deep))",
    "color: #151109;": "color: #fff;",
    "rgba(196, 154, 69, 0.18)": "rgba(227, 60, 87, 0.2)",
    "rgba(210, 170, 84, 0.42)": "rgba(57, 136, 255, 0.42)",
    "rgba(196, 154, 69, 0.16)": "rgba(57, 136, 255, 0.14)",
    "#e6c36d": "#aecdff",
    "rgba(196, 154, 69, 0.09)": "rgba(57, 136, 255, 0.08)",
    "rgba(210, 170, 84, 0.5)": "rgba(57, 136, 255, 0.52)",
    "rgba(196, 154, 69, 0.08)": "rgba(57, 136, 255, 0.08)",
    "#ead294": "#b9d2ff",
}.items():
    css = css.replace(old, new)
economy_css.write_text(css)

team_css = Path("apps/web/app/teams/[teamId]/economy/team-economy.module.css")
css = team_css.read_text()
for old, new in {
    "rgba(240, 189, 100, 0.07)": "rgba(227, 60, 87, 0.07)",
    "color: var(--amber);": "color: #82b0ff;",
    "border-color: rgba(240, 189, 100, 0.34);": "border-color: rgba(227, 60, 87, 0.38);",
    "background: linear-gradient(180deg, rgba(240, 189, 100, 0.16), rgba(240, 189, 100, 0.08));": "background: linear-gradient(180deg, rgba(227, 60, 87, 0.24), rgba(140, 29, 52, 0.18));",
    "border-color: rgba(240, 189, 100, 0.55);": "border-color: rgba(227, 60, 87, 0.6);",
    "background: linear-gradient(180deg, rgba(240, 189, 100, 0.22), rgba(240, 189, 100, 0.11));": "background: linear-gradient(180deg, rgba(227, 60, 87, 0.3), rgba(140, 29, 52, 0.22));",
    "color: var(--green) !important;": "color: var(--silver) !important;",
    "border: 1px solid rgba(240, 189, 100, 0.2);": "border: 1px solid rgba(57, 136, 255, 0.22);",
    "background: rgba(240, 189, 100, 0.045);": "background: rgba(57, 136, 255, 0.05);",
}.items():
    css = css.replace(old, new)
css = css.replace("color: #f4d69b;", "color: #ffd7df;", 1)
css = css.replace("color: #f4d69b;", "color: #b9d2ff;")
team_css.write_text(css)

# 8. Regression for fallback order on a known missing local asset.
test = Path("apps/web/src/item-image-path-regression.spec.ts")
text = test.read_text()
replace_import = "import { catalogItemForWikiFilename } from './server/item-image-proxy.js';"
new_import = "import { catalogItemForWikiFilename, getCatalogWikiImageResponse } from './server/item-image-proxy.js';"
if text.count(replace_import) != 1:
    raise SystemExit("item image spec: import mismatch")
text = text.replace(replace_import, new_import, 1)
test_case = """
  it('tries the exact wiki filename before fuzzy discovery for missing local assets', async () => {
    const requested: string[] = [];
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.includes('/Special:Redirect/file/Amulet_Karmy_1.png')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const response = await getCatalogWikiImageResponse('wiki_d69e989913be0bfd.png', fakeFetch);
    expect(response.status).toBe(200);
    expect(requested[0]).toContain('/Special:Redirect/file/Amulet_Karmy_1.png');
    expect(requested.some((url) => url.includes('/api.php'))).toBe(false);
  });
"""
closing = "\n});\n"
if text.count(closing) != 1:
    raise SystemExit("item image spec: closing marker mismatch")
test.write_text(text.replace(closing, test_case + closing, 1))

print(f"canonical image repair rows: {len(canonical_rows)}")
