# Cursor → ChatGPT handoff

## 1. Status

`CHANGES_REQUIRED` — owner gate P4-LOCAL-ADMIN-AND-LIVE-DISCORD-ALIGNMENT-OWNER-GATE-001

ROLLING AUDIT MODE: **ACTIVE**

CURRENT_TASK_ID: `P4-LOCAL-ADMIN-AND-LIVE-DISCORD-ALIGNMENT-OWNER-GATE-001`  
BASELINE_SHA: `f85b2468d834549c73d2ad203e36aa84991e6327`  
FIXUP_CHECKPOINT_SHA: `fe31e29cb4c3b410794111c713561f767a969aed`

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 NOT IMPLEMENTED · G8 / ISSUE #21 NOT IMPLEMENTED

## 2. Delta (owner gate)

**Local Admin root causes diagnosed:**

1. Vite Admin did not load root `.env` → `VITE_ADMIN_*` unset → identity-cookie
   mode with empty guilds. Fixed: `apps/admin/vite.config.ts` `envDir: '../..'`.
2. Stale local `activity-service` on `:4400` returned 404 for
   `GET /activity/v1/admin/guilds` (route missing in running process). Owner must
   restart stack after pull.
3. Missing Discord metadata port returned `[]` instead of dependency error.
   Fixed: `listAdminGuilds()` → `CONFIG_INVALID` when port absent; Admin maps to
   „Nie udało się pobrać serwerów z Discorda.”

**Live Discord:** current repo renderer is correct (#D48632, DZIAŁAJ/TWOJE,
Secondary buttons). Old purple hub is not in HEAD — **LIVE_VERSION_MISMATCH** /
**OWNER_DEPLOY_ACTION_REQUIRED** for Zeabur `discord-gateway` on branch
`cursor/p4-1-activity-domain` + hub reconcile.

## 3. Explicit

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 NOT IMPLEMENTED · G8 / ISSUE #21 NOT IMPLEMENTED

OWNER GATES STILL REQUIRED: Discord / Admin / WWW visual+live.
GLOBAL DESIGN SYSTEM: OWNER_VISUAL_REVIEW_REQUIRED

STOP.
