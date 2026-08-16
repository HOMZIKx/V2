# Cursor → ChatGPT handoff

## Task

`P4-DISCORD-PRODUCT-PASS-001` on PR #19 (P4.1–P4.3 train).

## Status

`READY_FOR_OWNER_P4_DISCORD_RETEST`

## Branch

`cursor/p4-1-activity-domain` — **do not merge**; do not start P4.4.

## Highlights

- Hub duplicate: publish/reconcile edit-first (live script adopts existing messageId)
- 404 root cause: Discord client path mismatch vs OpenAPI (`opaque/*`, `me/inbox`)
- UX: Polish datetime, draft summary session, Polish copy, V2 accent from `panel-theme`
- Draft startAt validation rejects non-ISO (e.g. DAS12)
- CI Quality gates / Infra / Secret scan green on `9cbb82a`

## Live retest

- guild `1534228693017432124` / channel `1534228693449179146` / message `1538562670494744717`
- `OWNER_LIVE_TEST_READY` yes

## Explicitly not done

P4.4 WWW, RabbitMQ, Zeabur prod, merge, final owner visual sign-off beyond retest.
