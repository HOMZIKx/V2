from pathlib import Path
import json

catalog = json.loads(Path('apps/web/src/data/dobry-temat-item-catalog.json').read_text())['items']
ph = json.loads(Path('apps/web/src/data/ph-item-icon-map.json').read_text())
missing = []
for item in catalog:
    title = str(item.get('title', '')).strip()
    raw = str(item.get('image_url', '') or '').strip()
    override = ph.get(title)
    if isinstance(override, str) and override.strip():
        continue
    if raw.startswith('/item-database/wiki/') or raw.startswith('/game/items/'):
        continue
    missing.append((str(item.get('id', '')).strip(), title, raw, str(item.get('wiki_url', '') or '').strip()))
print(f'catalog={len(catalog)} missing={len(missing)}')
for row in missing:
    print('MISSING\t' + '\t'.join(row))
if missing:
    raise SystemExit(2)
