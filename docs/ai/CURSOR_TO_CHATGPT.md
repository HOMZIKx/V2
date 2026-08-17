# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_ADMIN_VISUAL_REVIEW`

ROLLING AUDIT MODE: **ACTIVE**

## 2. Checkpoints

PREVIOUS_TASK_ID: `P4-DISCORD-FINAL-CLOSURE-AND-VISUAL-001`  
PREVIOUS_CHECKPOINT_SHA: `e53b1a49890702885ee494811f410aa499cf845b`  
PREVIOUS_CHECKPOINT_PUSHED: YES

CURRENT_TASK_ID: `P4-ADMIN-PRODUCTIZATION-001`  
CURRENT_BASELINE_SHA: `e53b1a49890702885ee494811f410aa499cf845b`  
CURRENT_CHECKPOINT_SHA: _(git tip after Admin push — do not amend)_

ChatGPT may audit `PREVIOUS_CHECKPOINT_SHA` even though this branch now has
newer Admin commits. Zero amend / rebase / force push / squash.

## 3. Delta summary (Admin)

- Workflow: ROLLING AUDIT MODE amendment in `docs/ai/WORKFLOW.md`
- Admin IA rebuilt: Pulpit / Centrum Aktywności / Zaawansowane (Polish)
- Dashboard answers: which guild, Discord connected?, Centrum ready?, panel status
- Channel and role pickers use Discord metadata names
- Notifications: DM toggle + reminder list (no JSON textarea)
- Types / statuses / fields / report reasons: list + Edytuj / Dodaj
- Hub publish / reconcile from Kanały i panel
- Technical IDs under Diagnostyka
- Owner-facing 409/403 mapping with Szczegóły
- Shared design-system tokens/primitives expanded; web not productized

## 4. New contracts

- `GET /activity/v1/admin/guilds`
- `GET .../discord/channels`, `GET .../discord/roles`
- `POST .../discord/members/resolve`
- `POST .../hub/publish`, `POST .../hub/reconcile`
- Internal discord-gateway `internal/activity/v1/guilds/*` (projection secret)

Browser does not call Discord API.

## 5. Validation

Targeted design-system + admin + Playwright + metadata controller, then
`pnpm validate`. See the Cursor report in chat for command results.

Screenshots (not committed): `tmp/ui-review/admin/`

## 6. Explicit

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ · ISSUE #20 NOT IMPLEMENTED  
WWW PRODUCTIZATION NOT STARTED  
GLOBAL DESIGN SYSTEM: OWNER_VISUAL_REVIEW_REQUIRED  
DISCORD RENDERER: not restyled in this task
