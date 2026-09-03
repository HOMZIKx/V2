#!/usr/bin/env python3
"""Sync item icons from official Gameforge pl-wiki into apps/web/public/game/items/wiki.

Source of truth for class rules remains Gameforge wiki pages (e.g. Sura/weapons).
This script only downloads icon bitmaps referenced by dobry-temat catalog wiki_url.
Map PNGs are NOT downloaded here — they must be copied from local dobry-temat.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / 'apps/web/src/data/dobry-temat-item-catalog.json'
MAP_PATH = ROOT / 'apps/web/src/data/wiki-item-image-map.json'
PH_PATH = ROOT / 'apps/web/src/data/ph-item-icon-map.json'
OUT_DIR = ROOT / 'apps/web/public/game/items/wiki'
UA = 'Mozilla/5.0 (compatible; DESTILED-asset-sync/1.1; +https://github.com/HOMZIKx/V2)'
IMG_RE = re.compile(
  r'/images/(?!thumb/)[0-9a-f]/[0-9a-f]{2}/[^"\'\s<>]+\.(?:png|jpg|jpeg|webp|gif)',
  re.I,
)


def fetch(url: str) -> bytes:
  parts = urllib.parse.urlsplit(url)
  path = urllib.parse.quote(urllib.parse.unquote(parts.path), safe='/:@')
  encoded = urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))
  req = urllib.request.Request(encoded, headers={'User-Agent': UA})
  with urllib.request.urlopen(req, timeout=40) as resp:
    return resp.read()


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument('--sleep', type=float, default=0.08)
  args = parser.parse_args()

  catalog = json.loads(CATALOG_PATH.read_text())
  wiki_map: dict[str, str] = json.loads(MAP_PATH.read_text()) if MAP_PATH.exists() else {}
  ph_map = json.loads(PH_PATH.read_text())
  OUT_DIR.mkdir(parents=True, exist_ok=True)

  ok = fail = 0
  for item in catalog['items']:
    cat = item['category']
    if not (
      cat.startswith('Ekwipunek') or cat == 'Ulepszacze' or cat.startswith('Kamienie duszy')
    ):
      continue
    if item['title'] in ph_map:
      continue
    existing = wiki_map.get(item['id'])
    if existing and (ROOT / 'apps/web/public' / existing.lstrip('/')).exists():
      continue
    if not item.get('wiki_url'):
      continue
    try:
      html = fetch(item['wiki_url']).decode('utf-8', errors='ignore')
      paths = [
        p
        for p in IMG_RE.findall(html)
        if 'Czarne' not in p and 'Home.png' not in p and 'Misja.png' not in p
      ]
      if not paths:
        fail += 1
        continue
      needle = item['title'].replace(' ', '_')
      chosen = paths[0]
      for path in paths:
        if needle[:6].lower() in urllib.parse.unquote(path).lower():
          chosen = path
          break
      data = fetch('https://pl-wiki.metin2.gameforge.com' + chosen)
      stem = (item.get('image_url') or '').rsplit('/', 1)[-1].rsplit('.', 1)[0]
      if not stem:
        stem = 'wiki_' + hashlib.sha1(chosen.encode()).hexdigest()[:16]
      ext = Path(urllib.parse.unquote(chosen)).suffix.lower() or '.png'
      out = OUT_DIR / f'{stem}{ext}'
      out.write_bytes(data)
      wiki_map[item['id']] = f'/game/items/wiki/{out.name}'
      ok += 1
      time.sleep(args.sleep)
    except Exception:  # noqa: BLE001
      fail += 1
      time.sleep(args.sleep)

  MAP_PATH.write_text(json.dumps(dict(sorted(wiki_map.items())), ensure_ascii=False, indent=2) + '\n')
  print(f'synced ok={ok} fail={fail} map={len(wiki_map)}')
  return 0 if fail == 0 else 1


if __name__ == '__main__':
  raise SystemExit(main())
