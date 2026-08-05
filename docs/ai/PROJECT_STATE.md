# PROJECT_STATE

## Status

`READY_FOR_RE-AUDIT`

Draft PR #11 (`cursor/p2-identity-proof-slice`) — owner amendment: **P2 active
OAuth = Discord only**. Google removed from required config, proof UI, live
checklist, and CI env. Architecture (V2 User UUID, ports, linking policy,
sessions, Discord `email=null`) retained. Awaiting re-audit. Still no live
OAuth and no merge.

See `docs/ai/CURSOR_TO_CHATGPT.md` for the evidence report.

## Active phase

P2 Identity — Better Auth proof/integration slice.

## Active task

- Task ID: `P2-IDENTITY-PROOF-001`
- Branch: `cursor/p2-identity-proof-slice`
- Base: `main` po scaleniu planu P2, commit `4230fb185044faef15d4dd59a9c3c99f6c2b5956`
- Pull Request: draft PR #11
- Instrukcja: `docs/ai/CHATGPT_TO_CURSOR.md`

## Current objective

Udowodnić na rzeczywistym kodzie, że Better Auth 1.6.25 może działać jako silnik
Identity Service na Node 24, NestJS 11 i Fastify 5 (PG + Redis SoT, Discord
OAuth, explicit linking policy, immediate revoke, Discord `email=null`, no raw
provider tokens). Active social provider in P2 is Discord only; multi-provider
ports remain ready for a later second provider.

## In scope now

- proof slice only; re-audit of PR #11
- Discord-only active OAuth (owner amendment to DEC-003)
- no live OAuth in this Cursor pass
- no merge

## Out of scope now

- Google / second OAuth provider activation
- P3 Authorization / guild membership policy
- produkcyjny Web/Admin login UI
- MFA / passkey / TOTP
- internal JWT między usługami
- API Gateway auth middleware
- integracja V2 User z Discord botem
- RabbitMQ / Outbox / events
- produkcyjny deploy i Zeabur
- funkcje biznesowe bota

## Decisions in force

- DEC-003 B (architecture) + P2 Discord-only OAuth amendment; DEC-004 A,
  DEC-005 A, DEC-006 C, DEC-008 A, DEC-009 A
- ADR-0009–0012: Accepted

## Next gate

Owner re-audit → then (if approved) live Discord OAuth checklist → only then
`READY_FOR_REVIEW` / merge consideration.

## Last updated

2026-08-05 — Cursor (Discord-only P2 amendment)
