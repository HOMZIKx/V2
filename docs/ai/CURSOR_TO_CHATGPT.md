# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_LIVE_VISUAL_REVIEW` — task
`P4-RUNTIME-CLOSURE-ZEABUR-AND-STRATEGIC-ALIGNMENT-001`

ROLLING AUDIT MODE: **ACTIVE**

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 / #21 / #22 / #23 **NOT IMPLEMENTED** (planning context only)

STARTING_SHA: `9a3e9226bc8f9050ae5c99aa9c9e41f471c08dbf`  
SOURCE_GREEN_SHA: `1d6f79fa112bb1b5965b4cc3f1b2e2798090ad43`  
FINAL_SHA: see `PROJECT_STATE.md` (docs checkpoint after `bc7c1ca`)

## 2. Delta

- GitHub `pnpm validate` unblocked: Prettier on deploy docs, web spec tsconfig,
  hub reconcile types, Activity inbound-clients fixture.
- Live Admin was shipping `function getApiBaseUrl(){return ""}` because
  Dockerfile `ARG VAR=` defaults overwrote Zeabur build env. Fixed: no empty
  ARG defaults; fail the image build if public API origin is missing.
- Production `API_GATEWAY_FORWARD_ACTOR_HEADERS=false`. Admin DEV actor Zeabur
  vars removed. Unauthenticated `GET /activity/v1/admin/guilds` → 401.
- Discord startup reconcile after redeploy: `mode=updated`, same
  `messageId=1539060848352436286` (no duplicate from this restart).
- Zeabur docs: service matrix + Definition of Runtime Complete. Future
  deployable services created in an approved stage must be added immediately.

## 3. Strategic guardrails (PLANNING ONLY / NOT ACCEPTED IMPLEMENTATION SPEC)

Do not implement #20–#23, Intent/Watch, Discord Activity, V2 Room, overlay,
Music, or extra microservices in this closure. Logical module ≠ deployable
service. Current Components V2 Hub remains valid.

## 4. Owner gates still required

- Discord visual: accent `#D48632`, DZIAŁAJ/TWOJE, no purple (owner eyes).
- Discord Developer Portal redirect:
  `https://v2-api.zeabur.app/api/auth/callback/discord`
- Admin/WWW logged-in functional flows (CONFIG_MANAGE, save/reload, RSVP).
- Optional: three named Postgres addons vs current single Postgres addon.

STOP.
