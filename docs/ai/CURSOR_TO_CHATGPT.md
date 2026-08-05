# Cursor → ChatGPT

## 1. Status

`READY_FOR_FINAL_REVIEW`

Draft PR #11: P2 Identity Better Auth proof with **Discord-only** active OAuth.
Owner live Discord OAuth gate **PASSED**. Proof UI logout empty-body fix included.
Still **no merge**.

## 2. Task ID

`P2-IDENTITY-PROOF-001`

## 3. Branch / PR / HEAD

- Branch: `cursor/p2-identity-proof-slice`
- PR: #11 (existing draft; no new PR, no merge)
- Final HEAD: _(filled after push + green CI)_

## 4. Scope (Discord-only)

Active OAuth provider: **Discord only**. Google not in config, proof UI, live
checklist, or CI. V2 User UUID, ports, explicit linking, Redis sessions,
PostgreSQL, Discord `email=null` retained for a later second provider.

## 5. Live Discord OAuth (owner, 2026-08-05)

| Step                     | Result                   |
| ------------------------ | ------------------------ |
| Sign in with Discord     | OK                       |
| `GET /identity/me`       | 200                      |
| `GET /identity/accounts` | Discord account present  |
| Logout                   | 200 `{ "status": "ok" }` |
| `GET /identity/me` after | 401 `UNAUTHENTICATED`    |

Documented in `docs/identity/LOCAL_OAUTH_PROOF.md` §6b.

## 6. Proof UI logout fix (this pass)

Fastify rejects `Content-Type: application/json` with an empty body
(`FST_ERR_CTP_EMPTY_JSON_BODY`). Proof UI now POSTs `body: '{}'` for
`/identity/logout` and `/identity/logout-all`. Regression test in
`proof-ui.controller.spec.ts`.

## 7. Pinned dependencies (unchanged)

- `better-auth` = 1.6.25
- `@better-auth/redis-storage` = 1.6.25
- `ioredis` = 5.11.1
- `@fastify/cors` = 11.3.0
- `pg` = 8.22.0

## 8–10. Architecture / storage / cookies

Unchanged: ports, Redis session SoT, no PG session table, token strip hooks,
logout Set-Cookie forwarding.

## 11. Test evidence

_(filled after local validate)_

## 12. Local command results

_(filled after local validate)_

## 13. CI

_(filled after green CI)_

## 14. Risks / tech debt

- Formal NON_NEGOTIABLES / ADR-0010 may still mention Google in P2 historically;
  active scope + DEC-003 amendment + brief banners say Discord-only.
- Rotate Discord Client Secret if it was ever pasted into chat.

## 15. Recommended next slice (not implemented)

Internal service-to-service JWT — unchanged.

## Last updated

2026-08-05 — Cursor (live gate + logout fix → READY_FOR_FINAL_REVIEW)
