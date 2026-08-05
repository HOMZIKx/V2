# PROJECT_STATE

## Status

`READY_FOR_OWNER_MERGE`

Draft PR #11 (`cursor/p2-identity-proof-slice`) — P2 Identity proof slice with
**Discord-only** active OAuth. Owner live Discord OAuth gate **PASSED** (manual
subset). Still **no merge** by Cursor. Tip HEAD and Checks: GitHub SoT (not
versioned in the report). Next JWT plan: Issue #13 (`READY_FOR_OWNER_DECISION`).

See `docs/ai/CURSOR_TO_CHATGPT.md` for the evidence report.

## Active phase

P2 Identity — Better Auth proof/integration slice.

## Active task

- Task ID: `P2-IDENTITY-PROOF-001`
- Branch: `cursor/p2-identity-proof-slice`
- Base: `main` po scaleniu planu P2, commit `4230fb185044faef15d4dd59a9c3c99f6c2b5956`
- Pull Request: draft PR #11
- Instrukcja: `docs/ai/CHATGPT_TO_CURSOR.md` (Discord-only amendment)

## Current objective

Final review of PR #11 after green CI and owner-confirmed live Discord OAuth.

## In scope now

- proof slice only; final review of PR #11
- Discord-only active OAuth
- no merge

## Out of scope now

- Second OAuth provider activation (e.g. Google) — deferred
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

## Live Discord OAuth (owner)

PASSED 2026-08-05: sign-in → me 200 → accounts Discord → logout 200 → me 401.

## Next gate

Owner merge of PR #11 (Cursor does not merge). Next implementation slice after
merge + plan approval: `P2-IDENTITY-INTERNAL-JWT-001`.

## Last updated

2026-08-05 — Cursor (docs consistency; READY_FOR_OWNER_MERGE)
