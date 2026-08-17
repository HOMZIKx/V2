# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_PRODUCTIZATION_VISUAL_AND_LIVE_REVIEW`

ROLLING AUDIT MODE: **ACTIVE**

CURRENT_TASK_ID: `P4-PRODUCTIZATION-AUDIT-CLOSURE-FIXUP-002`  
BASELINE_SHA: `f85b2468d834549c73d2ad203e36aa84991e6327`  
FIXUP_CHECKPOINT_SHA: _(git tip of this commit — do not amend)_

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 NOT IMPLEMENTED · G8 / ISSUE #21 NOT IMPLEMENTED

## 2. Delta

MEDIUM regression: GuildProvider treated remote failure as zero guilds and
dropped documented DEV fallback.

- DEV actor (`session.mode === 'dev-actor'`): `VITE_ADMIN_DEV_GUILDS` is a local
  fallback **only when** `GET /activity/v1/admin/guilds` fails. Selector stays
  usable; explicit warning + retry. Remote success remains authoritative.
- Identity cookie: never reads `VITE_ADMIN_DEV_GUILDS`. Empty remote →
  „Brak serwerów, którymi możesz zarządzać.” Failed request → error + retry,
  no guilds, no DEV substitute.
- CONFIG_MANAGE filtering unchanged in activity-service.

## 3. Explicit

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 NOT IMPLEMENTED · G8 / ISSUE #21 NOT IMPLEMENTED

OWNER GATES STILL REQUIRED: Discord / Admin / WWW visual+live.
GLOBAL DESIGN SYSTEM: OWNER_VISUAL_REVIEW_REQUIRED

STOP.
