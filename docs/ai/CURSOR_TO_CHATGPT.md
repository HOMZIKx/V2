# Cursor → ChatGPT handoff

## Task

`P4.4-ACTIVITY-WEB-001` on PR #19.

## Status

`READY_FOR_OWNER_P4_4_WEB_TEST`

## Branch

`cursor/p4-1-activity-domain` — do not merge; do not start P4.5.

## WWW URL

http://127.0.0.1:3000

## Views

`/logowanie`, `/aktywnosci`, `/aktywnosci/[id]`, `/moje`, `/powiadomienia`

## Cross-interface (agent)

Discord/backend Activity published → activity-service list → RSVP → mine list OK.
Same Activity backend as WWW (gateway BFF + session actor).
Browser OAuth not completed locally (`IDENTITY_AUTH_ENABLED=false`).

## CI note

Quality gates previously failed after green `pnpm validate` on
`pnpm audit --audit-level=high` (`@fastify/static` ≤10.1.0).
Patched via root pnpm override `@fastify/static@10.1.1`.

## Owner action

Enable Identity Discord OAuth (`IDENTITY_AUTH_ENABLED=true`, trusted origins
include `http://127.0.0.1:3000`) then sign in at `/logowanie`.

## Explicitly not done

P4.5, merge, Zeabur.
