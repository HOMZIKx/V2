# PROJECT_STATE

## Status

`READY_FOR_OWNER_LIVE_VISUAL_REVIEW` —
`P4-RUNTIME-CLOSURE-ZEABUR-AND-STRATEGIC-ALIGNMENT-001`

Not APPROVED. Not merged. P4 not complete.

## Explicit gates

- **NO MERGE**
- **NO P4.5 / P4.6 / RabbitMQ**
- Issues #20 #21 #22 #23 **NOT IMPLEMENTED**

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- STARTING_SHA: `9a3e9226bc8f9050ae5c99aa9c9e41f471c08dbf`
- SOURCE_GREEN_SHA: `1d6f79fa112bb1b5965b4cc3f1b2e2798090ad43`
- Runtime-intended SHA: `bc7c1ca45307bf77a29da4e9808cab4433b0f21a`
  (Dockerfile bake + Zeabur runtime-complete docs). Handoff markdown after
  that SHA is docs-only and compatible with the running images.

## Zeabur (test project)

Apps RUNNING after sequential redeploy: authorization, identity, activity,
api-gateway, discord-gateway, admin, web. Infra: one Postgres addon + Redis
(not three named postgres-* addons). No RabbitMQ.

Public:

- API `https://v2-api.zeabur.app` health live/ready 200
- Admin `https://v2-admin.zeabur.app` 200; bundle contains
  `https://v2-api.zeabur.app`; no DEV actor id; no `127.0.0.1:4400`
- WWW `https://v2-web.zeabur.app` 200; client uses
  `https://v2-api.zeabur.app` (localhost strings remain only as dead
  `||` fallbacks after a non-empty origin)

Production flags:

- `ACTIVITY_TRUST_ACTOR_HEADERS` must stay false
- `API_GATEWAY_FORWARD_ACTOR_HEADERS=false` (verified)

`ACTIVITY_ENABLED=false` on activity-service: inbound assertions still
required; Authorization is not the live allow/deny hop.

## Discord

Bot ready after restart. Hub reconcile `updated` in place
(`messageId` `1539060848352436286`). Logged `gitCommitSha` comes from the
stale `GIT_COMMIT_SHA` **variable** (`f33cdf9`), not the image revision —
do not treat that log field as deploy proof.

## Owner next

1. Confirm Hub look (amber `#D48632`, DZIAŁAJ/TWOJE, no purple).
2. Add OAuth redirect `https://v2-api.zeabur.app/api/auth/callback/discord`.
3. Walk Admin + WWW logged-in flows.

## Last updated

2026-08-18 — P4 runtime closure / Zeabur bake + actor-header production
