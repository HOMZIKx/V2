# PROJECT_STATE

## Status

`CHANGES_REQUIRED` — local admin config fixes landed; live Discord redeploy pending

Rolling audit: owner gate diagnosis on `cursor/p4-1-activity-domain` (PR #19).

## Explicit gates

- **NO MERGE**
- **NO P4.5**
- **NO P4.6**
- **NO RABBITMQ**
- Issue #20 **NOT IMPLEMENTED**
- G8 / Issue #21 **NOT IMPLEMENTED**

## Active phase

P4-LOCAL-ADMIN-AND-LIVE-DISCORD-ALIGNMENT-OWNER-GATE-001 — diagnose local Admin
guild inventory + live Discord hub version mismatch. No new features.

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- Guild-fallback fixup: `fe31e29cb4c3b410794111c713561f767a969aed`

## Delivered in this delta

- Admin Vite loads monorepo root `.env` (`envDir`)
- `listAdminGuilds()` fails closed when Discord metadata port missing
- Guild list UI maps `CONFIG_INVALID` → Discord metadata unavailable copy
- `docs/ai/OWNER_P4_1_TO_P4_4_REVIEW.md` checklist

## Owner next

1. Restart local stack (`pnpm dev` / activity-service) so admin routes exist
2. Set root `.env`: `VITE_ADMIN_DEV_ACTOR_DISCORD_ID`, `VITE_ADMIN_DEV_GUILDS`
3. Redeploy Zeabur `discord-gateway` from branch HEAD + reconcile hub
4. Complete visual/live checklist in `OWNER_P4_1_TO_P4_4_REVIEW.md`

## Last updated

2026-08-18 — P4-LOCAL-ADMIN-AND-LIVE-DISCORD-ALIGNMENT-OWNER-GATE-001
