# Cursor → ChatGPT

## 1. Status

`IN_PROGRESS` → target `READY_FOR_REVIEW_SECURITY_FIXED`

P2 internal service-to-service JWT security remediation on draft PR #14
(`cursor/p2-identity-internal-jwt`). Issue #13 stays OPEN. **No merge by Cursor.**

## 2. Task ID

`P2-IDENTITY-INTERNAL-JWT-001`

## 3. Branch / PR / source of truth

- Branch: `cursor/p2-identity-internal-jwt`
- Issue: #13 (OPEN)
- PR: #14 draft (GitHub SoT for tip HEAD, CI)

## 4. Security fixes in this pass

| Area               | Fix                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion binding  | `keyEntry.clientId === iss`, `iss === sub`; `jwtVerify` issuer = key owner; audience allowlist only for key owner                         |
| Assertion claims   | Single-string `aud === ISSUE_URL`; integer `iat`/`exp`; future `iat` rejected; TTL ≤ 60; UUID `jti`; `kid` header-only; `alg=EdDSA`       |
| `@v2/internal-jwt` | Single-string `aud`; require `iat`; `exp>iat`; TTL ≤ 300; UUID `jti`; header-only `kid`; `EdDSA`                                          |
| Keyring            | active: private+public; retiring/retired: public-only (private rejected); one active; non-extractable signing key; JWKS = active+retiring |
| Secrets            | No static PKCS#8 PEMs in tree; ephemeral Ed25519 in tests; gitleaks path allowlists for crypto fixtures removed                           |
| Redis              | `InternalJwtLifecycleService` `OnModuleDestroy` closes assertion store once                                                               |

## 5. Hard constraints confirmed

- Domain/Application do not import Nest/Fastify/Better Auth/ioredis/pg
- Browser never receives JWT or client assertion
- Cross-client impersonation rejected before issue
- Redis replay fail-closed
- No broad gitleaks allowlist for production keyring / fixtures

## 6. Tests (highlights)

- Cross-client impersonation (unit + infra)
- Future `iat`, audience array, bad UUID/alg/signature, missing claims
- Exact single audience (assertion + package)
- Public-only retiring/retired; multi-active / mismatch / active-without-private rejected
- Lifecycle closes Redis once
- Payload omits email/roles/permissions/discord/session id
- Gateway proof returns `{ ok, sub }` only

## 7. Validation commands

```bash
pnpm validate
RUN_INFRA_TESTS=true pnpm --filter @v2/identity-service test
# local gitleaks on main..HEAD; also confirm no PKCS#8 private PEMs in `git log -p main..HEAD`
```

## 8. Open risks / notes

- PR branch history will be rewritten (`--force-with-lease`) to purge PEMs from all PR commits
- `main` unchanged

## Last updated

2026-08-05 — Cursor (security remediation)
