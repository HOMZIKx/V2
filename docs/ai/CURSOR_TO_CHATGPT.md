# Cursor → Owner

## 1. Status

`DESTILED_GRAPHICS_LOGIC_POLISH`

## 2. Task

Owner: missing graphics/logic from dobry-temat + polish existing pages with
real Project Hard / Metin2 naming (no guessing).

- Branch: `cursor/destiled-cursor-handoff-dfe5`
- Draft PR: **#48**
- Base: `preview/destiled-web`
- Commit: (latest on branch)

## 3. Delivered

- Local wiki sprites (filtered) + PH presentation icons for verified jewelry/boots
- `project-hard-progression.ts` from official PH presentation
- Demo EQ/timers/notes: Bojowa Tarcza, Pamiątka Po Demonie 6/15, Jazda konna 23h
- Removed invented alchemy note (PH has no alchemy)
- EQ create matches catalog title → slot + icon
- Analysis: `docs/ai/DESTILED_HUMAN_UX_AND_GAME_LOGIC_2026-09-03.md`

## 4. Validation

- `pnpm typecheck`: PASS
- `pnpm test`: PASS (44)
- `pnpm e2e`: PASS (12)

## 5. Screenshots

- `/opt/cursor/artifacts/screenshots/destiled-polish-01-home.png`
- `/opt/cursor/artifacts/screenshots/destiled-polish-03-equipment.png`
- `/opt/cursor/artifacts/screenshots/destiled-polish-05-jazda-aalpsik.png`
- `/opt/cursor/artifacts/screenshots/destiled-polish-06-biolog-kimmizic.png`

## 6. Remaining

- Map PNGs + missing class art from local dobry-temat
- Verified weapon/armor sprites (no guessed vnums)
- Real Discord/API still mock/localStorage

## 7. Marker

`READY_FOR_OWNER_REVIEW`
