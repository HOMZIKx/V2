# PROJECT_STATE

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG v1: **`READY_FOR_CHATGPT_FINAL_APPROVAL`** (final HIGH fixes `V2-LFG-FINAL-TWO-HIGH-FIXES-007`).

Not READY for Core Foundation Owner/ChatGPT review.  
Not APPROVED. Not merged. STOP before Stage 8.  
**STOP Stage 6/7 product expansion** until Owner Discovery closes (see
`docs/ai/OWNER_DISCOVERY_GAPS.md`).

## Current execution

| Field                  | Value                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| CURRENT_TASK           | `V2-LFG-FINAL-TWO-HIGH-FIXES-007`                                   |
| CURRENT_PRODUCT_STATUS | `CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`                      |
| LFG_STATUS             | `READY_FOR_CHATGPT_FINAL_APPROVAL`                                  |
| CURRENT_BRANCH         | `cursor/p4-1-activity-domain`                                       |
| CURRENT_HEAD / PR_HEAD | `b9a1bab9c75ce8cf91982e60d2a30a057cc6c6d3`                          |
| PR                     | #19                                                                 |
| CI_STATUS              | `BLOCKED_GITHUB_BILLING_SPENDING_LIMIT` (jobs never started)        |
| LOCAL_VALIDATE         | `PASS` — format/lint/typecheck/coverage/arch/build/e2e/smoke        |
| ZEABUR_LIVE_API_SHA    | `2c2b3e9` (stale before tip redeploy)                               |
| ZEABUR_LIVE_WEB_SHA    | `22ba38b` (stale before tip redeploy)                               |
| ZEABUR_REDEPLOY        | **BLOCKED** — Owner must provide `ZEABUR_TOKEN` (+ `ZEABUR_ENV_ID`) |
| PR_TITLE_STATUS        | WIP conventional title on PR #19                                    |
| REPOSITORY_VISIBILITY  | `PRIVATE_CONFIRMED`                                                 |

## Governance

Fundamental rule (Owner decision): every **new product function** requires
IDEA → Owner+ChatGPT Discovery → Options → Owner Decisions → Accepted SoT →
implementation prompt. Continuous execution does **not** override this.

SoT gap matrix: `docs/ai/OWNER_DISCOVERY_GAPS.md`.

Issue #20 Owner closure (2026-08-22): **DISCOVERY STATUS: CLOSED FOR DUNGEON LFG v1. IMPLEMENTATION AUTHORIZED.**

Reservations: **`RESERVATIONS_OWNER_DISCOVERY_REQUIRED`** — prep pack `docs/ai/RESERVATIONS_DISCOVERY_PREP.md` (**`RESERVATIONS_DISCOVERY_PREP_READY`**).

## Checkpoint ledger

Historical markers remain immutable. Distinguish **Accepted** vs **WIP** vs **prototype**.

| Marker                                     | SHA                                        | Class                                                           |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------- |
| CI_SECURITY_CLOSURE_SHA                    | `f4577fb0e5860c34e269fa3183eef17d4d6106a7` | HISTORICAL / prior closure                                      |
| V2_HUB_CORE_CHECKPOINT_SHA                 | `178a37e1bf3fb83d0ef080453c96da17aa14e5e5` | ACCEPTED_STAGE_CHECKPOINT (Hub)                                 |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA          | `ea3e7b97719726aceb5226907a90ad270ca9783e` | IMPLEMENTATION_MARKER — principles #24; catalog details open    |
| ACTIVITY_2_LFG_IMPLEMENTATION_WIP_SHA      | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — superseded by v1 checkpoint                    |
| **DUNGEON_LFG_V1_IMPLEMENTATION_SHA**      | `976b89cf4740ef9b3948dd83a82e32659e4eeb07` | v1 implementation base                                          |
| **DUNGEON_LFG_V1_AUDIT_SHA**               | `53e7d3ab8597f4a021abae96bdf3e6d1faad60a4` | Deep audit — CRITICAL/HIGH = 0 (pre-ChatGPT)                    |
| **DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA** | `3c3009991f656e4369d3f600fcb05266683ede50` | ChatGPT remediation pass 1                                      |
| **DUNGEON_LFG_V1_DURABLE_DM_CONTEXT_SHA**  | `d781c2b275ecb88275b7ab2e84ae468065163c7f` | Durable DM intent/watch context                                 |
| **DUNGEON_LFG_V1_FINAL_HIGH_FIXES_SHA**    | _(checkpoint commit)_                      | **READY_FOR_CHATGPT_FINAL_APPROVAL** — mute + watch fulfillment |
| RESERVATIONS_FOUNDATION_WIP_SHA            | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — discovery prep ready                           |
| MARKETPLACE_FOUNDATION_WIP_SHA             | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — #28 `NOT_ACCEPTED_FOR_PRODUCT_IMPLEMENTATION`  |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA  | `24828b7…` (invalid as final)              | **REVOKED** as review readiness                                 |
| CORE_STATE_AND_CI_RECOVERY_SHA             | `cf15925248f24aad7ceca4c0715d10686dc0199e` | prior remediation                                               |
| DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA   | `90fc384…`                                 | historical auto-sync baseline                                   |
| OWNER_DISCOVERY_GOVERNANCE_REMEDIATION_SHA | `9a6ab229544776f68ced8be6de4d6f4add3d496c` | governance remediation                                          |
| POST_OVERBUILD_TECHNICAL_AUDIT_SHA         | `25552dc75a5551f7185d77a8c02bbca5999bee89` | prior technical audit (base for LFG v1)                         |
| **ZEABUR_PRODUCTION_READINESS_AUDIT_SHA**  | `b4ce19fb066b7e44ef1322e236df4c730ccf7dce` | Zeabur deploy readiness audit + safe fixes                      |
| **CROSS_SERVICE_CONTRACT_AUDIT_SHA**       | `b7cf78fa258ac6e431a0510e21c13651271acb1b` | Cross-service DTO drift audit + shared LFG/admin transport      |
| **DURABILITY_RECOVERY_AUDIT_SHA**          | `be86063726947930a02c06eab38dad947a4243cc` | Durability/outbox/auto-recovery audit + safe CRITICAL/HIGH      |

## Module discovery status (summary)

| Module        | Status                                                                |
| ------------- | --------------------------------------------------------------------- |
| Hub Core      | Accepted Stage 3 (+ implementation assumptions flagged)               |
| Notifications | Principles Accepted #24; product catalog/timings open                 |
| Activity P4   | Accepted P4 decisions                                                 |
| LFG           | **`READY_FOR_CHATGPT_FINAL_APPROVAL`** (#20 closed; final HIGH fixes) |
| Reservations  | `RESERVATIONS_OWNER_DISCOVERY_REQUIRED` (prep ready)                  |
| Marketplace   | `OWNER_DISCOVERY_REQUIRED` (#28); prototype only                      |

## CRITICAL / HIGH

| ID                    | Severity            | Item                                                         |
| --------------------- | ------------------- | ------------------------------------------------------------ |
| CI-BILLING-001        | CRITICAL (CI green) | GitHub Actions billing / spending limit — Owner must restore |
| MARKETPLACE-DISC-001  | HIGH (scope)        | Issue #28 — do not treat Stage 7 as done                     |
| RESERVATIONS-DISC-001 | HIGH (scope)        | Discovery prep ready — do not expand Reservations product    |
| GOVERNANCE-001        | HIGH (process)      | Owner Discovery gate — see `OWNER_DISCOVERY_GAPS.md`         |

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

2026-08-24 — Final two HIGH fixes (`V2-LFG-FINAL-TWO-HIGH-FIXES-007`); `LFG_STATUS = READY_FOR_CHATGPT_FINAL_APPROVAL`.
