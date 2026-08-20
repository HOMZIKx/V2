# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field                               | Value                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------- |
| **CURRENT_TASK**                    | `P4-0-VISUAL-DELTA-CHECKPOINT-CONSEQUENCE`                             |
| **FINAL_STATUS**                    | `READY_FOR_CHATGPT_P4_0_VISUAL_DELTA_AUDIT`                            |
| **P4_0_FINAL_CHECKPOINT_SHA**       | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f`                             |
| **P4_0_FINAL_STATUS**               | `SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_FIX` (immutable; do not rewrite) |
| **P4_0_EFFECTIVE_CHECKPOINT_SHA**   | `2fd4635c3b0aca118a3554e3439acc089558f3d9`                             |
| **HUB_VISUAL_COMPOSITION_CODE_SHA** | `72fee72bf800c051410c4bacfbfdd79bc34820e1`                             |
| **P4_5_PLAN_CHECKPOINT_SHA**        | `8834559e38f5d55160eb5de8510420651b26b829` (still valid)               |
| **CURRENT_BRANCH**                  | `cursor/p4-1-activity-domain`                                          |
| **PR**                              | #19                                                                    |
| **BASE_SHA**                        | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                             |
| **CI_RUN_ID**                       | `32415392501`                                                          |
| **CI_RESULT**                       | PASS                                                                   |
| **ZEABUR_DISCORD**                  | RUNNING at effective SHA (`v22` live/ready)                            |
| **HUB_REGRESSION**                  | PASS                                                                   |
| **OPEN_CRITICAL**                   | 0                                                                      |
| **OPEN_HIGH**                       | 0                                                                      |
| **P4.5 CODE**                       | not started                                                            |

---

## FINAL STATUS

**READY_FOR_CHATGPT_P4_0_VISUAL_DELTA_AUDIT**

### Checkpoint consequence

This intentionally changes Discord Hub presentation **after** historical
`P4_0_FINAL_CHECKPOINT_SHA` = `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f`. That marker is **not** rewritten; it is
marked `SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_FIX`.

Audits of current Hub visuals / P4.0 tip should use
**P4_0_EFFECTIVE_CHECKPOINT_SHA** = `2fd4635c3b0aca118a3554e3439acc089558f3d9`.

### What changed vs `22ba38b`

- Optional MediaGallery banner (`v2-activity-banner.webp`, soft-required)
- Action icons via custom emoji env registry (soft-required)
- Header thumbnail retained; four Section Secondary actions retained
- Contracts `create` / `lfg` / `mine` / `inbox` unchanged

### Validation (effective tip)

- Targeted Discord hub regression: PASS
- format / lint / typecheck (`discord-gateway`): PASS
- GitHub Actions CI `32415392501`: Quality Gates + Secret Scan + Infra Integration: PASS
- Zeabur `discord-gateway` live SHA matches effective tip; Discord state `ready`
- Hub publish/edit/reconcile: unit lifecycle PASS; live gateway already on effective tip (no extra production code since `2fd4635`)

### P4.5 plan

`docs/ai/P4_5_IMPLEMENTATION_PLAN.md` is **not** invalidated by this visual delta
(no architecture/product conflict found). No P4.5 production code.

### Gates

NO MERGE / NO P4.5 IMPLEMENTATION / do not rewrite historical final SHA
