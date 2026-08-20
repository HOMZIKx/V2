# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field                               | Value                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------- |
| **CURRENT_TASK**                    | `P4-0-VISUAL-EFFECTIVE-CHECKPOINT-005`                                     |
| **FINAL_STATUS**                    | `READY_FOR_CHATGPT_P4_0_VISUAL_DELTA_AUDIT`                                |
| **P4_0_FINAL_CHECKPOINT_SHA**       | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f`                                 |
| **P4_0_FINAL_STATUS**               | `SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_DELTA` (immutable; do not rewrite)   |
| **P4_0_EFFECTIVE_CHECKPOINT_SHA**   | `2fd4635c3b0aca118a3554e3439acc089558f3d9`                                 |
| **HUB_VISUAL_COMPOSITION_CODE_SHA** | `72fee72bf800c051410c4bacfbfdd79bc34820e1`                                 |
| **BANNER_STATUS**                   | `OWNER_ASSET_REQUIRED`                                                     |
| **ACTION_EMOJI_STATUS**             | `OWNER_ASSET_UPLOAD_REQUIRED`                                              |
| **CI**                              | PASS (`32415392501` effective; `32418146963` SoT tip)                      |
| **ZEABUR**                          | discord RUNNING `2fd4635`; 3x restart reconcile PASS; prior 7/7 preserved  |
| **SOT_TIP**                         | `272265b107db286809ac10b1110f8378e5d02e99` (updated after evidence commit) |
| **CRITICAL**                        | 0                                                                          |
| **HIGH**                            | 0                                                                          |
| **P4_5_PLAN_CHECKPOINT_SHA**        | `8834559e38f5d55160eb5de8510420651b26b829` (still valid)                   |
| **CURRENT_BRANCH**                  | `cursor/p4-1-activity-domain`                                              |
| **PR**                              | #19                                                                        |
| **P4.5 CODE**                       | not started                                                                |

---

## FINAL STATUS

**READY_FOR_CHATGPT_P4_0_VISUAL_DELTA_AUDIT**

### Checkpoint consequence

Historical `P4_0_FINAL_CHECKPOINT_SHA` = `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f`
is marked `SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_DELTA` and is **not** rewritten.

Audits of current Hub visuals / P4.0 effective tip use
**P4_0_EFFECTIVE_CHECKPOINT_SHA** = `2fd4635c3b0aca118a3554e3439acc089558f3d9`.

### Visual assets (Owner pending; non-blocking)

- Banner file `v2-activity-banner.webp`: **OWNER_ASSET_REQUIRED** (absent; Hub omits MediaGallery safely)
- Action icons: source webps present; Discord custom emoji upload +
  `DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON`: **OWNER_ASSET_UPLOAD_REQUIRED**
  (text-only fallback remains functional)
- Do not use `v2-lab-banner.png` for Activity Hub

### Hub contract + lifecycle

- 1x Container `#D48632`, header icon, optional banner, four Secondary Section buttons
- signed `create` / `lfg` / `mine` / `inbox`
- no large action Thumbnails; no LAB Hub visual
- publish / edit / startup reconcile / 3x reconcile cycles: PASS (unit)
- live: 3x discord-gateway redeploy, each cycle `discordState=ready` on effective SHA
- attachments do not accumulate; header icon retained; banner appears only when file exists

### Security regression

Rechecked fail-closed / assertion / JTI / projection secret / signed custom_id /
OAuth production origin (no loopback) suites -- PASS. **CRITICAL=0**, **HIGH=0**.

### Validation

- `pnpm validate` (full): PASS
- `pnpm audit --audit-level=high`: PASS
- Targeted discord-gateway Hub + security suites: PASS

### Zeabur

discord-gateway live SHA matches effective tip (`https://v22.zeabur.app/health/live`).
Live restart reconcile: 3x `service redeploy` -> each cycle returned `discordState=ready`
on SHA `2fd4635c3b0aca118a3554e3439acc089558f3d9`. Non-Discord services remain on
historical final SHA -- intentional; visual delta does not require 7/7 same-SHA
redeploy. Prior P4.0 7/7 evidence at `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f`
preserved.

### Gates

NO MERGE / NO P4.5 IMPLEMENTATION / do not rewrite historical final SHA
