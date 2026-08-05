# PROJECT_STATE

## Status

`READY_FOR_REVIEW_P3_AUTHORIZATION_FOUNDATION`

## Active phase

P3 Authorization foundation (Issue #15, P3-D1–P3-D20).

## Active task

- Task ID: `P3-AUTHORIZATION-FOUNDATION-001`
- Branch: `cursor/p3-authorization-foundation`
- Base: `main` @ `f299775` (PR #14 Internal JWT merged)
- HEAD tip: see GitHub PR #16
- Issue: #15 (APPROVED decisions P3-D1–P3-D20)
- Pull Request: https://github.com/HOMZIKx/V2/pull/16 (draft — no merge by Cursor)

## Current objective

Owner review of minimal Authorization foundation before Centrum Aktywności.

## In scope now

- authorization-service domain + PG schema + `/authorization/v1/*`
- Identity system revoke + login entitlement gate
- Discord Gateway sync bridge (opt-in)
- ADR-0013 + contracts docs

## Out of scope now

- RabbitMQ/outbox/effective cache
- Admin/Discord/WWW UI, Centrum Aktywności
- Owner transfer, Zeabur, product permission names
- Merge by Cursor

## Decisions in force

- Issue #15 P3-D1–P3-D20
- D-034 / ADR-0013
- DEC-008 A, DEC-009 A, ADR-0011 (Internal JWT user-context)

## Last updated

2026-08-05 — Cursor (draft PR #16; local `pnpm validate` green)
