# PROJECT_STATE

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG v1: **`READY_FOR_CHATGPT_AUDIT`** (deep audit `V2-DUNGEON-LFG-V1-DEEP-AUDIT-002`).

Not READY for Core Foundation Owner/ChatGPT review.  
Not APPROVED. Not merged. STOP before Stage 8.  
**STOP Stage 6/7 product expansion** until Owner Discovery closes (see
`docs/ai/OWNER_DISCOVERY_GAPS.md`).

## Current execution

| Field                  | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| CURRENT_TASK           | `V2-DUNGEON-LFG-V1-DEEP-AUDIT-002`                           |
| CURRENT_PRODUCT_STATUS | `CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`               |
| LFG_STATUS             | `READY_FOR_CHATGPT_AUDIT`                                    |
| CURRENT_BRANCH         | `cursor/p4-1-activity-domain`                                |
| CURRENT_HEAD / PR_HEAD | `53e7d3ab8597f4a021abae96bdf3e6d1faad60a4`                   |
| PR                     | #19                                                          |
| CI_STATUS              | `BLOCKED_GITHUB_BILLING_SPENDING_LIMIT` (jobs never started) |
| LOCAL_VALIDATE         | `PASS` — `corepack pnpm validate` 2026-08-22 (audit tip)     |
| PR_TITLE_STATUS        | WIP conventional title on PR #19                             |
| REPOSITORY_VISIBILITY  | `PRIVATE_CONFIRMED`                                          |

## Governance

Fundamental rule (Owner decision): every **new product function** requires
IDEA → Owner+ChatGPT Discovery → Options → Owner Decisions → Accepted SoT →
implementation prompt. Continuous execution does **not** override this.

SoT gap matrix: `docs/ai/OWNER_DISCOVERY_GAPS.md`.

Issue #20 Owner closure (2026-08-22): **DISCOVERY STATUS: CLOSED FOR DUNGEON LFG v1. IMPLEMENTATION AUTHORIZED.**

## Checkpoint ledger

Historical markers remain immutable. Distinguish **Accepted** vs **WIP** vs **prototype**.

| Marker                                     | SHA                                        | Class                                                          |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------- |
| CI_SECURITY_CLOSURE_SHA                    | `f4577fb0e5860c34e269fa3183eef17d4d6106a7` | HISTORICAL / prior closure                                     |
| V2_HUB_CORE_CHECKPOINT_SHA                 | `178a37e1bf3fb83d0ef080453c96da17aa14e5e5` | ACCEPTED_STAGE_CHECKPOINT (Hub)                                |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA          | `ea3e7b97719726aceb5226907a90ad270ca9783e` | IMPLEMENTATION_MARKER — principles #24; catalog details open   |
| ACTIVITY_2_LFG_IMPLEMENTATION_WIP_SHA      | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — superseded by v1 checkpoint                   |
| **DUNGEON_LFG_V1_IMPLEMENTATION_SHA**      | `976b89cf4740ef9b3948dd83a82e32659e4eeb07` | **READY_FOR_CHATGPT_AUDIT** (post deep audit)                  |
| **DUNGEON_LFG_V1_AUDIT_SHA**               | `53e7d3ab8597f4a021abae96bdf3e6d1faad60a4` | Deep audit — CRITICAL/HIGH = 0                                 |
| RESERVATIONS_FOUNDATION_WIP_SHA            | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — `RESERVATIONS_OWNER_DISCOVERY_REQUIRED`       |
| MARKETPLACE_FOUNDATION_WIP_SHA             | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | FOUNDATION_WIP — #28 `NOT_ACCEPTED_FOR_PRODUCT_IMPLEMENTATION` |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA  | `24828b7…` (invalid as final)              | **REVOKED** as review readiness                                |
| CORE_STATE_AND_CI_RECOVERY_SHA             | `cf15925248f24aad7ceca4c0715d10686dc0199e` | prior remediation                                              |
| DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA   | `90fc384…`                                 | historical auto-sync baseline                                  |
| OWNER_DISCOVERY_GOVERNANCE_REMEDIATION_SHA | `9a6ab229544776f68ced8be6de4d6f4add3d496c` | governance remediation                                         |
| POST_OVERBUILD_TECHNICAL_AUDIT_SHA         | `25552dc75a5551f7185d77a8c02bbca5999bee89` | prior technical audit (base for LFG v1)                        |

## Module discovery status (summary)

| Module        | Status                                                  |
| ------------- | ------------------------------------------------------- |
| Hub Core      | Accepted Stage 3 (+ implementation assumptions flagged) |
| Notifications | Principles Accepted #24; product catalog/timings open   |
| Activity P4   | Accepted P4 decisions                                   |
| LFG           | **`READY_FOR_CHATGPT_AUDIT`** (#20 closed; audit CRITICAL/HIGH = 0) |
| Reservations  | `RESERVATIONS_OWNER_DISCOVERY_REQUIRED`                 |
| Marketplace   | `OWNER_DISCOVERY_REQUIRED` (#28); prototype only        |

## CRITICAL / HIGH

| ID                    | Severity            | Item                                                         |
| --------------------- | ------------------- | ------------------------------------------------------------ |
| CI-BILLING-001        | CRITICAL (CI green) | GitHub Actions billing / spending limit — Owner must restore |
| MARKETPLACE-DISC-001  | HIGH (scope)        | Issue #28 — do not treat Stage 7 as done                     |
| RESERVATIONS-DISC-001 | HIGH (scope)        | No Owner Discovery pack — do not expand Reservations         |
| GOVERNANCE-001        | HIGH (process)      | Owner Discovery gate — see `OWNER_DISCOVERY_GAPS.md`         |

## LFG v1 delivery (summary)

- Migration `017_lfg_v1.sql` — intents, suppressions, full-group watches, composition templates, `party_role_key`
- `@v2/hub-core/lfg-v1` — fingerprint, TTL, role-need copy
- activity-service — search, intents, atomic join, dynamic matching, H-08/H-09 fixes
- discord-gateway — mobile-first ephemeral Hub wizard + signed custom IDs
- web — `/szukam-ekipy` parity
- admin — composition template defaults per dungeon type

## Last updated

2026-08-22 — LFG v1 deep audit complete; status READY_FOR_CHATGPT_AUDIT.
