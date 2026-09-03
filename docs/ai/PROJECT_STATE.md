# PROJECT_STATE

## Status

Web / DESTILED track: `DESTILED_EQ_CATALOG_AND_RENDERS` (D-061).

Branch `cursor/destiled-cursor-handoff-dfe5` (PR **#48**). Awaiting owner review / assets.

## Active task

- Task ID: `DESTILED-EQ-CATALOG-TRUTH-002`
- Branch: `cursor/destiled-cursor-handoff-dfe5`
- Draft PR: **#48**
- Base: `preview/destiled-web`
- Focus: dobry-temat catalog truth (shared swords, wiki_upgrade bonuses, icons),
  class×gender renders without inventing assets
- Checklist: `docs/ai/DESTILED_MANUAL_TEST_CHECKLIST.md`

## EQ truth (this pass)

- Shared one-handed swords (`Wojownik — Bronie jednoręczne`) → Warrior + Ninja +
  Sura (Gameforge wiki); two-handed Warrior-only; Sura blades exclusive
- Demo includes `Zatruty Miecz` on Sura as shared-sword proof
- `wiki_upgrade` → `bonusesAtEnhancement` / `resolveItemBonuses` (no invented
  truncated ladders); create/seed prefer catalog bonuses
- Wiki icon map expanded from local `/game/items/wiki` + catalog `image_url`
- Ulepszacze remain catalog-only (not EQ slots); `enhancerCatalogItems()` exposed

## Still blocked on owner assets (DEC-062)

- Remaining class×gender PNGs from local `dobry-temat/frontend/public`:
  warrior×♂♀, sura-female, ninja-male, shaman-female
- Map PNGs / fuller item sprite pack
- Ninja armor entries if PH wiki has them beyond current dump

## Open

- Owner drops missing class renders → register in `character-profile.ts`
- Owner review of PR #48
- Real Discord OAuth / API / bot (out of slice)
