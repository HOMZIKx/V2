# Owner review — P4.1 → P4.4

Branch: `cursor/p4-1-activity-domain` · PR #19

## Technical gate (Issue #26)

Owner roadmap **#26 Core Foundation** is authoritative:

Before **Core Foundation Integrated Review**, P4.1–P4.4 technical closure
requires CI, security, ChatGPT audit, Zeabur verification, runtime smoke,
health, revision proof, and recovery tests.

It does **not** require a full manual Owner UX/product walkthrough of the
current transitional Discord / Admin / WWW surfaces.

Full manual product/UX acceptance is deferred to:

**DEFERRED OWNER UX REVIEW / CORE FOUNDATION INTEGRATED REVIEW**

Do not merge. Do not start P4.5 / P4.6 / #20–#24.

## Combined audit fixup

Task: `P4-COMBINED-AUDIT-FIXUP-001`

FIXUP_START_SHA: `1290df92681ee1e98fde3e0efaf231f7d110f6db`

FIXUP_CHECKPOINT_SHA: `7f9e15e8020305db5e1b5bd3fb8f00532412a2c8`

CI: PASS (Quality gates, Secret scan, Infrastructure integration)

## Deferred Owner UX checklist

Keep these for Core Foundation Integrated Review. They are **not** a current
merge/P4.5 gate.

### LOCAL ADMIN

- [ ] local guild visible
- [ ] human-readable guild
- [ ] real backend connected
- [ ] channels/roles metadata works

### DISCORD

- [ ] current Activity Hub live
- [ ] no purple old renderer
- [ ] DZIAŁAJ/TWOJE
- [ ] create/edit/publish
- [ ] RSVP
- [ ] reconcile

### ADMIN

- [ ] dashboard
- [ ] channels
- [ ] roles
- [ ] config screens
- [ ] Admin → Discord
- [ ] mobile

### WWW

- [ ] login
- [ ] activities
- [ ] detail
- [ ] RSVP
- [ ] My
- [ ] Inbox
- [ ] mobile

## Local owner prerequisites (DEV ACTOR)

1. Root `.env` from `.env.example` with `VITE_ADMIN_DEV_ACTOR_DISCORD_ID` + `VITE_ADMIN_DEV_GUILDS`.
2. `pnpm infra:up` then `pnpm dev` (or activity + discord-gateway + admin).
3. Activity: `ACTIVITY_DISCORD_PROJECTION_BASE_URL`, projection secret, `ACTIVITY_TRUST_ACTOR_HEADERS=true` (local only).
4. Discord Gateway: `DISCORD_ENABLED=true`, bot in target guild.
