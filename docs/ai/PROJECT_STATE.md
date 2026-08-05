# PROJECT_STATE

## Status

`IN_PROGRESS` — security remediation on PR #14 (READY_FOR_REVIEW retracted)

Branch `cursor/p2-identity-internal-jwt` implements P2 internal service-to-service JWT (Issue #13, D1=C). Draft PR #14. GitHub is SoT for tip HEAD and CI.

See `docs/ai/CURSOR_TO_CHATGPT.md` for the evidence report.

## Active phase

P2 Identity — internal service-to-service JWT (security hardening).

## Active task

- Task ID: `P2-IDENTITY-INTERNAL-JWT-001`
- Branch: `cursor/p2-identity-internal-jwt`
- Base: `main` after PR #11 squash merge (`15586ac`)
- Issue: #13 (APPROVED, D1 = OWNER_ACCEPTED C) — remains OPEN
- Pull Request: #14 draft (no merge by Cursor)

## Current objective

Land security fixes on PR #14: kid↔client_id binding, strict assertion/JWT claim validation, public-only retiring/retired keyring, ephemeral test keys (no PEM in history), Redis shutdown, then `READY_FOR_REVIEW_SECURITY_FIXED`.

## In scope now

- Cross-client impersonation fix (`keyEntry.clientId === iss`, `iss === sub`)
- Strict single-string audience; iat/exp/jti/alg/kid header rules
- `@v2/internal-jwt` hardened verifier
- Internal JWT keyring: active has private; retiring/retired public-only; non-extractable signer
- Redis `OnModuleDestroy` lifecycle
- History rewrite of PR branch only (purge private PEMs)

## Out of scope now

- Merge PR #14
- Close Issue #13
- New PR
- Internal JWT jti blacklist / Authorization RBAC / browser JWT

## Decisions in force

- DEC-008 A, DEC-009 A, ADR-0011
- Issue #13 D1 = C (client assertion)

## Last updated

2026-08-05 — Cursor (PR #14 security remediation)
