# Cursor → ChatGPT

## 1. Status

`READY_FOR_OWNER_MERGE`

Draft PR #11: P2 Identity Better Auth proof with **Discord-only** active OAuth.
Owner live Discord OAuth gate **PASSED** (manual subset below). Proof UI logout
empty-body fix included. Still **no merge** by Cursor.

## 2. Task ID

`P2-IDENTITY-PROOF-001`

## 3. Branch / PR / source of truth

- Branch: `cursor/p2-identity-proof-slice`
- PR: #11 (existing draft; no new PR, no merge by Cursor)

**GitHub is the source of truth** for the current PR tip commit and the latest
Checks / workflow runs. This versioned report does **not** store or update tip
HEAD SHAs or CI run IDs (avoids self-driving docs commits). Read them from the
PR page / `gh pr view 11` / Actions.

### Identity code commit (stable reference — not tip HEAD)

- Label: **Identity code commit**
- SHA: `cdfeaca265c11d78a0bf29f6a400a7d113bfc7fb`
- Meaning: last commit on this branch that changed Identity Service application
  code (Discord-only OAuth scope + proof UI logout empty-JSON fix). Later tip
  commits may be documentation-only.

## 4. Scope (Discord-only)

Active OAuth provider: **Discord only**. Google not in config, proof UI, live
checklist, or CI. V2 User UUID, ports, explicit linking, Redis sessions,
PostgreSQL, Discord `email=null` retained for a later second provider.

## 5. Live Discord OAuth (owner, 2026-08-05)

**Manually confirmed by owner:**

| Step                     | Result                   |
| ------------------------ | ------------------------ |
| Sign in with Discord     | OK                       |
| `GET /identity/me`       | 200                      |
| `GET /identity/accounts` | Discord account present  |
| Logout                   | 200 `{ "status": "ok" }` |
| `GET /identity/me` after | 401 `UNAUTHENTICATED`    |

**Not manually confirmed** (covered by automated tests and/or not run live):
logout-all, system revoke, PostgreSQL/Redis inspection, DB token-column check.
See `docs/identity/LOCAL_OAUTH_PROOF.md` §6b.

## 6. Proof UI logout fix

Fastify rejects `Content-Type: application/json` with an empty body
(`FST_ERR_CTP_EMPTY_JSON_BODY`). Proof UI POSTs `body: '{}'` for
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

Local identity (+ infra): **97 passed** (at Identity code commit era).

## 12. Local command results

- Identity vitest + infra: 97 passed
- `pnpm validate` gates + `test:runtime-smoke` passed on the proof slice

## 13. CI / Checks

See **GitHub PR #11 Checks** for the current tip. Do not copy run IDs into this
file.

## 14. Risks / tech debt

- Formal NON_NEGOTIABLES / ADR-0010 may still mention Google historically;
  active scope + DEC-003 amendment + brief banners say Discord-only.
- Rotate Discord Client Secret if it was ever pasted into chat.

## 15. Recommended next slice (not implemented)

`P2-IDENTITY-INTERNAL-JWT-001` — plan on GitHub Issue #13; not in this PR.

## Last updated

2026-08-05 — Cursor (report SoT = GitHub; READY_FOR_OWNER_MERGE)
