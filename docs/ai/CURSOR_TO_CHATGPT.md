# Cursor → ChatGPT

## 1. Status

`READY_FOR_FINAL_REAUDIT_AND_PHASE_CLOSE_P3`

Final P3 closure pass 2 on draft PR #16 after `BLOCKING_FINAL_P3_CLOSURE_PASS_2`
(4 blockers). Issue #15 decisions P3-D1–P3-D20 unchanged.
**No merge by Cursor. No UI. No P4. PR #17 frozen.**

## 2. Task ID

`P3-FINAL-CLOSURE-PASS-2`

## 3. Branch / PR

- Branch: `cursor/p3-authorization-foundation`
- Start HEAD: `ef815dc91ddace863dbabaa8ec6b5239d7b1aa9f`
- PR: https://github.com/HOMZIKx/V2/pull/16 (draft)
- P4 / PR #17: **frozen** (local P4 commits not on this branch)

## 4. Closure remediations (4/4)

| # | Problem | Fix | Confirming test |
| - | ------- | --- | --------------- |
| 1 | Process-local lifecycle epochs reset on gateway restart | Authz DB generations + durable `processed_event` keys; Gateway no longer SoT | integration leave/rejoin/unavailable/detach across new repository instance |
| 2 | Revoke delivered/failed ignored lease owner | Conditional UPDATE on id+lease_owner+valid lease; boolean result; worker wires leaseSeconds/maxAttempts | integration worker A/B stale lease rejected |
| 3 | No-escalation only for allow | Same hold-check for deny; no manage.* skip; org scope still owner/org-manager | integration deny escalation + group with manage.org |
| 4 | login.www short-circuited before grants | Unified candidates: membership + grants; specificity + deny-wins; real sole-allow expiry → revoke | decision-engine + integration sole allow expiry |

## 5. Marker

`READY_FOR_FINAL_REAUDIT_AND_PHASE_CLOSE_P3`
