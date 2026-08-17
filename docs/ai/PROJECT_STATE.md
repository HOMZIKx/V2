# PROJECT_STATE

## Status

`READY_FOR_OWNER_WWW_VISUAL_REVIEW`

Rolling audit: Admin, Discord fixup, and WWW productization are separate immutable checkpoints on the same branch.

## Explicit gates

- **NO MERGE**
- **NO P4.5**
- **NO P4.6**
- **NO RABBITMQ**
- Issue #20 **NOT IMPLEMENTED**
- G8 / Issue #21 **NOT IMPLEMENTED**
- Member activity creator **NOT IMPLEMENTED**
- Global design system: **OWNER_VISUAL_REVIEW_REQUIRED** (not APPROVED)
- Admin visual: **OWNER_VISUAL_REVIEW_REQUIRED**
- Discord visual: **OWNER_VISUAL_REVIEW_REQUIRED**
- WWW visual: **OWNER_VISUAL_REVIEW_REQUIRED**
- Issue #12 status: **OWNER_VISUAL_REVIEW_REQUIRED**

## Active phase

WWW productization after Discord audit fixup.

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- Discord visual audited SHA: `ba082b3cfe39d5c3a58a0f6384425750368fe811`
- Admin checkpoint: `2824489cf788622587800e401c709c1083ae627b`
- Discord fixup checkpoint: `efef493fbdc7060acf551bd14b6b07ccc1460d5f`
- WWW checkpoint: git tip of this commit

## Delivered in this delta

- Member WWW P4.4 product shell (login, list, detail, RSVP, Moje, inbox)
- Shared Issue #12 tokens via `@v2/design-system` (not APPROVED)
- Member list read model: occupiedSlots, typeLabel, organizerDisplay, myParticipationStatus
- No N+1 `listParticipants` on list / Moje
- Guild/session request identity + abort so stale responses cannot win
- Screenshots (not in git): `tmp/ui-review/web/`

## Owner next

1. Visual review of WWW (`tmp/ui-review/web/`)
2. ChatGPT may audit Admin, Discord fixup, and WWW checkpoints independently
3. Do **not** merge; do **not** start P4.5 / P4.6 until the next rolling prompt

## Explicitly not done

- Merge to `main`
- P4.5 / P4.6 / RabbitMQ / Issue #20 / G8
- Owner approval of Admin, Discord, or WWW visuals
- Global design-system APPROVED
- Resolving GitHub Bugbot thread (no GitHub CLI auth)

## Last updated

2026-08-17 — P4-WWW-PRODUCTIZATION-001 after Discord audit fixup
