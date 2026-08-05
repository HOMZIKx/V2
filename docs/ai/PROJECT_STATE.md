# PROJECT_STATE

## Status

`READY_FOR_REVIEW`

Branch `cursor/p3-authorization-foundation` — P3 Authorization foundation + Identity-side integration (system revoke, login entitlement gate).

See `docs/ai/CURSOR_TO_CHATGPT.md` for the evidence report.

## Active phase

P3 Authorization — foundation + Identity integration (Issue #15).

## Active task

- Task ID: `P3-AUTHORIZATION-FOUNDATION-001`
- Branch: `cursor/p3-authorization-foundation`
- Base: `main` after PR #14 squash merge (`f299775`)
- Issue: #15 (PLAN_APPROVED)
- Pull Request: draft (no merge by Cursor)

## Current objective

Identity-side P3 integration: system revoke endpoint, generalized client-assertion audience, login entitlement gate (P3-D19), docs/env.

## In scope now

- `POST /identity/v1/system/revoke-sessions` (client assertion, no user session)
- `verifyClientAssertion(..., expectedAudience)`
- AuthorizationClient + session.create.before login gate
- Unit + RUN_INFRA_TESTS integration coverage
- `.env.example` + `docs/identity/INTERNAL_JWT.md`

## Out of scope now

- Merge PR / Admin UI
- Authz HTTP controllers (separate slice if not already on branch)
- RabbitMQ / effective-access cache

## Decisions in force

- P3-D1–D20 OWNER_ACCEPTED
- DEC-008 A, DEC-009 A, ADR-0011
- P3-D19 A (Identity checks Authz before WWW session)

## Last updated

2026-08-05 — Cursor (Identity-side P3 integration)
