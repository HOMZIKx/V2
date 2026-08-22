# PROJECT_STATE

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REMEDIATION_REQUIRED`

Not READY for Core Foundation Owner/ChatGPT review.  
Not APPROVED. Not merged. STOP before Stage 8.

## Current execution

| Field                  | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| CURRENT_TASK           | `V2-CORE-FOUNDATION-STATE-AND-CI-RECOVERY-001`               |
| CURRENT_PRODUCT_STATUS | `WIP_OWNER_DISCOVERY_REMEDIATION_REQUIRED`                   |
| CURRENT_BRANCH         | `cursor/p4-1-activity-domain`                                |
| CURRENT_HEAD / PR_HEAD | `0a3cb75b574fda5dc12995cf6fc1888ea4c018a0`                 |
| PR                     | #19                                                          |
| CI_STATUS              | `BLOCKED_GITHUB_BILLING_SPENDING_LIMIT` (jobs never started) |
| LOCAL_VALIDATE         | `PASS` — `corepack pnpm validate` 2026-08-22               |
| PR_TITLE_STATUS        | pending update — `gh` not authed in agent shell              |
| REPOSITORY_VISIBILITY  | `PRIVATE_CONFIRMED`                                          |

## Checkpoint ledger

Historical markers remain immutable. Distinguish **Accepted** vs **WIP**.

| Marker                                    | SHA                                        | Class                                                           |
| ----------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| CI_SECURITY_CLOSURE_SHA                   | `f4577fb0e5860c34e269fa3183eef17d4d6106a7` | HISTORICAL / prior closure                                      |
| V2_HUB_CORE_CHECKPOINT_SHA                | `178a37e1bf3fb83d0ef080453c96da17aa14e5e5` | ACCEPTED_STAGE_CHECKPOINT (Hub)                                 |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA         | `ea3e7b97719726aceb5226907a90ad270ca9783e` | HISTORICAL_IMPLEMENTATION_MARKER (Stage 4 tip)                  |
| ACTIVITY_2_LFG_IMPLEMENTATION_WIP_SHA     | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | HISTORICAL_IMPLEMENTATION_MARKER — **not** Accepted Stage 5     |
| RESERVATIONS_FOUNDATION_WIP_SHA           | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | HISTORICAL_IMPLEMENTATION_MARKER — **not** Accepted Stage 6     |
| MARKETPLACE_FOUNDATION_WIP_SHA            | `24828b7ddee17212775e36be37d2d9edd24ca2d4` | HISTORICAL_IMPLEMENTATION_MARKER — **blocked by #28 discovery** |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA | `24828b7…` (invalid as final)              | **REVOKED** as review readiness                                 |
| CORE_STATE_AND_CI_RECOVERY_SHA            | `0a3cb75b574fda5dc12995cf6fc1888ea4c018a0` | this remediation                                                |

Former names `ACTIVITY_2_LFG_CHECKPOINT_SHA` / `RESERVATIONS_CHECKPOINT_SHA` /
`MARKETPLACE_CHECKPOINT_SHA` as Accepted Stage checkpoints are **withdrawn**.

## CRITICAL / HIGH

| ID                   | Severity            | Item                                                         |
| -------------------- | ------------------- | ------------------------------------------------------------ |
| CI-BILLING-001       | CRITICAL (CI green) | GitHub Actions billing / spending limit — Owner must restore |
| MARKETPLACE-DISC-001 | HIGH (scope)        | Issue #28 discovery gate — do not treat Stage 7 as done      |

## Last updated

2026-08-22 — Recovery: local `pnpm validate` green; notification-core coverage;
SoT/ledger corrections; CI still blocked by GitHub billing (Owner action).
