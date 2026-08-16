# Cursor → ChatGPT handoff

## Task

`P4-DISCORD-PRODUCT-PASS-001` on PR #19 (P4.1–P4.3 train).

## Status

`READY_FOR_OWNER_P4_DISCORD_RETEST`

## Branch

`cursor/p4-1-activity-domain` — **do not merge**; do not start P4.4.

## Highlights

- Hub duplicate: publish/reconcile edit-first
- 404 root cause: Discord client path mismatch vs OpenAPI (`opaque/*`, `me/inbox`)
- UX: Polish datetime, draft summary session, Polish copy, V2 accent from `panel-theme`
- Draft startAt validation rejects non-ISO (e.g. DAS12)

## Explicitly not done

P4.4 WWW, RabbitMQ, Zeabur prod, merge, final owner visual sign-off beyond retest.
