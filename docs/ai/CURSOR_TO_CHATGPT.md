# Cursor → ChatGPT

## 1. Status

`READY_FOR_RE-AUDIT`

Owner amendment on draft PR #11: **P2 Identity active OAuth = Discord only**.
Google removed from required config, proof UI, live docs, and CI placeholders.
Session security, linking policy, Redis, PostgreSQL, and Discord `email=null`
unchanged. Multi-provider architecture (V2 User UUID + ports) retained for a
later second provider. Still **no** live OAuth and **no** merge.

## 2. Task ID

`P2-IDENTITY-PROOF-001`

## 3. Branch / PR / HEAD

- Branch: `cursor/p2-identity-proof-slice`
- PR: #11 (existing draft; no new PR, no merge)
- Final HEAD: _(filled after push)_

## 4. Discord-only amendment (this pass)

| Area                        | Change                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `identity-env.ts`           | Google env keys removed; Discord required when auth enabled                                              |
| `create-better-auth.ts`     | `socialProviders` = Discord only                                                                         |
| `SUPPORTED_PROVIDERS`       | `['discord']`; `LinkedAccountView.provider` stays `string`                                               |
| Proof UI                    | Discord sign-in / link only; server OAuth redirect retained                                              |
| `.env.example` / CI         | No `IDENTITY_GOOGLE_*`                                                                                   |
| `LOCAL_OAUTH_PROOF.md`      | Discord-only live checklist                                                                              |
| Tests                       | Discord-only env; same-email / explicit multi-account via deferred provider id string (not Google OAuth) |
| `PENDING_DECISIONS` DEC-003 | Owner amendment recorded                                                                                 |

## 5. Pinned dependencies (unchanged)

- `better-auth` = 1.6.25
- `@better-auth/redis-storage` = 1.6.25
- `ioredis` = 5.11.1
- `@fastify/cors` = 11.3.0
- `pg` = 8.22.0
- Schema via `pnpm dlx auth@1.6.25 generate …` (committed migration)

## 6. Layer schema and ports

Unchanged. Ports stay provider-agnostic; active OAuth allowlist is Discord.

## 7–10. Storage, cookies, tokens, prior review fixes

Unchanged from prior re-audit report (session Redis SoT, no PG session table,
token strip hooks, logout Set-Cookie, Nest HTTP integration, strict booleans).

## 11. Test evidence

_(filled after local validate / CI)_

## 12. Local command results

_(filled after local validate)_

## 13. CI

_(filled after push)_

## 14. Live checklist

Still pending owner execution **after** re-audit — Discord only; see
`docs/identity/LOCAL_OAUTH_PROOF.md`.

## 15. Risks / tech debt

- Formal NON_NEGOTIABLES / ADR-0010 wording still mentions Google in P2; owner
  amendment is in `PENDING_DECISIONS` DEC-003 — recommend ADR note after re-audit
  if owner confirms permanent doc update.
- Second OAuth provider not active; multi-account linking proven via adapter
  `deferred` provider id, not live Google.

## 16. Recommended next slice (not implemented)

Internal service-to-service JWT — unchanged.

## Last updated

2026-08-05 — Cursor (Discord-only P2 amendment)
