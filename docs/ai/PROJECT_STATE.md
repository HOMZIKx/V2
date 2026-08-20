# PROJECT_STATE

## Status

`READY_FOR_OWNER_VISUAL_CHECK` — task `P4-DISCORD-ACTIVITY-HUB-VISUAL-COMPOSITION-003`

P4.0 technical checkpoint and P4.5 plan remain on branch (unchanged product scope).
No P4.5 production implementation from this task.

## Hub visual composition (this task)

- 1× Container, accent `#D48632`
- Header Thumbnail: `centrum-aktywnosci-icon.webp`
- Optional MediaGallery banner: `v2-activity-banner.webp` (**OWNER_ASSET_REQUIRED** if missing)
- 4× Section + Secondary buttons (`create` / `lfg` / `mine` / `inbox`)
- Small action icons via `DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON` (**OWNER_ASSET_UPLOAD_REQUIRED** until configured)
- No `v2-lab-banner`, no 4 large action Thumbnails

## Snapshot

| Field                      | Value                                      |
| -------------------------- | ------------------------------------------ |
| CURRENT_BRANCH             | `cursor/p4-1-activity-domain`              |
| PR                         | #19                                        |
| P4_0_FINAL_CHECKPOINT_SHA  | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f` |
| P4_5_PLAN_CHECKPOINT_SHA   | `8834559e38f5d55160eb5de8510420651b26b829` |
| HUB_VISUAL_COMPOSITION_SHA | _(set after commit)_                       |
| OPEN_CRITICAL              | 0                                          |
| OPEN_HIGH                  | 0                                          |

## Owner follow-ups (assets)

1. Add `apps/discord-gateway/assets/v2-activity-banner.webp` (~4:1–5:1 amber→graphite→warm green)
2. Upload four small custom emojis from existing icon webps; set `DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON`

## Explicit gates

- **NO MERGE**
- **NO P4.5 production code**
- No further Hub redesign until Owner visual check

## Last updated

2026-08-20 — P4-DISCORD-ACTIVITY-HUB-VISUAL-COMPOSITION-003
