# Cursor → ChatGPT handoff

## Task

`P4.2-DISCORD-CENTRUM-CORE` — discord-gateway Centrum Aktywności core (same PR/branch as P4.1).

## Status

`READY_FOR_REVIEW_P4_2_DISCORD_GATEWAY_CORE`

## Branch

`cursor/p4-1-activity-domain`

## Scope delivered (gateway)

- Signed activity custom IDs + hub/event Components V2 renderers (teal accent, no legacy embeds)
- `ActivityHttpClient` + `ActivityProjectionController` (`POST /internal/activity/v1/projections/deliver`)
- Guild commands `centrum-*` + P1 LAB harness kept
- `ActivityInteractionHandler` (create/lfg modal-before-defer, RSVP opaque→statusDefId)
- Config: `DISCORD_ACTIVITY_ENABLED`, `ACTIVITY_SERVICE_BASE_URL`, `ACTIVITY_CLIENT_MODE`, `ACTIVITY_ORGANIZATION_ID`, projection secret, assertion keys

## Explicitly not done

- RabbitMQ / runtime outbox worker
- Full draft opaque round-trip persistence
- Issue #12 banner assets / prod visual sign-off
- Merge to `main`

## Verification

- typecheck + 84 discord-gateway unit tests green
