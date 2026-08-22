# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REMEDIATION_REQUIRED`

Task: `V2-CORE-FOUNDATION-STATE-AND-CI-RECOVERY-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19  
HEAD: `0a3cb75b574fda5dc12995cf6fc1888ea4c018a0` (`CORE_STATE_AND_CI_RECOVERY_SHA`)

## Fresh facts

| Field                  | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| CURRENT_HEAD / PR_HEAD | `0a3cb75…` (`CORE_STATE_AND_CI_RECOVERY_SHA`)          |
| REPOSITORY_VISIBILITY  | **PRIVATE_CONFIRMED** (prior session `gh api`)         |
| CI_STATUS              | **RED** — billing: jobs not started (0 steps)          |
| LOCAL_VALIDATE         | **PASS** — `corepack pnpm validate` on 2026-08-22      |
| PR_TITLE_STATUS        | stale P4.1–P4.4 title; update pending (`gh` not authed) |
| CURRENT_PRODUCT_STATUS | `WIP_OWNER_DISCOVERY_REMEDIATION_REQUIRED`             |

## Local validation (recovery)

Command: `corepack pnpm validate`  
Result: **PASS** (format, lint, typecheck, test:coverage, architecture, build,
e2e admin+web, runtime-smoke, docker compose config).

Fixes in this remediation tip:

- `notification-core` policy/enqueue unit tests → 100% coverage thresholds
- lint fixes in `activity-admin.use-cases.spec.ts`, `discord-js-adapter.ts`
- SoT docs: revoke READY; Marketplace #28 discovery gate; checkpoint ledger WIP
- admin login origin (`VITE_ADMIN_PUBLIC_ORIGIN`) for production OAuth callback

CI remains **RED** until Owner restores GitHub Actions billing/spending limit
(`CI-BILLING-001`). Not a code assertion failure.

## Why READY was invalid

1. Required GitHub CI red (billing/spending limit — not a code assertion failure).
2. Stages 5–7 collapsed into one commit without Accepted DoD.
3. Marketplace #28 = **DO NOT IMPLEMENT** / Owner Discovery required; local scope
   lock wrongly said OWNER_ACCEPTED.
4. Functional gaps remain (LFG UX, Admin/WWW, role apply).

## Ledger (truthful)

| Marker                                    | SHA          | Class                             |
| ----------------------------------------- | ------------ | --------------------------------- |
| V2_HUB_CORE_CHECKPOINT_SHA                | `178a37e…`   | Accepted Stage 3                  |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA         | `ea3e7b9…`   | Historical Stage 4 implementation |
| ACTIVITY_2_LFG_IMPLEMENTATION_WIP_SHA     | `24828b7…`   | WIP not Accepted                  |
| RESERVATIONS_FOUNDATION_WIP_SHA           | `24828b7…`   | WIP not Accepted                  |
| MARKETPLACE_FOUNDATION_WIP_SHA            | `24828b7…`   | WIP + #28 gate                    |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA | n/a final    | **revoked**                       |
| CORE_STATE_AND_CI_RECOVERY_SHA            | `0a3cb75…`   | remediation                       |

## Owner actions required

1. Fix GitHub **Billing & plans / spending limit** so Actions can start.
2. Complete Issue **#28** Marketplace Owner Discovery before any Stage 7 product work.
3. Re-run CI on tip after billing restored.

## STOP

No READY claim. No merge. No Stage 8.
