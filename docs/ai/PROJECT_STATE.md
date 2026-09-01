# PROJECT_STATE

## Status

`V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002` — code **`LOCAL_VALIDATE PASS`** · security CRITICAL/HIGH = **0** · runtime **partial** (deploy tip pending)

Product / merge: **NOT APPROVED** · **NOT MERGED** · **NOT CI GREEN** · **NOT RUNTIME VERIFIED AT HEAD**

LFG v1 code path: prior audits **`READY_FOR_CHATGPT_APPROVAL`** (`LFG_CODE_STATUS`) — **runtime on test Discord is a separate task**.

**STOP Stage 6/7 product expansion** until Owner Discovery closes (see `docs/ai/OWNER_DISCOVERY_GAPS.md`).

## Current execution

| Field                   | Value                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| CURRENT_TASK            | `V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002` (code done; runtime partial) |
| REVIEW_POSTURE          | Security boundary remediation — fail-closed Authz/Identity; narrow hub projection S2S |
| CODE_STATUS             | `SECURITY_REMEDIATION_COMMITTED` — RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA pinned |
| CURRENT_PRODUCT_STATUS  | `CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`                              |
| LFG_CODE_STATUS         | `READY_FOR_CHATGPT_APPROVAL` (source audits; runtime separate)              |
| CURRENT_BRANCH          | `cursor/p4-1-activity-domain`                                               |
| CURRENT_HEAD / PR_HEAD  | `8306f3e17591622922510804b1098b713b76b8d6` (docs tip; remediation code `04881cb`) |
| PR                      | #19 — **do not merge**                                                      |
| PR_REVIEW_PACKAGE       | `docs/ai/PR19_REVIEW_PACKAGE.md`                                            |
| CI_STATUS               | `BLOCKED_GITHUB_BILLING_SPENDING_LIMIT` (jobs never started)                |
| LOCAL_VALIDATE          | `PASS` — format/lint/typecheck/coverage/arch/build/e2e/smoke (2026-08-31) |
| RUNTIME_STATUS          | `NOT_TEST_DISCORD_RUNTIME_VERIFIED` — Hub shell @ tip; activity+identity unhealthy |
| RUNTIME_REPORT          | `docs/ai/TEST_DISCORD_LIVE_RUNTIME_REPORT.md`                               |
| ZEABUR_LIVE_DISCORD_SHA | `8306f3e17591622922510804b1098b713b76b8d6` (**MATCH** docs tip, 2026-09-01) |
| ZEABUR_LIVE_API_SHA     | stale risk remains                                                          |
| ZEABUR_DEPLOY           | api-gateway upstream URLs fixed :8080; ready still 503 — upstream ready checks TBD |
| PR_TITLE_STATUS         | WIP conventional title on PR #19                                            |
| REPOSITORY_VISIBILITY   | `PRIVATE_CONFIRMED`                                                         |

## Governance

Fundamental rule (Owner decision): every **new product function** requires
IDEA → Owner+ChatGPT Discovery → Options → Owner Decisions → Accepted SoT →
implementation prompt. Continuous execution does **not** override this.

SoT gap matrix: `docs/ai/OWNER_DISCOVERY_GAPS.md`.

Issue #20 Owner closure (2026-08-22): **DISCOVERY STATUS: CLOSED FOR DUNGEON LFG v1. IMPLEMENTATION AUTHORIZED.**

Reservations: **`OWNER_DISCOVERY_READY`** — Owner pack `docs/ai/RESERVATIONS_OWNER_DECISIONS.md` (prep: `docs/ai/RESERVATIONS_DISCOVERY_PREP.md`).

Guild Control / G8 / member monitoring: **`GUILD_CONTROL_DISCOVERY_PREP_READY`** — `docs/ai/GUILD_CONTROL_DISCOVERY_PREP.md` (no implementation).

## Checkpoint ledger

Historical markers remain immutable. Distinguish **Accepted** vs **WIP** vs **prototype**.

| Marker                                        | SHA                                        | Class                                                                         |
| --------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| CI_SECURITY_CLOSURE_SHA                       | `f4577fb0e5860c34e269fa3183eef17d4d6106a7` | HISTORICAL / prior closure                                                    |
| V2_HUB_CORE_CHECKPOINT_SHA                    | `178a37e1bf3fb83d0ef080453c96da17aa14e5e5` | ACCEPTED_STAGE_CHECKPOINT (Hub)                                               |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA             | `ea3e7b97719726aceb5226907a90ad270ca9783e` | IMPLEMENTATION_MARKER — principles #24; catalog details open                  |
| ACTIVITY_2_LFG_IMPLEMENTATION_WIP_SHA         | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — superseded by v1 checkpoint                                  |
| **DUNGEON_LFG_V1_IMPLEMENTATION_SHA**         | `976b89cf4740ef9b3948dd83a82e32659e4eeb07` | v1 implementation base                                                        |
| **DUNGEON_LFG_V1_AUDIT_SHA**                  | `53e7d3ab8597f4a021abae96bdf3e6d1faad60a4` | Deep audit — CRITICAL/HIGH = 0 (pre-ChatGPT)                                  |
| **DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA**    | `3c3009991f656e4369d3f600fcb05266683ede50` | ChatGPT remediation pass 1                                                    |
| **DUNGEON_LFG_V1_DURABLE_DM_CONTEXT_SHA**     | `d781c2b275ecb88275b7ab2e84ae468065163c7f` | Durable DM intent/watch context                                               |
| **DUNGEON_LFG_V1_FINAL_HIGH_FIXES_SHA**       | `94e71fef5bcb8c541824a058dae37020c86516af` | Mute + watch fulfillment                                                      |
| **DUNGEON_LFG_V1_FINAL_SOURCE_AUDIT_SHA**     | `d5862da470412343606c7283c827b036981a9cbe` | **READY_FOR_CHATGPT_APPROVAL** — final source reaudit + lifecycle             |
| **FOUNDATION_ADVERSARIAL_SECURITY_AUDIT_SHA** | `29f6934cc82399cd6a6ee825d1f03bb5d03c2bff` | Prior pass — HIGH closure **incomplete** (ChatGPT found residuals)            |
| **CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA** | `24ca822dcb4af77569074dba955f790d80cf0836` | Rate-limit trust/memory + org scope hardening — **READY_FOR_CHATGPT_REAUDIT** |
| **DISCORD_OWNER_UX_CORRECTION_PACK_SHA**      | `2a90a437a048cb7f59cb5dbc88f5e653d4bb7ecf` | Owner Discord UX correction pack 002                                          |
| **GUILD_CONTROL_DISCOVERY_PREP_SHA**          | `e0e4401f547d577305b8675fed1859f142dfe01d` | Guild Control + member monitoring discovery prep 001                          |
| **RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA** | `04881cbefe015813e2ae0655757e32a37a73f9ab` | Fail-closed Authz/Identity; narrow hub projection S2S |
| RESERVATIONS_FOUNDATION_WIP_SHA               | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — Owner decision pack ready                                    |
| MARKETPLACE_FOUNDATION_WIP_SHA                | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — #28 `NOT_ACCEPTED_FOR_PRODUCT_IMPLEMENTATION`                |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA     | `24828b7…` (invalid as final)              | **REVOKED** as review readiness                                               |
| CORE_STATE_AND_CI_RECOVERY_SHA                | `cf15925248f24aad7ceca4c0715d10686dc0199e` | prior remediation                                                             |
| DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA      | `90fc384…`                                 | historical auto-sync baseline                                                 |
| OWNER_DISCOVERY_GOVERNANCE_REMEDIATION_SHA    | `9a6ab229544776f68ced8be6de4d6f4add3d496c` | governance remediation                                                        |
| POST_OVERBUILD_TECHNICAL_AUDIT_SHA            | `25552dc75a5551f7185d77a8c02bbca5999bee89` | prior technical audit (base for LFG v1)                                       |
| **ZEABUR_PRODUCTION_READINESS_AUDIT_SHA**     | `b4ce19fb066b7e44ef1322e236df4c730ccf7dce` | Zeabur deploy readiness audit + safe fixes                                    |
| **CROSS_SERVICE_CONTRACT_AUDIT_SHA**          | `b7cf78fa258ac6e431a0510e21c13651271acb1b` | Cross-service DTO drift audit + shared LFG/admin transport                    |
| **DURABILITY_RECOVERY_AUDIT_SHA**             | `be86063726947930a02c06eab38dad947a4243cc` | Durability/outbox/auto-recovery audit + safe CRITICAL/HIGH                    |
| **DATA_RECOVERY_AUDIT_SHA**                   | `b76dcf556ab8007311aecab046c3ef2e2357aee4` | Migration/backup/recovery audit + full-chain ready probe                      |
| **PERFORMANCE_SCALABILITY_AUDIT_SHA**         | `179be84ee645cf2a3709a403798349407a60db56` | LFG batching, indexes 019, timeouts, outbox backoff                           |
| **OPERABILITY_INCIDENT_READINESS_SHA**        | `b64952fd107feb4a1e5bb45f58d315d501219614` | Correlation, error taxonomy, outbox diagnostics, runbooks                     |
| **PR19_FINAL_STABILIZATION_SHA**              | `cc9eb88c27aa1037581428b94b896d0071a9f6e6` | PR #19 integrated review package                                              |

## Module discovery status (summary)

| Module        | Status                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Hub Core      | Accepted Stage 3 (+ implementation assumptions flagged)                |
| Notifications | Principles Accepted #24; product catalog/timings open                  |
| Activity P4   | Accepted P4 decisions                                                  |
| LFG           | **`READY_FOR_CHATGPT_APPROVAL`** (`LFG_CODE_STATUS`; runtime separate) |
| Reservations  | `OWNER_DISCOVERY_READY` — `RESERVATIONS_OWNER_DECISIONS.md`            |
| Marketplace   | `OWNER_DISCOVERY_REQUIRED` (#28); prototype only                       |
| Guild Control | `GUILD_CONTROL_DISCOVERY_PREP_READY` — bot-first ops; G8 #21 PLANNING  |

## CRITICAL / HIGH

| ID                              | Severity                 | Item                                                                                          |
| ------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| **Security (this remediation)** | **0 CRITICAL / 0 HIGH**  | Production Authz AllowAll + Identity PassThrough removed; hub projection S2S narrowed          |
| CI-BILLING-001                  | CRITICAL (CI green)      | GitHub Actions billing / spending limit — Owner must restore                                  |
| MARKETPLACE-DISC-001            | HIGH (scope)             | Issue #28 — do not treat Stage 7 as done                                                      |
| RESERVATIONS-DISC-001           | HIGH (scope)             | Discovery prep ready — do not expand Reservations product                                     |
| GOVERNANCE-001                  | HIGH (process)           | Owner Discovery gate — see `OWNER_DISCOVERY_GAPS.md`                                          |


## LFG v1 delivery (summary)

- Identity S2S character verify + server-side role authority
- Actionable LFG match DMs with **durable intent/watch context** in signed buttons (≤100 chars)
- Intent-based join: backend resolves `intentId` → stored character; ignores profile default
- Full-group watch join: resolves watch opaque id → stored character
- Nie teraz suppresses exact `intentId` (not actor-wide) when durable intent context present
- Server `eligiblePartyRoles` rendered in DM; backend revalidates role at click
- Multi-role join, custom time window, watch edit, full-group watch UX
- Background notify membership revalidation (JOIN permission)
- Admin composition from activity type catalog (FLEX + preferred explicit)
- Migration `017`/`018`; Hub wizard + WWW `/szukam-ekipy` parity

## Last updated

2026-08-31 — `V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002`: LOCAL_VALIDATE PASS; RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA=`04881cbefe015813e2ae0655757e32a37a73f9ab`; security CRITICAL/HIGH=0; live tip deploy pending.
