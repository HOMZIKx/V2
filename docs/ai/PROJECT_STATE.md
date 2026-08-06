# PROJECT_STATE

## Status

`READY_FOR_FINAL_REAUDIT_AND_PHASE_CLOSE_P3`

## Active phase

P3 Authorization foundation — final closure pass 2 after
`BLOCKING_FINAL_P3_CLOSURE_PASS_2` (4 blockers). Draft PR #16 only.

## Active task

- Task ID: `P3-FINAL-CLOSURE-PASS-2`
- Branch: `cursor/p3-authorization-foundation`
- Base tip before pass: `ef815dc91ddace863dbabaa8ec6b5239d7b1aa9f`
- Issue: #15 (APPROVED decisions P3-D1–P3-D20 — unchanged)
- Pull Request: https://github.com/HOMZIKx/V2/pull/16 (draft — no merge by Cursor)

## Current objective

Final re-audit of the 4 remaining closure blockers, then owner merge of PR #16.

## In scope now

- Durable lifecycle occurrence identity in Authorization DB
- Lease-guarded revoke delivered/failed updates
- No-escalation for allow **and** deny
- Unified WWW login decision including access_grant + membership

## Out of scope now

- P4 / PR #17 / Centrum Aktywności (**frozen** until P3 merge)
- Local branch `local/p4-centrum-aktywnosci-spec-prep` untouched
- UI, Zeabur, RabbitMQ Streams
- Merge by Cursor
- Empty CI retrigger commits

## Decisions in force

- P3-D1–P3-D20 (Issue #15)
- ADR-0013

## Last updated

2026-08-06 — Cursor (`P3-FINAL-CLOSURE-PASS-2`)
