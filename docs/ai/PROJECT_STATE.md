# PROJECT_STATE

## Status

`READY_FOR_OWNER_AND_CHATGPT_RUNTIME_REVIEW` —
`P4-CONTINUOUS-RUNTIME-BRINGUP-AND-OPERABILITY-001`

Not APPROVED. Not merged. P4 not complete.

## Explicit gates

- **NO MERGE**
- **NO P4.5 / P4.6 / RabbitMQ**
- Issues #20 #21 #22 #23 **NOT IMPLEMENTED**

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- TASK_STARTING_SHA: `c635bb9b909b316ef4241071370fa3d7f98ce618`
- Operability + Admin login CTA: see latest commit on this branch after that SHA.

## Zeabur (verified 2026-08-18)

Apps previously RUNNING: authorization, identity, activity, api-gateway,
discord-gateway, admin, web. Infra: one Postgres addon + Redis. No RabbitMQ.

Public:

- API `https://v2-api.zeabur.app` `/health/live` 200 `{status:ok}` (revision
  fields appear after this SHA is deployed)
- Admin `https://v2-admin.zeabur.app` 200; calls `https://v2-api.zeabur.app`;
  unauthenticated guilds → 401 with Polish copy (login CTA ships in this SHA)
- WWW `https://v2-web.zeabur.app` 200 + `/health` 200; login page has
  `Zaloguj przez Discord`
- OAuth start `GET /identity/oauth/discord?callbackURL=https://v2-admin.zeabur.app/`
  → 302 to Discord authorize (`redirect_uri` already
  `https://v2-api.zeabur.app/api/auth/callback/discord`)

Production flags remain:

- `ACTIVITY_TRUST_ACTOR_HEADERS=false`
- `API_GATEWAY_FORWARD_ACTOR_HEADERS=false`

`ACTIVITY_ENABLED=false`: Authorization is not the live allow/deny hop.

## Operability (this SHA)

- Registry: `tools/runtime/service-registry.json`
- Drift: `pnpm architecture:check`
- Doctor: `pnpm runtime:doctor` (CI, no Zeabur)
- Smoke: `pnpm smoke:runtime` with `V2_SMOKE_*` (not in PR CI)
- Health live payloads include `gitCommitSha` / `appVersion` from env

## Discord

Prior Zeabur restart: Hub reconcile `updated` in place
(`messageId` `1539060848352436286`). Owner must still confirm amber Hub
(no purple) and walk create/preview/publish/RSVP in Discord.

Logged `GIT_COMMIT_SHA` on Zeabur may still be a stale variable until
owner/ops set it to the deployed image SHA.

## Owner next

1. Redeploy apps on this SHA (Admin login CTA + health revision fields).
2. Set `GIT_COMMIT_SHA` on each APP to that deploy SHA.
3. Confirm Hub look (amber `#D48632`, DZIAŁAJ/TWOJE, no purple).
4. Complete Discord OAuth in Developer Portal if authorize rejects the
   redirect; then walk Admin + WWW logged-in flows.

## Last updated

2026-08-18 — P4 continuous runtime bringup / operability foundation
