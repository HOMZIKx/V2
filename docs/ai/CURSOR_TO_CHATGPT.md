# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_WWW_VISUAL_REVIEW`

ROLLING AUDIT MODE: **ACTIVE**

## 2. Checkpoints

PREVIOUS_TASK_ID: `P4-ADMIN-PRODUCTIZATION-001`  
ADMIN_CHECKPOINT_SHA: `2824489cf788622587800e401c709c1083ae627b`  
ADMIN_CHECKPOINT_PUSHED: YES

AUDITED_DISCORD_SHA: `ba082b3cfe39d5c3a58a0f6384425750368fe811`  
DISCORD_FIXUP_SHA: `efef493fbdc7060acf551bd14b6b07ccc1460d5f`

CURRENT_TASK_ID: `P4-WWW-PRODUCTIZATION-001`  
WWW_CHECKPOINT_SHA: _(git tip of this commit — do not amend)_

ChatGPT may audit Admin, Discord fixup, and WWW checkpoints independently.
Zero amend / rebase / force push / squash.

## 3. Delta summary (WWW productization)

- Member WWW rebuilt on shared `@v2/design-system` (Issue #12 foundation, not APPROVED)
- Purple / LAB cyan / ENV debug / raw Discord IDs removed from member UX
- List/detail/Moje use presentation extras: occupiedSlots, organizerDisplay, myParticipationStatus
- No N+1 participants fan-out on list or Moje
- RSVP labels come from backend status defs
- Inbox uses product titles (Awans z rezerwy, zmiana terminu, anulowanie)
- Guild/session races abort stale requests
- Screenshots: `tmp/ui-review/web/` (not committed)

## 4. Validation

Targeted design-system / web unit / activity presentation / Playwright, then
`pnpm validate`.

## 5. Explicit

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ · ISSUE #20 NOT IMPLEMENTED  
G8 / ISSUE #21 NOT IMPLEMENTED · MEMBER CREATOR NOT IMPLEMENTED  
GLOBAL DESIGN SYSTEM: OWNER_VISUAL_REVIEW_REQUIRED  
ADMIN: OWNER_VISUAL_REVIEW_REQUIRED  
DISCORD: OWNER_VISUAL_REVIEW_REQUIRED  
WWW: OWNER_VISUAL_REVIEW_REQUIRED  
ISSUE #12: OWNER_VISUAL_REVIEW_REQUIRED
