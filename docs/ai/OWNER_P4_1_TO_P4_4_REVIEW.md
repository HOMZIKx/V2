# Owner review — P4.1 → P4.4 (local + live gate)

Branch: `cursor/p4-1-activity-domain` · PR #19

## LOCAL ADMIN

- [ ] local guild visible
- [ ] human-readable guild
- [ ] real backend connected
- [ ] channels/roles metadata works

## DISCORD

- [ ] deployed SHA == branch HEAD
- [ ] current Activity Hub live
- [ ] no purple old renderer
- [ ] DZIAŁAJ/TWOJE
- [ ] create/edit/publish
- [ ] RSVP
- [ ] reconcile

## ADMIN

- [ ] dashboard
- [ ] channels
- [ ] roles
- [ ] config screens
- [ ] Admin → Discord
- [ ] mobile

## WWW

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

## Live Discord redeploy (if hub still purple)

**Root cause seen on Zeabur:** service stuck on deploy **before** `e53b1a4` (wrong
`dist/main.js` CMD) → crash loop → old hub message stays in Discord channel.

1. Zeabur → `discord-gateway` → **Redeploy** branch `cursor/p4-1-activity-domain` @ HEAD.
2. Confirm Variables: `ACTIVITY_ORGANIZATION_ID`, projection secret, Discord token.
3. `GET /health/discord` → `state: ready`.
4. Admin → hub channel → **Reconcile** (in-place update, no duplicate panel).

Zeabur service `discord-gateway` → branch `cursor/p4-1-activity-domain` → redeploy → reconcile hub from Admin.

## Live Zeabur checkpoint (2026-08-18, Cursor)

Intended revision: `bc7c1ca`. Admin bundle contains `https://v2-api.zeabur.app`.
Production does not forward browser `X-Actor-*`. Unauthenticated guilds API → 401.

Still **owner**: Hub visual (amber / DZIAŁAJ / no purple), Discord OAuth redirect
`https://v2-api.zeabur.app/api/auth/callback/discord`, logged-in Admin/WWW
checklists above. Local DEV actor remains local-only.
