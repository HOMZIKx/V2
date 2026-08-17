# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_DISCORD_VISUAL_REVIEW`

## 2. HEAD

See git tip on `cursor/p4-1-activity-domain` after
`P4-DISCORD-FINAL-CLOSURE-AND-VISUAL-001`.
Baseline was `885ee5789dd1440d7b883657db46aa4fa9e920a0`.

## 3. Delta summary (this task)

### PHASE A

- Format: Prettier on this file
- Preview stacking: edit modal `deferUpdate` + `editReply` on the same
  ephemeral; create still one new preview via `deferReply`
- ACK before delayed activity HTTP (create and edit)
- Edit prefill: signed UI snapshot in the preview; `showModal` without GET
- Unchanged fields preserved (merge + prefill)
- WWW 401: UnauthorizedState on the four activity pages; tests added

### PHASE B

- OWNER VISUAL CORRECTION: previous accent-only pass rejected as insufficient
- Hub: one Container, groups **DZIAŁAJ** / **TWOJE**, Secondary buttons,
  accent `#D48632`
- Event renderer hierarchy pass (termin above secondary data)
- Preview visually aligned; one-message edit flow kept
- No V2 LAB coupling; Issue #20 not implemented

## 4. Validation

- Targeted Discord + WWW tests GREEN
- `pnpm validate` (local) after visual changes
- `pnpm audit --audit-level=high` → high = 0 unless deps changed

## 5. Owner actions

Review live Discord panel only:

1. overall look
2. hierarchy
3. whether it feels premium enough
4. copy
5. DZIAŁAJ / TWOJE grouping
6. public event post + preview consistency

Run `/centrum-reconcile` if the existing message was not updated in place.
Do not publish a second panel.

## 6. Explicit

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ · ISSUE #20 NOT IMPLEMENTED
ADMIN REDESIGN NOT STARTED · WWW REDESIGN NOT STARTED
