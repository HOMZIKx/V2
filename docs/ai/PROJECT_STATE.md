# PROJECT_STATE

## Status

Web / DESTILED track: `DESTILED_ASSETS_AND_CATALOG_TRUTH` (D-061).

Branch `cursor/destiled-cursor-handoff-dfe5` (PR **#48**).

## Active task

- Task ID: `DESTILED-WIKI-ICONS-AND-MAPS-003`
- Branch: `cursor/destiled-cursor-handoff-dfe5`
- Draft PR: **#48**
- Base: `preview/destiled-web`

## Verified online (no guessing)

- Shared swords: Gameforge wiki Sura/Ninja/Warrior weapons + pl-wiki item pages
  (e.g. Miecz Bojowy → Wojownik, Ninja, Sura). Code matches.

## Assets

| Asset | Status |
| --- | --- |
| Item icons EQ | **220/220** from official pl-wiki Gameforge |
| Ulepszacze icons | **157/157** from pl-wiki |
| Metin/boss timer data | **in** `dobry-temat-respawn-catalog.json` |
| Map PNGs | **missing** — DEC-063, copy from local dobry-temat |
| Class×gender renders | 3/8 — DEC-062 |

Script: `tools/scripts/sync-wiki-item-icons.py`

## Owner actions

1. Copy map PNGs → `apps/web/public/game/maps/` (DEC-063)
2. Copy remaining class renders (DEC-062)
3. Clear browser session / reload demo for new icons

## Open

- Owner asset drops + PR #48 review
- Real Discord OAuth / API (out of slice)
