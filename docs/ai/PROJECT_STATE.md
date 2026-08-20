# PROJECT_STATE

## Status

`READY_FOR_OWNER_VISUAL_CHECK` — task `P4-DISCORD-ACTIVITY-HUB-COMPACT-UX-002`

P4-0 closure (`P4-0-CLOSURE-CORRECTIVE-002`) remains **separately** blocked on
Issue #25 (repo visibility still reported PUBLIC on last probe). This UX task
does not resume P4.0 / P4.5.

Not APPROVED. Not merged. No P4.5 / P4.6 implementation.

## Latest completed task

`P4-DISCORD-ACTIVITY-HUB-COMPACT-UX-002` — compact public Hub layout only:

- one Components V2 Container, amber `#D48632`
- header Thumbnail only (`centrum-aktywnosci-icon.webp`)
- four Section + Secondary button accessories (create / lfg / mine / inbox)
- no ActionRows, no per-action thumbnails in the message
- action icons remain in repo, unused by the public hub renderer

## Immutable checkpoints

| Marker                    | SHA                                        | Notes                             |
| ------------------------- | ------------------------------------------ | --------------------------------- |
| FIXUP_START_SHA           | `1290df92681ee1e98fde3e0efaf231f7d110f6db` |                                   |
| FIXUP_CHECKPOINT_SHA      | `7f9e15e8020305db5e1b5bd3fb8f00532412a2c8` |                                   |
| HUB_ASSETS_SHA            | `63ed51e303c2b42e6e17e6ca9dce3ff903f6873d` |                                   |
| P4_0_AUDIT_CHECKPOINT_SHA | `0bdb254b4d6c0a84463a6331f2d830f642cbeeea` |                                   |
| P4_5_PLAN_CHECKPOINT_SHA  | `0bdb254b4d6c0a84463a6331f2d830f642cbeeea` | plan only                         |
| P4_0_CORRECTIVE_FIXUP_SHA | `59172be2f10fce4e891480dc25a61810fe4ee3f5` |                                   |
| HUB_COMPACT_UX_SHA        | _7947c1dae7c448b4a920bbe299d48ca8ad89fa65_                       | compact Hub layout                |

## Branch

- Branch: `cursor/p4-1-activity-domain`
- PR: #19

## Explicit gates

- **NO MERGE**
- Issues #20–#24 **NOT IMPLEMENTED**
- P4.5 / P4.6 **NOT STARTED**

## OPEN_CRITICAL / OPEN_HIGH

- OPEN_CRITICAL: **0**
- OPEN_HIGH: **0**

## OWNER_DECISIONS_REQUIRED

1. Visual check of live Discord Hub after redeploy of discord-gateway
2. Issue #25: set `HOMZIKx/V2` PRIVATE before resuming P4-0 closure push policy

## Last updated

2026-08-20 — P4-DISCORD-ACTIVITY-HUB-COMPACT-UX-002
