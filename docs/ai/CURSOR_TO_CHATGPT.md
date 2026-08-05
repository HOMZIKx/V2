# Cursor → ChatGPT

## 1. Status

`READY_FOR_REVIEW_P3_AUTHORIZATION_FOUNDATION`

P3 Authorization foundation on `cursor/p3-authorization-foundation`.
Base `main` @ `f299775` (PR #14 merged). Issue #15 P3-D1–P3-D20 respected.
**No merge by Cursor. No UI.**

## 2. Task ID

`P3-AUTHORIZATION-FOUNDATION-001`

## 3. Branch / PR

- Branch: `cursor/p3-authorization-foundation`
- Issue: #15
- PR: draft (GitHub SoT for URL/CI)

## 4. What shipped

| Area            | Deliverable                                                                       |
| --------------- | --------------------------------------------------------------------------------- |
| Authz DB        | `001_authorization_foundation.sql` + migrate runner                               |
| Authz domain    | Decision engine + explain (no Nest/pg)                                            |
| Authz HTTP      | `/authorization/v1/*` (bootstrap, links, authorize, discord sync, grants, blocks) |
| Identity        | System revoke assertion-only; login gate before session                           |
| Discord Gateway | Opt-in sync bridge (GuildMembers + events → Authz)                                |
| Docs            | ADR-0013, AUTHORIZATION_CONTRACTS, catalogs, D-034                                |

## 5. Explicitly not shipped

RabbitMQ/outbox/cache, Admin/Discord/WWW UI, Centrum Aktywności, owner transfer, Zeabur.

## Last updated

2026-08-05 — Cursor
