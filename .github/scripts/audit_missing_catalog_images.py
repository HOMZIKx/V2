from pathlib import Path
import json

catalog = json.loads(Path('apps/web/src/data/dobry-temat-item-catalog.json').read_text())['items']
ph = json.loads(Path('apps/web/src/data/ph-item-icon-map.json').read_text())
public = Path('apps/web/public')
exceptions = []
for item in catalog:
    title = str(item.get('title', '')).strip()
    item_id = str(item.get('id', '')).strip()
    raw = str(item.get('image_url', '') or '').strip()
    override = ph.get(title)
    if isinstance(override, str) and override.strip():
        continue
    if raw.startswith('/item-database/wiki/') or raw.startswith('/game/items/'):
        continue
    existing = []
    if raw.startswith('/') and (public / raw.lstrip('/')).exists():
        existing.append('/' + raw.lstrip('/'))
    for match in public.rglob(item_id + '.*'):
        if match.is_file():
            existing.append('/' + match.relative_to(public).as_posix())
    exceptions.append((item_id, title, raw, str(item.get('wiki_url', '') or '').strip(), sorted(set(existing))))
print(f'catalog={len(catalog)} exceptions={len(exceptions)}')
for item_id, title, raw, wiki, existing in exceptions:
    print('EXCEPTION\t' + '\t'.join([item_id, title, raw, wiki, ','.join(existing) or 'NO_LOCAL_CANDIDATE']))
if exceptions:
    raise SystemExit(2)
