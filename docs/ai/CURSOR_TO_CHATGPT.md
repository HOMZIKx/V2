# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

Task: `V2-OWNER-DISCOVERY-GATE-COMPLIANCE-REMEDIATION-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19  
HEAD: `9a6ab229544776f68ced8be6de4d6f4add3d496c` (`OWNER_DISCOVERY_GOVERNANCE_REMEDIATION_SHA`)

## Fresh facts

| Field                  | Value                                          |
| ---------------------- | ---------------------------------------------- |
| CURRENT_HEAD / PR_HEAD | `9a6ab22…`                                     |
| CURRENT_PRODUCT_STATUS | `CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED` |
| REPOSITORY_VISIBILITY  | **PRIVATE_CONFIRMED**                          |
| CI_STATUS              | **RED** — billing: jobs not started (0 steps)  |
| LOCAL_VALIDATE         | **PASS** — `corepack pnpm validate` 2026-08-22 |
| PR_TITLE_STATUS        | WIP conventional title on PR #19               |

## Governance remediation delivered

1. Created **`docs/ai/OWNER_DISCOVERY_GAPS.md`** — module gap matrix (Hub, Profile,
   Interests, Notifications, Activity, LFG, Reservations, Marketplace).
2. Audited scope locks — Marketplace #28 authoritative; Reservations discovery required;
   LFG governance matrix; Notifications split principles vs open product details.
3. **No feature deletion** — prototype code remains `FOUNDATION_WIP`.
4. **No new product behavior** — documentation + classification only.
5. Profile/Interests: `ROLE_PROJECTION_POLICY` implemented; `ROLE_PROJECTION_DISCORD_MUTATION` pending.

## Fundamental rule (Owner)

Every new product function: IDEA → Owner+ChatGPT Discovery → Options → Owner Decisions →
Accepted SoT → implementation prompt. Continuous execution does **not** override.

## Module status (truthful)

| Module        | Status                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| Hub Core      | Accepted (#22) + flagged implementation assumptions                             |
| Notifications | Principles Accepted (#24); catalog/timings **OWNER_DECISION_REQUIRED**          |
| LFG           | Foundation WIP; #20 direction partial                                           |
| Reservations  | **RESERVATIONS_OWNER_DISCOVERY_REQUIRED**                                       |
| Marketplace   | **OWNER_DISCOVERY_REQUIRED** (#28); **NOT_ACCEPTED_FOR_PRODUCT_IMPLEMENTATION** |

## Ledger

| Marker                                     | SHA          | Class                               |
| ------------------------------------------ | ------------ | ----------------------------------- |
| V2_HUB_CORE_CHECKPOINT_SHA                 | `178a37e…`   | Accepted Stage 3                    |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA          | `ea3e7b9…`   | Implementation marker; catalog open |
| ACTIVITY_2_LFG_IMPLEMENTATION_WIP_SHA      | `24828b7…`   | Foundation WIP                      |
| RESERVATIONS_FOUNDATION_WIP_SHA            | `24828b7…`   | Foundation WIP + discovery required |
| MARKETPLACE_FOUNDATION_WIP_SHA             | `24828b7…`   | Prototype + #28 gate                |
| CORE_STATE_AND_CI_RECOVERY_SHA             | `cf15925…`   | Prior remediation                   |
| OWNER_DISCOVERY_GOVERNANCE_REMEDIATION_SHA | `9a6ab22…`   | Governance remediation              |

## Owner actions required

1. GitHub **Billing** — restore Actions (`CI-BILLING-001`).
2. Issue **#28** — complete Marketplace Owner Discovery before any Stage 7 product work.
3. **Reservations** — run Owner Discovery (no pack in SoT today).
4. **LFG / Notifications catalog** — close gaps in `OWNER_DISCOVERY_GAPS.md`.
5. **Interest→role apply** — decide Discord mutation policy before wiring apply loop.

## STOP

No READY. No merge. No Stage 8. **No Stage 6/7 product expansion.**

Safe work only: tests, security, CI, bug fixes, isolation docs, diagnostics.
