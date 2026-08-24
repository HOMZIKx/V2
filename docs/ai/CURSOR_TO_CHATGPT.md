# CURSOR → ChatGPT

## Status

**CODE:** `READY_FOR_CHATGPT_REAUDIT`  
**RUNTIME:** `NOT_TEST_DISCORD_RUNTIME_VERIFIED`  
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-CHATGPT-INTEGRATED-REVIEW-REMEDIATION-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: **#19** — do not merge

Checkpoint: **`CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA`** — _(pinned after push)_

Prior integrated review base at ChatGPT audit: `1623d71ce402d4b979941be81fbf35f8f2d2d7d1` — **do not assume still current**.

---

## What changed (remediation)

### HIGH — rate limit trust boundary (H-SEC-03)

- Removed manual `X-Forwarded-For` parsing from `clientKeyFromRequest`.
- Fastify `trustProxy` on api-gateway (`API_GATEWAY_TRUST_PROXY`; production default true on Zeabur single-hop).
- Documented in `docs/deploy/ZEABUR.md` §11.
- Tests: spoofed XFF ignored; limit tied to `request.ip`.

### HIGH — rate limit memory bound (H-SEC-04)

- Lazy sweep + `RATE_LIMIT_MAX_BUCKETS` cap on gateway limiter store.
- Stress test: many identities → expire → bounded size.

### HIGH — org scope (`searchSimilarGroupsBeforeCreate`)

- Now uses authoritative `resolveGuildOrganizationId` before `listOpenActivitiesForLfg`.
- Negative test: guild O1 + request O2 → `FORBIDDEN`.
- Fixed `createLfgFullGroupWatch` insert to use resolved org id.
- Marketplace offer create binds org via `resolveGuildOrganizationId` (prototype scope only).

### Org helper hardening

- `resolveGuildOrganizationId` — fail-closed when guild settings missing.
- `resolveGuildOrganizationIdForBootstrap` — ensure-defaults / initial publish only.

### Security audit honesty

- `docs/ai/FOUNDATION_ADVERSARIAL_SECURITY_AUDIT.md` — prior H-SEC-01/02 “fully closed” claim corrected; ChatGPT residuals + fixes recorded.

### Activity org-scope audit

All guild-scoped paths audited — see audit doc table. Reservations: spot scope from DB. No remaining cross-org **read** when guild settings bind another org.

---

## Validation

| Check                  | Result                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| LOCAL_VALIDATE         | **PASS** (`corepack pnpm validate`)                                                          |
| Targeted specs         | **PASS** — `rate-limit.spec.ts`, `guild-organization-scope.spec.ts`, `lfg.use-cases.spec.ts` |
| CRITICAL / HIGH (code) | **0 / 0** after remediation                                                                  |
| CI_STATUS              | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT**                                                    |

---

## Runtime (honest)

| Item                                             | Status                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Zeabur deploy                                    | `activity-service` + `discord-gateway` upload redeploy attempted (CLI auth OK) |
| discord-gateway health                           | `ready` on guild `1534228693017432124`                                         |
| Live Discord UI smoke (Centrum, LFG menu clicks) | **NOT VERIFIED** — Discord Web login required                                  |
| Report                                           | `docs/ai/TEST_DISCORD_LIVE_RUNTIME_REPORT.md`                                  |

**Do not** set `RUNTIME_STATUS = TEST_DISCORD_RUNTIME_VERIFIED` until Owner/authenticated Discord UI proof.

---

## STOP

Do **not** merge. Do **not** implement Reservations or Marketplace product scope.
