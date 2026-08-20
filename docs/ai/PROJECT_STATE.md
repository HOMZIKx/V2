# PROJECT_STATE

## Status

`READY_FOR_CHATGPT_P4_0_VISUAL_DELTA_AUDIT` — task
`P4-0-VISUAL-EFFECTIVE-CHECKPOINT-005`

Not APPROVED. Not merged. No P4.5 production code.

## P4.0 checkpoints (immutable history)

| Marker                            | SHA                                        | Status                                                                                    |
| --------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **P4_0_FINAL_CHECKPOINT_SHA**     | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f` | **SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_DELTA** (kept; do not rewrite/delete)              |
| **P4_0_EFFECTIVE_CHECKPOINT_SHA** | `2fd4635c3b0aca118a3554e3439acc089558f3d9` | Technically valid visual+security tip (Hub composition + green CI + live discord-gateway) |
| HUB_VISUAL_COMPOSITION_CODE_SHA   | `72fee72bf800c051410c4bacfbfdd79bc34820e1` | Visual composition implementation                                                         |
| P4_5_PLAN_CHECKPOINT_SHA          | `8834559e38f5d55160eb5de8510420651b26b829` | Plan still valid; not invalidated by Hub visual delta                                     |

## Visual asset status (Owner external; non-blocking)

| Field                   | Value                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BANNER_STATUS**       | `OWNER_ASSET_REQUIRED` — missing `apps/discord-gateway/assets/v2-activity-banner.webp` (no fabricate; no `v2-lab-banner.png` for Hub)                                                                    |
| **ACTION_EMOJI_STATUS** | `OWNER_ASSET_UPLOAD_REQUIRED` — source icons present (`utworz`/`szukam`/`moje`/`powiadomienia`); custom emoji IDs via `DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON` not configured (text-only fallback safe) |

## Snapshot

| Field                  | Value                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CURRENT_BRANCH         | `cursor/p4-1-activity-domain`                                                                                         |
| PR                     | #19                                                                                                                   |
| BASE_SHA (origin/main) | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                                                                            |
| SOT_TIP_AT_RECORD      | `9a045cd7ad706b7fbae8140873613fb7494f331d`                                                                            |
| LOCAL_VALIDATE         | PASS (`pnpm validate` full)                                                                                           |
| AUDIT_HIGH             | PASS (`pnpm audit --audit-level=high`; only moderate remaining)                                                       |
| EFFECTIVE_CI_RUN_ID    | `32415392501` (exact SHA `2fd4635…`)                                                                                  |
| EFFECTIVE_CI_RESULT    | PASS (Quality Gates + Secret Scan + Infra Integration)                                                                |
| SOT_TIP_CI_RUN_ID      | `32418146963` (exact SHA `9a045cd…`)                                                                                  |
| **CI**                 | PASS on effective visual tip + SoT tip                                                                                |
| **ZEABUR**             | discord-gateway RUNNING `2fd4635…` (`v22` live/ready); 3× restart reconcile PASS; prior 7/7 at `22ba38b…` preserved   |
| HUB_CONTRACT           | PASS (1 Container `#D48632`, header icon, optional banner, 4 Secondary Section buttons, signed create/lfg/mine/inbox) |
| HUB_LIFECYCLE          | PASS (unit publish/edit + 3 reconcile; live 3× discord-gateway restart → ready)                                       |
| SECURITY_REGRESSION    | PASS (0 CRITICAL / 0 HIGH)                                                                                            |
| **CRITICAL**           | 0                                                                                                                     |
| **HIGH**               | 0                                                                                                                     |

## Hub composition (effective)

- Components V2; exactly one Container; accent `#D48632`
- Header Thumbnail: `centrum-aktywnosci-icon.webp`
- Optional MediaGallery: `v2-activity-banner.webp` when present
- Four compact Section + Secondary button accessories
- Action icons: custom emoji config or text-only fallback
- No large four-action Thumbnails; no LAB Hub visual; no duplicate Hub

## Zeabur deploy rationale

Targeted `discord-gateway` at effective visual tip `2fd4635…` is sufficient for this
visual delta. Production Discord tree is unchanged vs tip docs-only SoT commits
(`git diff 2fd4635..HEAD` = docs only). Full 7/7 same-SHA redeploy is **not**
required; prior P4.0 7/7 evidence at `22ba38b…` remains historical.

## Explicit gates

- **NO MERGE**
- **NO P4.5 production code**
- Do not rewrite or delete `P4_0_FINAL_CHECKPOINT_SHA`
- Owner artwork/upload does **not** force `CHANGES_REQUIRED`

## Last updated

2026-08-20 — P4-0-VISUAL-EFFECTIVE-CHECKPOINT-005
