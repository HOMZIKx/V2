# PROJECT_STATE

## Status

`READY_FOR_CHATGPT_P4_0_VISUAL_DELTA_AUDIT` — checkpoint consequence after
`P4-DISCORD-ACTIVITY-HUB-VISUAL-COMPOSITION-003`

Not APPROVED. Not merged. No P4.5 production code.

## P4.0 checkpoints (immutable history)

| Marker | SHA | Status |
| ------ | --- | ------ |
| **P4_0_FINAL_CHECKPOINT_SHA** | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f` | **SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_FIX** (kept; do not rewrite/delete) |
| **P4_0_EFFECTIVE_CHECKPOINT_SHA** | `2fd4635c3b0aca118a3554e3439acc089558f3d9` | Tip for ChatGPT **visual delta** audit (Hub composition + green CI + live discord-gateway) |
| HUB_VISUAL_COMPOSITION_CODE_SHA | `72fee72bf800c051410c4bacfbfdd79bc34820e1` | Visual composition implementation |
| P4_5_PLAN_CHECKPOINT_SHA | `8834559e38f5d55160eb5de8510420651b26b829` | Plan still valid; **not** invalidated by Hub visual fix |

## Why effective supersedes final (audit only)

Discord Hub presentation changed after `22ba38b` (optional banner MediaGallery +
emoji-scale action icons registry). Historical `P4_0_FINAL_CHECKPOINT_SHA`
remains in history for audit trail. New P4.0 visual/final-facing audits use
**P4_0_EFFECTIVE_CHECKPOINT_SHA**.

`docs/ai/P4_5_IMPLEMENTATION_PLAN.md` is unchanged and remains valid unless an
architecture/product conflict is found (none found).

## Snapshot

| Field | Value |
| ----- | ----- |
| CURRENT_BRANCH | `cursor/p4-1-activity-domain` |
| PR | #19 |
| BASE_SHA (origin/main) | `8c1b0959ae51d131e62ed587d81be1aae5012d37` |
| EFFECTIVE_CI_RUN_ID | `32415392501` |
| EFFECTIVE_CI_RESULT | PASS (Quality Gates, Secret Scan, Infra Integration) |
| ZEABUR_DISCORD_GATEWAY | RUNNING `2fd4635…` (`https://v22.zeabur.app/health/live`) |
| DISCORD_READY | PASS (`health/ready` → discordEnabled + ready) |
| HUB_REGRESSION | PASS (targeted discord-gateway hub suite) |
| FORMAT_LINT_TYPECHECK | PASS (`apps/discord-gateway`) |
| OPEN_CRITICAL | 0 |
| OPEN_HIGH | 0 |

## Hub composition (effective)

- 1× Container accent `#D48632`
- Header Thumbnail: `centrum-aktywnosci-icon.webp`
- Optional MediaGallery banner: `v2-activity-banner.webp` (`OWNER_ASSET_REQUIRED` if missing — no crash)
- 4× Section Secondary buttons: create / lfg / mine / inbox (contracts unchanged)
- Small icons via `DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON` (`OWNER_ASSET_UPLOAD_REQUIRED` until set)
- No `v2-lab-banner.png`; no four large action Thumbnails
- In-place publish / edit / reconcile path retained (unit lifecycle + live restart path)

## Explicit gates

- **NO MERGE**
- **NO P4.5 production code**
- Do not rewrite or delete `P4_0_FINAL_CHECKPOINT_SHA`

## Last updated

2026-08-20 — P4.0 visual delta checkpoint consequence
