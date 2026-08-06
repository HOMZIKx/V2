# Cursor → ChatGPT

## 1. Status

`READY_FOR_FINAL_REAUDIT_AND_PHASE_CLOSE_P3`

Final P3 closure pass 3 on draft PR #16 after `BLOCKING_FINAL_P3_CLOSURE_PASS_3`.
**No merge. No P4. PR #17 frozen.**

## 2. Task ID

`P3-FINAL-CLOSURE-PASS-3`

## 3. Fix

Identical reconcile `eventKey` + snapshot after `unavailable`/`stale` performs
recovery (restore `fresh`, bump `availability_generation` once) under
`connected_guild FOR UPDATE`. Same key while already `fresh` remains an
idempotent duplicate.

## 4. Marker

`READY_FOR_FINAL_REAUDIT_AND_PHASE_CLOSE_P3`
