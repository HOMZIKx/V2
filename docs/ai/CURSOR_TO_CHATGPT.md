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

Discord/backend Activity published → gateway list → RSVP → mine list OK.
Browser OAuth not completed locally (`IDENTITY_AUTH_ENABLED=false`).

## Owner action

Enable Identity Discord OAuth (`IDENTITY_AUTH_ENABLED=true`, trusted origins
include `http://127.0.0.1:3000`) then sign in at `/logowanie`.

## Explicitly not done

P4.5, merge, Zeabur.
