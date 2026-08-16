# PROJECT_STATE

## Status

`READY_FOR_REVIEW_P4_2_DISCORD_GATEWAY_CORE`

## Active phase

P4.2 — Discord Centrum Aktywności gateway core (same branch as P4.1).

## Active task

- Task ID: `P4.2-DISCORD-CENTRUM-CORE`
- Branch: `cursor/p4-1-activity-domain`
- Service: `@v2/discord-gateway` (+ activity-service opaque/projection support in flight)
- Out of scope (deferred): full RSVP waitlist UX polish, RabbitMQ, Admin/WWW UI, Issue #12 banner assets

## Delivered in P4.2 gateway core

- Signed activity custom IDs (`activity:v1:panel|event|draft:…`) + hub/event Components V2 renderers
- `ActivityHttpClient` (headers/assertion) + internal projection deliver endpoint
- Operator guild commands: `centrum-panel|status|reconcile|seed` alongside P1 `/status` `/panel-test`
- `ActivityInteractionHandler` wired through `InteractionRouter` / `createDiscordGatewayOrNull`
- Hub create/lfg: `showModal` before defer; RSVP resolves `statusDefId` via guild config opaque match

## Verification

- `npx tsc -p apps/discord-gateway/tsconfig.json --noEmit` — green
- `vitest run` (discord-gateway) — 84 tests green

## Last updated

2026-08-16 — Cursor (`P4.2-DISCORD-CENTRUM-CORE`)
