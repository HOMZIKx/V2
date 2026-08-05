# PROJECT_STATE

## Status

`IN_PROGRESS`

Branch `cursor/p3-authorization-foundation` implements P3 Authorization foundation
(decision engine, persistence, HTTP `/authorization/v1/*`, Identity revoke client).

## Active phase

P3 Authorization — foundation (single organization, login entitlement, Discord sync snapshot).

## Active task

- Task ID: `P3-AUTHORIZATION-FOUNDATION-001`
- Branch: `cursor/p3-authorization-foundation`
- Base: `main` (includes P2 Identity squash merges)

## Current objective

Ship authorization-service application + infrastructure + Nest HTTP surface so Identity
and Discord gateway can call authorize / sync / policy endpoints.

## In scope now

- Ensure single organization on startup
- Bootstrap owner, identity links, authorize/explain
- Guild register / Discord events / reconcile / activate + login_entitling
- Grants / blocks
- Session revoke to Identity when last login entitlement is lost
- Inbound `Authorization-Client-Assertion` when `AUTHORIZATION_ENABLED=true`

## Out of scope now

- Full Discord gateway sync producer
- WWW/Admin UI for policy
- Multi-organization
- Merge without owner/ChatGPT review

## Last updated

2026-08-05 — Cursor (P3 authorization foundation implementation)
