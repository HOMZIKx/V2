# Cursor → Owner

## 1. Status

`DESTILED_EQ_CLASS_AND_ENHANCEMENT`

## 2. Task

Owner: fix wrong item assignments (amulet/armor, daggers on Sura); Targ is not
an item DB; characters need items with enhancement **0–9**.

- Branch: `cursor/destiled-cursor-handoff-dfe5`
- Draft PR: **#48**
- Base: `preview/destiled-web`

## 3. Delivered

- Class/slot rules from wiki/PH category labels on assign + create
- `enhancement` 0–9 on team EQ cards + picker in UI
- Demo loadouts corrected (Sura / Ninja / Shaman); no shared wrong-class pieces
- Targ later text: listings/prices only; EQ cards live under character **Baza EQ zespołu**
- Honest gap: Ninja armor absent from current catalog dump → empty slot

## 4. Validation

- `pnpm typecheck`: PASS
- `pnpm test`: PASS (50)
- `pnpm e2e`: PASS (14)

## 5. Manual note

Wyczyść sesję lokalną / wczytaj demo ponownie — stare localStorage ma złe karty.

## 6. Marker

`READY_FOR_OWNER_REVIEW`
