# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`READY_FOR_CHATGPT_FINAL_APPROVAL`**

Task: `V2-LFG-FINAL-TWO-HIGH-FIXES-007`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Final two HIGH fixes (ChatGPT PR #19 review)

Checkpoint: `DUNGEON_LFG_V1_FINAL_HIGH_FIXES_SHA` — _(recorded after push)_

### H-MUTE-01 — LFG dungeon mute used wrong preference field

| Issue                                                        | Fix                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| DM **Wycisz &lt;activityType&gt;** wrote `mutedInterestKeys` | Now writes `mutedActivityTypeKeys`                              |
| LFG discovery uses `activityTypeKey` in mute policy          | Discovery correctly suppressed after mute                       |
| TRANSACTIONAL unaffected                                     | `isDeliveryAllowedByPreference` bypasses mute for non-DISCOVERY |

**Tests:** `notification.use-cases.spec.ts` (Azrael discovery suppressed, transactional join allowed); `lfg-dm-durable-context.spec.ts` (handler sends `mutedActivityTypeKeys`).

### H-WATCH-01 — Full-group watch not fulfilled on slot-reopened join

| Issue                                              | Fix                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Join from `lfg_slot_reopened` DM left watch active | `fullGroupWatchId` on join contract + backend path                               |
| Profile/default character risk on watch join       | Gateway passes `fullGroupWatchId`; backend resolves stored character             |
| Post-join watch still notified                     | `fulfillLfgFullGroupWatch` idempotently closes exact watch after successful join |
| Already-participant spam                           | `notifyFullGroupWatchesForActivity` skips active participants                    |

**Tests:** `lfg.use-cases.spec.ts` — successful join closes watch; stale join does not; two watches closes only matched; cancelled watch rejected; participant skips reopen notify.

### Prior checkpoint

`DUNGEON_LFG_V1_DURABLE_DM_CONTEXT_SHA` — `d781c2b275ecb88275b7ab2e84ae468065163c7f`

## Validation

| Check          | Result                                    |
| -------------- | ----------------------------------------- |
| LOCAL_VALIDATE | **PASS** — `corepack pnpm validate`       |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace. Await ChatGPT **final approval**.
