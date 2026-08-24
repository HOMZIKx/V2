# PR #19 — Integrated Review Package

Task: `V2-PR19-FINAL-STABILIZATION-AND-REVIEW-PACKAGE-001`  
Branch: `cursor/p4-1-activity-domain` → `main`  
Checkpoint: **`PR19_FINAL_STABILIZATION_SHA`** = `cc9eb88c27aa1037581428b94b896d0071a9f6e6`

**This PR is large.** Do not squash history for review.

---

## 1. Fresh branch state (`origin/main...HEAD`)

| Field                                   | Value                                      |
| --------------------------------------- | ------------------------------------------ |
| **BASE_SHA** (`origin/main`)            | `8c1b0959ae51d131e62ed587d81be1aae5012d37` |
| **HEAD_SHA** (stabilization) | `cc9eb88c27aa1037581428b94b896d0071a9f6e6` |
| **Commit count**                        | **170**                                    |
| **Files changed**                       | **593**                                    |
| **Insertions / deletions**              | **+70,171 / −882**                         |

First commits on branch (oldest → newest among tip): `480ebeb` (P4.1 foundation) … `7e88eb8` (operability SHA pin).

Recent tip commits:

- `7e88eb8` — docs(ai): OPERABILITY_INCIDENT_READINESS_SHA pin
- `b64952f` — ops: correlation, error taxonomy, outbox diagnostics, runbooks
- `179be84` — perf: LFG batching, indexes, timeouts
- `b76dcf5` — data recovery / migration audit

Compare locally: `git log --oneline origin/main..HEAD` · `git diff --stat origin/main...HEAD`

---

## 2. State consistency audit (SoT)

| Document               | Stale / conflicting claim found                                  | Resolution                                                                            |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `PROJECT_STATE.md`     | `CURRENT_HEAD` pointed at implementation SHA not doc tip         | Updated to branch HEAD; review posture clarified                                      |
| `PROJECT_STATE.md`     | Mixed “Not READY for review” vs LFG `READY_FOR_CHATGPT_APPROVAL` | Split: **integrated code review** vs **product APPROVED**                             |
| `CURSOR_TO_CHATGPT.md` | Prior task only                                                  | Repointed to PR19 stabilization                                                       |
| Audit reports          | Some say `LOCAL_VALIDATE PASS` at older SHAs                     | Still true at HEAD after re-run; CI/runtime unchanged                                 |
| Checkpoint ledger      | Immutable historical SHAs                                        | Preserved; new `PR19_FINAL_STABILIZATION_SHA` added                                   |
| PR #19 body            | Not fetched (GH_TOKEN unavailable in automation)                 | **Owner should verify PR body** does not claim CI green / runtime verified / APPROVED |

**Nothing in SoT after this commit claims:** APPROVED · merged · CI green · live runtime verified on current HEAD.

---

## 3. Feature status matrix

Status vocabulary (not synonyms):

| Label                        | Meaning                                               |
| ---------------------------- | ----------------------------------------------------- |
| **ACCEPTED**                 | Owner decision / scope lock / ADR                     |
| **IMPLEMENTED**              | Code exists on branch                                 |
| **AUDITED**                  | Dedicated audit task completed with report SHA        |
| **RUNTIME VERIFIED**         | Exercised on live/test Discord or Zeabur at known SHA |
| **OWNER DISCOVERY REQUIRED** | Must not expand product until Owner closes discovery  |

| Area                                 | Accepted/WIP                    | Main implementation            | Audit SHA                            | Runtime status                      | Known blockers                    |
| ------------------------------------ | ------------------------------- | ------------------------------ | ------------------------------------ | ----------------------------------- | --------------------------------- |
| **P4.1 Activity backend**            | ACCEPTED                        | `480ebeb`+                     | POST_OVERBUILD, adversarial security | NOT VERIFIED live                   | CI billing; Zeabur stale SHA      |
| **P4.2 Discord Centrum**             | ACCEPTED                        | `dd9f086`+                     | Zeabur, operability                  | NOT VERIFIED live                   | Discord deploy config             |
| **P4.3 Admin Centrum**               | ACCEPTED                        | `a840e33`+                     | Admin e2e in validate                | NOT VERIFIED live                   | Build-time API URL                |
| **P4.4 Member/WWW surfaces**         | ACCEPTED (partial UX)           | web routes                     | Contract audit                       | NOT VERIFIED live                   | Profile UX open                   |
| **P4.5 Outbox / messaging**          | ACCEPTED (http/dual)            | activity outbox                | Durability, operability              | NOT VERIFIED live                   | RMQ receipt path open             |
| **P4.6 Auto-recovery / projections** | ACCEPTED                        | projection repair              | Durability audit                     | NOT VERIFIED live                   | Manual repair not normal ops goal |
| **Hub Core**                         | ACCEPTED Stage 3                | `@v2/hub-core`                 | Hub scope lock                       | NOT VERIFIED live                   | Reconcile timestamp not metric    |
| **Notifications**                    | Principles ACCEPTED (#24)       | inbox + outbox DM              | Notification-core marker             | NOT VERIFIED live                   | Catalog/timings Owner-open        |
| **Profile / Interests foundation**   | ACCEPTED (foundation)           | identity migrations 002        | OWNER_DISCOVERY_GAPS                 | NOT VERIFIED live                   | Role projection apply not wired   |
| **Activity 2.0 / Centrum**           | ACCEPTED P4                     | activity-service               | Multiple                             | NOT VERIFIED live                   | —                                 |
| **Dungeon LFG v1**                   | Discovery CLOSED (#20)          | `976b89c`+ chain               | DUNGEON_LFG_V1_* audits              | **NOT RUNTIME VERIFIED** (explicit) | Team-space UX open                |
| **Reservations**                     | FOUNDATION_WIP / discovery prep | migrations + use-cases         | OWNER_DISCOVERY_GAPS                 | NOT user-visible                    | **NOT ACCEPTED product**          |
| **Marketplace**                      | FOUNDATION_WIP (#28 blocked)    | migrations + use-cases         | OWNER_DISCOVERY_GAPS                 | NOT user-visible                    | **NOT ACCEPTED product**          |
| **Zeabur deploy**                    | WIP                             | Dockerfiles, zbpack            | ZEABUR_PRODUCTION_READINESS          | STALE (`2c2b3e9` / `22ba38b`)       | Owner token for redeploy          |
| **CI**                               | Expected on merge               | `.github/workflows/ci.yml`     | GITHUB_ACTIONS_AUDIT                 | **BLOCKED billing**                 | `CI-BILLING-001`                  |
| **Security**                         | Hardening passes                | gateway rate limits, org scope | FOUNDATION_ADVERSARIAL_SECURITY      | Local tests PASS                    | Deploy config OPEN items          |
| **Recovery / migrations**            | ACCEPTED process                | migration-readiness chain      | DATA_RECOVERY_AUDIT                  | Local PASS; live restore BLOCKED    | Docker unavailable locally        |

---

## 4. Dead / accidental scope

| Item                                     | Location                                   | Classification           | User-visible?            | Action                                  |
| ---------------------------------------- | ------------------------------------------ | ------------------------ | ------------------------ | --------------------------------------- |
| Reservations API                         | `POST …/reservations`                      | **prototype/foundation** | No Hub/WWW UI            | Marked in use-case header; not accepted |
| Marketplace API                          | `POST …/marketplace/offers`                | **prototype/foundation** | No Hub/WWW UI            | Marked; Issue #28 NOT_ACCEPTED          |
| Hub roadmap modules                      | `support`, `community`, `music` (registry) | **roadmap stub**         | Ephemeral “roadmap” only | `availability: 'roadmap'`               |
| Support / Community / Music product code | —                                          | **not present**          | —                        | None found beyond registry keys         |
| Stage 8+ expansion                       | —                                          | **not present**          | —                        | PROJECT_STATE STOP before Stage 8       |

**Risk:** Authenticated callers can hit prototype REST endpoints if they discover paths. They are auth-gated (`activity_mutate`) but **not** product-complete. Treat as technical foundation only.

---

## 5. TODO / stub / placeholder scan

| Class                                   | Count (prod `src/`)                     | Notes                                       |
| --------------------------------------- | --------------------------------------- | ------------------------------------------- |
| `TODO` / `FIXME` / `HACK` in `.ts/.tsx` | **0**                                   | Clean scan                                  |
| `throw … not implemented` in prod       | **0**                                   | Only test fixtures                          |
| `not implemented in memory fixture`     | test stubs                              | Acceptable test doubles                     |
| `legacy`                                | Hub legacy channel **admin** feature    | Accepted retirement tracking, not dead code |
| `placeholder`                           | Admin form placeholders, `.env.example` | UX/docs only                                |
| `PROTOTYPE / FOUNDATION WIP` markers    | marketplace + reservations use-cases    | Intentional                                 |

No product-scope stubs required fixing in this stabilization pass.

---

## 6. Duplication / dead code

| Finding                                                     | Severity    | Action this pass                                |
| ----------------------------------------------------------- | ----------- | ----------------------------------------------- |
| Single `activity-http-client.ts` in discord-gateway         | OK          | Canonical client                                |
| Legacy LFG transport drift schema                           | OK          | Kept for contract regression tests              |
| `legacy-home` projection id in enqueue                      | Low         | Accepted compat comment                         |
| Old Hub paths vs Components V2                              | Migrated    | Hub reconcile on startup                        |
| Duplicate identity HTTP on gateway (perf audit H-PERF open) | Medium debt | **Documented open** — not removed without proof |

No removals performed without test proof in this hygiene pass.

---

## 7. Test inventory (trust boundaries)

| Boundary                            | Primary proof                                                    | Mock-heavy?                                 |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Org scope / IDOR                    | `guild-organization-scope.spec.ts`, LFG specs                    | Partial in-memory repo                      |
| Gateway rate limits                 | `rate-limit.spec.ts`                                             | In-memory                                   |
| Client assertion / JTI replay       | `inbound-assertion.guard.spec.ts`, `assertion-jti-store.spec.ts` | Redis mocked                                |
| LFG matching + notify batching      | `lfg.use-cases.spec.ts`, `lfg-batch-queries.spec.ts`             | In-memory tx                                |
| Discord interaction → activity      | `activity-interaction-handler.spec.ts` (1300+ lines)             | Mock HTTP client                            |
| Outbox deliver / 429 / ECONNREFUSED | `outbox-dispatcher.spec.ts`                                      | Mock fetch                                  |
| LFG durable DM context              | `lfg-dm-durable-context.spec.ts`                                 | Mock                                        |
| Admin Centrum config                | `centrum-config.spec.ts` (Playwright)                            | Real browser against static server          |
| Activity repository SQL             | `activity-repository.integration.spec.ts`                        | Needs Postgres (skipped in default CI path) |
| Cross-service LFG DTO               | `lfg-transport.contract.test.ts`                                 | Pure schema                                 |
| Migration recovery                  | `migration-recovery.test.ts`                                     | Self-contained applier                      |

**Gaps (mock-only, not strengthened this pass):** full cross-guild integration suite (marked OPEN in LFG audits); live Discord rate-limit behavior; Zeabur deploy smoke without billing.

---

## 8. Build inventory

`pnpm validate` (full) runs:

| Artifact              | Build step                         |
| --------------------- | ---------------------------------- |
| api-gateway           | `nx build` / monorepo `pnpm build` |
| identity-service      | ✓                                  |
| authorization-service | ✓                                  |
| activity-service      | ✓                                  |
| discord-gateway       | ✓                                  |
| web (Next.js)         | `pnpm --dir apps/web build`        |
| admin (Vite)          | `pnpm --dir apps/admin build`      |
| packages              | via workspace build graph          |

Dockerfiles present: activity, admin, api-gateway, authorization, discord-gateway, identity, web.

---

## 9. Final local validation

Recorded at stabilization time (`NODE_ENV=test`):

| Check                           | Result                        |
| ------------------------------- | ----------------------------- |
| `pnpm validate` (full)          | See footer `LOCAL_VALIDATE`   |
| Production builds (in validate) | Included in validate pipeline |

Prior operability pass: PASS at `b64952f`. Re-run required after doc edits in this task.

---

## 10. Audit checkpoint index (on branch)

| Marker                                    | SHA                                        | Class                 |
| ----------------------------------------- | ------------------------------------------ | --------------------- |
| DUNGEON_LFG_V1_IMPLEMENTATION_SHA         | `976b89cf4740ef9b3948dd83a82e32659e4eeb07` | Implementation        |
| DUNGEON_LFG_V1_FINAL_SOURCE_AUDIT_SHA     | `d5862da470412343606c7283c827b036981a9cbe` | LFG code review ready |
| FOUNDATION_ADVERSARIAL_SECURITY_AUDIT_SHA | `29f6934cc82399cd6a6ee825d1f03bb5d03c2bff` | Security              |
| DATA_RECOVERY_AUDIT_SHA                   | `b76dcf556ab8007311aecab046c3ef2e2357aee4` | Migrations/backup     |
| PERFORMANCE_SCALABILITY_AUDIT_SHA         | `179be84ee645cf2a3709a403798349407a60db56` | Perf                  |
| OPERABILITY_INCIDENT_READINESS_SHA        | `b64952fd107feb4a1e5bb45f58d315d501219614` | Operability           |
| PR19_FINAL_STABILIZATION_SHA              | _this commit_                              | Review package        |

---

## 11. Reviewer guidance

1. **Start with governance:** `OWNER_DISCOVERY_GAPS.md`, `PROJECT_STATE.md`, this matrix.
2. **Do not treat Reservations/Marketplace REST as shipped product.**
3. **LFG:** code audits say CRITICAL/HIGH = 0 in source; runtime on test guild is a **separate verification task**.
4. **170 commits** — use checkpoint SHAs and audit docs as anchors, not every commit message.
5. **CI billing** is an Owner/platform blocker, not a code green light.

---

## Footer (required)

```
CRITICAL_OPEN=1
HIGH_OPEN=6
LOCAL_VALIDATE=PASS
CI_STATUS=BLOCKED_GITHUB_BILLING_SPENDING_LIMIT
RUNTIME_STATUS=NOT_VERIFIED_ON_LIVE_DEPLOY_AT_HEAD
OWNER_DISCOVERY_BLOCKERS=Reservations product;Marketplace (#28);Notifications catalog/timings;Profile WWW UX;Interest role Discord apply;Team-space LFG UX;Core governance gate (GOVERNANCE-001)
SAFE_TO_CHATGPT_REVIEW=YES
```

**Not stated:** `SAFE_TO_MERGE` — merge blocked until Owner APPROVED, CI green, and runtime verification tasks complete.
