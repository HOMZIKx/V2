from __future__ import annotations

from pathlib import Path
import json

ROOT = Path('.')
CATALOG_PATH = ROOT / 'apps/web/src/data/dobry-temat-item-catalog.json'
PH_MAP_PATH = ROOT / 'apps/web/src/data/ph-item-icon-map.json'
MIGRATIONS = ROOT / 'services/player-team-service/migrations'
TEST_PATH = ROOT / 'apps/web/src/item-image-path-regression.spec.ts'

catalog_doc = json.loads(CATALOG_PATH.read_text())
items = catalog_doc['items'] if isinstance(catalog_doc, dict) else catalog_doc
ph_map = json.loads(PH_MAP_PATH.read_text())

if len(items) != 678:
    raise SystemExit(f'expected 678 catalog items, got {len(items)}')


def canonical_image(item: dict[str, object]) -> str:
    title = str(item.get('title', '')).strip()
    ph = ph_map.get(title)
    if isinstance(ph, str) and ph.strip():
        return ph.strip()
    raw = str(item.get('image_url', '') or '').strip()
    if raw.startswith('/item-database/wiki/'):
        return '/game/items/wiki/' + raw.removeprefix('/item-database/wiki/')
    if raw.startswith('/game/items/'):
        return raw
    raise SystemExit(f'missing canonical image for {title!r}: {raw!r}')


def sql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"

rows: list[tuple[str, str, str, str]] = []
seen_ids: set[str] = set()
seen_names: set[str] = set()
for raw_item in items:
    if not isinstance(raw_item, dict):
        raise SystemExit('catalog entry is not an object')
    item_id = str(raw_item.get('id', '')).strip()
    name = str(raw_item.get('title', '')).strip()
    category = str(raw_item.get('category', '') or 'Pozostałe').strip() or 'Pozostałe'
    image = canonical_image(raw_item)
    if not item_id or not name:
        raise SystemExit(f'invalid catalog row: {raw_item!r}')
    name_key = name.casefold()
    if item_id in seen_ids:
        raise SystemExit(f'duplicate item id: {item_id}')
    if name_key in seen_names:
        raise SystemExit(f'duplicate canonical item name: {name}')
    seen_ids.add(item_id)
    seen_names.add(name_key)
    rows.append((item_id, name, category, image))

repair_values = ',\n'.join(
    f"    ({sql(name)}, {sql(image)})" for _, name, _, image in rows
)
repair = f"""-- Repair economy item images using the canonical DOBRYTEMAT catalog.
-- Source order matches apps/web/src/item-catalog.ts: PH title override, then imported image_url.
-- Intentionally does not use wiki-item-image-map.json; that map is empty after image-integrity cleanup.

WITH canonical_images(canonical_name, image_url) AS (
  VALUES
{repair_values}
)
UPDATE player_team_economy_items AS item
SET image_url = canonical_images.image_url,
    updated_at = NOW()
FROM canonical_images
WHERE LOWER(item.canonical_name) = LOWER(canonical_images.canonical_name)
  AND item.image_url IS DISTINCT FROM canonical_images.image_url;
"""
(MIGRATIONS / '008_economy_catalog_image_repair.sql').write_text(repair)

seed_values = ',\n'.join(
    f"    ({sql(item_id)}, {sql(name)}, {sql(category)}, {sql(image)}, 'system:dobry-temat-catalog')"
    for item_id, name, category, image in rows
)
seed = f"""-- Seed missing canonical economy items server-side.
-- Existing rows with the same id or case-insensitive canonical name are preserved.

WITH canonical_items(id, canonical_name, category, image_url, created_by) AS (
  VALUES
{seed_values}
)
INSERT INTO player_team_economy_items (
  id,
  canonical_name,
  category,
  image_url,
  created_by
)
SELECT
  id,
  canonical_name,
  category,
  image_url,
  created_by
FROM canonical_items
ON CONFLICT DO NOTHING;
"""
(MIGRATIONS / '009_economy_catalog_seed.sql').write_text(seed)

text = TEST_PATH.read_text()
old_import = "import { catalogItemForWikiFilename } from './server/item-image-proxy.js';"
new_import = "import { catalogItemForWikiFilename, getCatalogWikiImageResponse } from './server/item-image-proxy.js';"
if old_import not in text:
    raise SystemExit('expected proxy import not found in regression test')
text = text.replace(old_import, new_import, 1)

anchor = """  it('does not silently point an item id at another item wiki asset', () => {
"""
new_test = """  it('tries the exact wiki filename before fuzzy page-image discovery for missing local assets', async () => {
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
if anchor not in text:
    raise SystemExit('test insertion anchor not found')
text = text.replace(anchor, new_test + anchor, 1)
TEST_PATH.write_text(text)

print(f'generated migrations and regression test for {len(rows)} canonical items')
