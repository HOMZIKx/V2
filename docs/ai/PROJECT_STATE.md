# PROJECT_STATE

## Status

`READY_FOR_REAUDIT_P3_AUTHORIZATION_FOUNDATION`

## Active phase

P3 Authorization foundation — security/correctness remediation after ChatGPT audit
`CHANGES_REQUIRED_P3_AUTHORIZATION_SECURITY_AND_CORRECTNESS`.

## Active task

- Task ID: `P3-AUTHORIZATION-FOUNDATION-001`
- Branch: `cursor/p3-authorization-foundation`
- Base: `main` @ `f299775` (PR #14 Internal JWT merged)
- HEAD tip: `e84440281f1a1a552fe11ca7fcc56ff71e44b7e7` (GitHub PR #16 SoT)
- Issue: #15 (APPROVED decisions P3-D1–P3-D20 — unchanged)
- Pull Request: https://github.com/HOMZIKx/V2/pull/16 (draft — no merge by Cursor)
- CI tip: https://github.com/HOMZIKx/V2/actions/runs/31114236847 (success)

## Current objective

Re-audit of all 12 blocking audit points on PR #16.

## In scope now

- All 12 audit remediations (bootstrap seed, S2S allowlist, immutable links,
  per-guild login, unavailable vs detach, deterministic event keys, durable
  pending revokes, activate-requires-fresh, no-escalation actors, deleted-role
  filter, audit lifecycle, first OAuth login proof)
- Docs / contracts / report updates

## Out of scope now

- P4 / PR #17 / Centrum Aktywności
- UI, Zeabur, RabbitMQ Streams
- Merge by Cursor
- Changing P3-D1–P3-D20

## Decisions in force

- Issue #15 P3-D1–P3-D20
- D-034 / ADR-0013
- DEC-008 A, DEC-009 A, ADR-0011

## Last updated

2026-08-06 — Cursor (`READY_FOR_REAUDIT_P3_AUTHORIZATION_FOUNDATION`)
