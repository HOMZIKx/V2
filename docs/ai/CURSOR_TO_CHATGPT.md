# Cursor → Owner

## 1. Status

`DESTILED_MANUAL_TEST_READY`

## 2. Task

Owner: make first-slice ready for real manual tests without friction;
keep prior logic/requests; verify only against truth (Project Hard).

- Branch: `cursor/destiled-cursor-handoff-dfe5`
- Draft PR: **#48**
- Base: `preview/destiled-web`
- SHA: `1af2082`

## 3. Delivered

- Friction fixes: merge demo seed, session reset, persistent invite links,
  accept/decline outcome, dashboard feedback, mobile EQ labels/breadcrumbs
- Checklist: `docs/ai/DESTILED_MANUAL_TEST_CHECKLIST.md`
- PH naming/logic unchanged (no alchemy/sashes; jazda 23h; biolog midnight)

## 4. Validation

- `pnpm typecheck`: PASS
- `pnpm test`: PASS (46)
- `pnpm e2e`: PASS (14)

## 5. How to test manually

1. `pnpm --filter @v2/web dev` → `http://127.0.0.1:3000`
2. Follow `docs/ai/DESTILED_MANUAL_TEST_CHECKLIST.md`
3. Dirty session → **Wyczyść sesję lokalną**

## 6. Marker

`READY_FOR_OWNER_REVIEW`
