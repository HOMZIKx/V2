# PROJECT_STATE

## Status

`READY_FOR_REVIEW`

Branch `cursor/p3-authorization-foundation` — P3 Authorization foundation + Identity integration + Discord Gateway → Authz membership sync.

See `docs/ai/CURSOR_TO_CHATGPT.md` for the evidence report.

## Active phase

P3 Authorization — foundation + Identity + Discord sync (Issue #15).

## Active task

- Task ID: `P3-AUTHORIZATION-FOUNDATION-001`
- Branch: `cursor/p3-authorization-foundation`
- Base: `main` after PR #14 squash merge (`f299775`)
- Issue: #15 (PLAN_APPROVED)
- Pull Request: draft (no merge by Cursor)

## Current objective

Discord Gateway → Authorization sync (P3-D1 / P3-D20): GuildMembers intent, register/events/reconcile with system client assertions.

## In scope now

- GuildMembers intent (owner-approved; guild isolation retained)
- Authz HTTP sync from discord-gateway (register, events, reconcile)
- Client assertions (`Authorization-Client-Assertion`, EdDSA, TTL≤60)
- Unit tests with mocked fetch; sync off by default

## Out of scope now

- Merge PR / Admin UI
- Periodic reconcile scheduler (beyond ready/join reconcile)
- RabbitMQ / effective-access cache

## Decisions in force

- P3-D1–D20 OWNER_ACCEPTED
- DEC-008 A, DEC-009 A, ADR-0011
- P3-D19 A (Identity checks Authz before WWW session)
- P3-D1 B + P3-D20 A (Gateway event sync + pending_sync on bot join)

## Last updated

2026-08-05 — Cursor (Discord Gateway → Authz sync)
