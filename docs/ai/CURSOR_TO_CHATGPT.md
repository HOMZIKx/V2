# CURSOR → ChatGPT

## Status

**MODE:** `V2-005-006-INTEGRATION-RECOVERY-AND-CURRENT-HEAD-CLOSURE` — remediation in progress
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Branch: `cursor/p4-1-activity-domain` · PR **#19** — do not merge

## Process truth

| Task                            | Status                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **005 Admin Control Center UX** | `TASK_005_CODE_IMPLEMENTED_BUT_NOT_ACCEPTED` — `CODE_CHECKPOINT_READY_FOR_OWNER_REVIEW` after remediation commit |
| **006 Player Toolkit Core**     | `TASK_006_CODE_IMPLEMENTED_PREMATURELY_AND_NOT_ACCEPTED` — architecture boundary documented                      |

Mixed implementation landed in `2af092f` before 005 Owner review. History **not** rewritten.

## Delta classification (`81e5d49` → `4237d15` + remediation)

| Class                        | Scope                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **A — TASK_005_ADMIN**       | `apps/admin/**` (IA, events, Centrum V2, diagnostics, E2E)                           |
| **B — TASK_006_PLAYER_CORE** | identity migration 003, game accounts, WWW profil/postacie, Discord profile          |
| **C — SHARED**               | `packages/hub-core` class labels, `activity-service` app.module DI, `pnpm-lock.yaml` |
| **D — UNRELATED**            | discord-gateway debug scripts (`inspect-hub-*`, `scan-hub-now`) — operational only   |

## Remediation (this pass)

- CI infra: `migration-inventory.test.ts` expects identity **3** migrations (003).
- Admin copy: removed env var names / engineering banners from owner-facing UI.
- Events: Polish status labels + filter select; improved create copy.
- Architecture: `docs/ai/PLAYER_TOOLKIT_ARCHITECTURE_BOUNDARY.md` — Identity keeps small ownership foundation; gameplay state blocked.
- Bot nav: **no** Discord Bot → Profil (no meaningful Owner config); LFG stays under Aktywności.

## Checkpoints (immutable)

| Marker                                       | SHA                                             | Note                       |
| -------------------------------------------- | ----------------------------------------------- | -------------------------- |
| `PLAYER_TOOLKIT_CORE_V1_SHA`                 | `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2`      | historical — not rewritten |
| `ADMIN_CONTROL_CENTER_UX_V1_SHA`             | prior `0834a5b` — updated by remediation commit | see HEAD after push        |
| `PLAYER_TOOLKIT_INTEGRATION_REMEDIATION_SHA` | pending remediation commit                      | additive                   |

## Task 004

- `ADMIN_OAUTH` = **OWNER_PASS** (prior successful Owner test)
- `DM_LIVE_SMOKE` = **OWNER_ACCEPTANCE_PENDING** (needs second real participant)

## STOP

No task 007. No Trackers/Biolog/Elixirs/EQ/Marketplace/Guild Control.
