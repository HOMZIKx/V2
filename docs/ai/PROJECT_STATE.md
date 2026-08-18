# PROJECT_STATE

## Status

`READY_FOR_CHATGPT_P4_0_DELTA_AUDIT` — task `P4-COMBINED-AUDIT-FIXUP-001`.

Not APPROVED. Not merged. Do not start P4.5.

## Explicit gates

- **NO MERGE**
- **NO P4.5 / P4.6 / RabbitMQ**
- Issues #20 #21 #22 #23 #24 **NOT IMPLEMENTED**

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- FIXUP_START_SHA: `1290df92681ee1e98fde3e0efaf231f7d110f6db`
- FIXUP_CHECKPOINT_SHA: `7f9e15e8020305db5e1b5bd3fb8f00532412a2c8`
- CI: PASS https://github.com/HOMZIKx/V2/actions/runs/32180546956

## Owner roadmap (#26)

Technical CI / security / Zeabur / runtime / ChatGPT audit are the current
gate. Full manual Owner UX of the transitional Centrum is deferred to
**Core Foundation Integrated Review**.

## Live Zeabur (checkpoint SHA)

Public health `gitCommitSha` MATCH on api / admin / web.
api-gateway ready: identity `ok`, activity `disabled` (reported, not
translated to fully operational), discord `ready`.
OAuth start: Discord authorize,
`redirect_uri=https://v2-api.zeabur.app/api/auth/callback/discord`.
No loopback in the OAuth Location. WWW JS bakes
`https://v2-api.zeabur.app` as the production origin.

## Last updated

2026-08-18 — P4-COMBINED-AUDIT-FIXUP-001 checkpoint deployed
