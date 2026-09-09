from pathlib import Path
import json

path = Path('apps/web/src/data/dobry-temat-item-catalog.json')
text = path.read_text()
doc = json.loads(text)
items = doc['items']
ph = json.loads(Path('apps/web/src/data/ph-item-icon-map.json').read_text())

expected = {
    'wiki_6311031b49f98e4a',
    'wiki_42b90e87661dc05f',
    'wiki_cd6e7c8dc615dca9',
    'wiki_27a6109ee6950f3a',
    'wiki_3fb39d4ccefdc943',
    'wiki_3c66239b55598975',
    'wiki_210a58d80e989cbe',
    'wiki_690afd20c807ea00',
    'wiki_4268607fe03cc4b0',
    'wiki_ce6f82f569cdb389',
    'wiki_5a5e6d88b1032b41',
    'wiki_d70b60261d0f1f54',
}

found = set()
for item in items:
    item_id = str(item.get('id', '')).strip()
    title = str(item.get('title', '')).strip()
    raw = str(item.get('image_url', '') or '').strip()
    override = ph.get(title)
    if isinstance(override, str) and override.strip():
        continue
    if raw.startswith('/item-database/wiki/') or raw.startswith('/game/items/'):
        continue
    found.add(item_id)

if found != expected:
    raise SystemExit(f'canonical image exception set changed: found={sorted(found)!r}')

for item_id in sorted(expected):
    marker = f'"id": "{item_id}"'
    start = text.index(marker)
    object_end = text.index('\n    }', start)
    key = '"image_url": "'
    image_start = text.index(key, start)
    if image_start >= object_end:
        raise SystemExit(f'image_url not found inside catalog object {item_id}')
    value_start = image_start + len(key)
    value_end = text.index('"', value_start)
    replacement = f'/item-database/wiki/{item_id}.png'
    text = text[:value_start] + replacement + text[value_end:]

path.write_text(text)
print(f'repaired {len(expected)} canonical catalog image paths')
