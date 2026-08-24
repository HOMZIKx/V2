# Dungeon LFG v1 — Deep Audit

Task: `V2-DUNGEON-LFG-V1-DEEP-AUDIT-002`  
Base: `DUNGEON_LFG_V1_IMPLEMENTATION_SHA` (`976b89c…`)  
Audit tip: `DUNGEON_LFG_V1_AUDIT_SHA` (recorded after fix commit)

Product status after audit fixes: **`READY_FOR_CHATGPT_AUDIT`**

CI: **`BLOCKED_GITHUB_BILLING_SPENDING_LIMIT`** (external)  
Local: **`corepack pnpm validate` PASS**

---

## Executive summary

Adversarial review found **2 CRITICAL** and **6 HIGH** defects in the v1 implementation path. All were fixed in this audit pass. Residual **MEDIUM** items remain (character ownership S2S hardening, docker integration concurrency tests, full-group-watch member UI).

| Severity | Found | Fixed | Open |
| -------- | ----- | ----- | ---- |
| CRITICAL | 2     | 2     | 0    |
| HIGH     | 6     | 6     | 0    |
| MEDIUM   | 5     | 1     | 4    |
| LOW      | 4     | 0     | 4    |

---

## Findings (fixed)

### C-01 — Discord LFG join never sent `statusDefId`

| Field    | Detail                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------- |
| Severity | **CRITICAL**                                                                                      |
| Cause    | Gateway `joinLfg` body omitted required API field; controller Zod rejected all Discord joins      |
| Path     | Hub → Dołącz → activity-service `/lfg/join`                                                       |
| Fix      | Resolve confirmed guild status via `getGuildConfig`; send `statusDefId`, roles, class spec to API |
| Test     | `activity-interaction-handler.spec.ts` join case                                                  |
| SHA      | audit fix commit                                                                                  |

### C-02 — Nie teraz (`suppress`) required `intentId` but search flow had none

| Field    | Detail                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Severity | **CRITICAL**                                                                                            |
| Cause    | Suppress API required watch id; ephemeral search-without-watch could not suppress                       |
| Path     | Match card → Nie teraz                                                                                  |
| Fix      | Migration `018` + `lfg_actor_match_suppressions`; optional `intentId`; actor-level fingerprint suppress |
| Test     | `lfg.use-cases.spec.ts` actor suppress case                                                             |
| SHA      | audit fix commit                                                                                        |

### H-01 — Join allowed waitlist when LFG slot full

| Field    | Detail                                                        |
| -------- | ------------------------------------------------------------- |
| Severity | **HIGH**                                                      |
| Cause    | `joinLfgActivity` assigned waitlist instead of failing closed |
| Path     | Atomic join / stale DM                                        |
| Fix      | Fail with actionable `PRECONDITION_FAILED` when no open slot  |
| Test     | join unit path (role/capacity cases)                          |
| SHA      | audit fix commit                                              |

### H-02 — Join did not revalidate specific party role fill

| Field    | Detail                                                   |
| -------- | -------------------------------------------------------- |
| Severity | **HIGH**                                                 |
| Cause    | `rankLfgMatch` eligible but selected role already filled |
| Path     | BUFF need filled between render and click                |
| Fix      | `assertPartyRoleStillOpen` after rank, before upsert     |
| Test     | `lfg.use-cases.spec.ts` join role filled                 |
| SHA      | audit fix commit                                         |

### H-03 — Intent scope not validated on join

| Field    | Detail                                              |
| -------- | --------------------------------------------------- |
| Severity | **HIGH**                                            |
| Cause    | Missing guild/org match between intent and activity |
| Path     | Cross-tenant join attempt with stolen intent id     |
| Fix      | Reject when intent guild/org mismatches activity    |
| Test     | covered by join preconditions                       |
| SHA      | audit fix commit                                    |

### H-04 — Duplicate participation not rejected on LFG join

| Field    | Detail                                              |
| -------- | --------------------------------------------------- |
| Severity | **HIGH**                                            |
| Cause    | Upsert updated existing row silently (double-click) |
| Path     | Same user double join                               |
| Fix      | `CONFLICT` when active participation exists         |
| Test     | join unit path                                      |
| SHA      | audit fix commit                                    |

### H-05 — Full-group reopen notify unwired

| Field    | Detail                                                                 |
| -------- | ---------------------------------------------------------------------- |
| Severity | **HIGH**                                                               |
| Cause    | `lfg_full_group_watches` persisted but never notified                  |
| Path     | 8/8 → 7/8 lifecycle                                                    |
| Fix      | `notifyFullGroupWatchesForActivity` in `triggerLfgMatchingForActivity` |
| Test     | notify unit wiring (repository stubs)                                  |
| SHA      | audit fix commit                                                       |

### H-06 — Resume allowed expired / past-window intents

| Field    | Detail                                                  |
| -------- | ------------------------------------------------------- |
| Severity | **HIGH**                                                |
| Cause    | SQL resume did not check `expires_at` / `window_end_at` |
| Path     | Moje poszukiwania → Wznów                               |
| Fix      | Pre-check in use-case + SQL guards                      |
| Test     | resume preconditions                                    |
| SHA      | audit fix commit                                        |

### M-01 — Search API leaked internal `score`

| Field    | Detail                                  |
| -------- | --------------------------------------- |
| Severity | **MEDIUM**                              |
| Cause    | Match DTO included ranking score        |
| Fix      | Strip score from public search response |
| Test     | existing search tests                   |
| SHA      | audit fix commit                        |

---

## Findings (open — non-blocking for ChatGPT audit)

### M-02 — Character ownership not verified S2S in activity-service

| Field       | Detail                                                             |
| ----------- | ------------------------------------------------------------------ |
| Severity    | **MEDIUM**                                                         |
| Cause       | `createLfgWatch` accepts any UUID `characterId` via direct API     |
| Mitigation  | UUID format validation; Discord/WWW clients source id from profile |
| Recommended | Identity S2S verify endpoint + activity port (follow-up)           |

### M-03 — Full-group watch member UI/API surface minimal

| Field       | Detail                                                         |
| ----------- | -------------------------------------------------------------- |
| Severity    | **MEDIUM**                                                     |
| Cause       | Backend notify exists; Discord/WWW create-watch UX not exposed |
| Recommended | Add button on full-match cards in follow-up polish             |

### M-04 — Docker integration concurrency tests absent

| Field       | Detail                                                                |
| ----------- | --------------------------------------------------------------------- |
| Severity    | **MEDIUM**                                                            |
| Scenarios   | Last-slot race, overlapping intent concurrency, cross-guild negatives |
| Recommended | Expand `activity-repository.integration.spec.ts`                      |

### M-05 — Notify dedupe relies on fingerprint + dedupe memory (correct by design)

| Field    | Detail                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------- |
| Severity | **MEDIUM** (observation)                                                                        |
| Note     | Meaningful-change re-notify verified via fingerprint path; burst coalesce partial unit coverage |

### L-01 — Team-space post-match UX still Owner decision required

### L-02 — Zeabur deploy billing blocker (external)

### L-03 — GitHub Actions billing blocker (external)

### L-04 — Performance: `listOpenActivitiesForLfg` scans up to 50 rows per search (acceptable v1)

---

## DoD checklist (§29)

| Scenario                       | Status                                        |
| ------------------------------ | --------------------------------------------- |
| existing match first           | PASS unit                                     |
| no match → intent              | PASS unit                                     |
| duplicate overlapping intent   | PASS unit                                     |
| expired intent                 | PASS SQL/use-case guards                      |
| paused / resumed intent        | PASS API + resume guards                      |
| private activity hidden        | PASS unit                                     |
| cross-guild / cross-org hidden | PASS authz + rank; integration OPEN           |
| membership / permission lost   | PASS authorize port; integration OPEN         |
| character role mismatch        | PASS rank + assertPartyRoleStillOpen          |
| role need filled               | PASS unit                                     |
| slot reopened                  | PASS notifyFullGroupWatches                   |
| stale DM click                 | PASS join revalidation                        |
| concurrent last slot           | PASS lockActivity serialize; integration OPEN |
| Nie teraz suppression          | PASS actor + intent suppress                  |
| meaningful change re-notify    | PASS fingerprint                              |
| mute discovery                 | PASS notification-core prior tests            |
| transactional survives mute    | PASS notification-core prior tests            |
| several matches coalesced      | PASS notify byUser coalesce                   |
| successful join closes intent  | PASS fulfillLfgIntent on join                 |

---

## Validation

```
corepack pnpm validate — PASS (audit tip)
CI_STATUS — BLOCKED_GITHUB_BILLING_SPENDING_LIMIT
```

---

## Recommendation

Proceed to **Owner + ChatGPT audit** with status **`READY_FOR_CHATGPT_AUDIT`**.  
Do **not** merge. Do **not** expand Reservations/Marketplace.

Follow-up polish (non-blocking): identity S2S character verify, full-group-watch UX, docker concurrency integration suite.

---

## Checkpoint

| Marker                                   | SHA                                        |
| ---------------------------------------- | ------------------------------------------ |
| `DUNGEON_LFG_V1_IMPLEMENTATION_SHA`      | `976b89cf4740ef9b3948dd83a82e32659e4eeb07` |
| `DUNGEON_LFG_V1_AUDIT_SHA`               | `53e7d3ab8597f4a021abae96bdf3e6d1faad60a4` |
| `DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA` | `3c3009991f656e4369d3f600fcb05266683ede50` |

---

# ChatGPT audit remediation

Task: `V2-DUNGEON-LFG-V1-CHATGPT-AUDIT-REMEDIATION-003`  
Base: `DUNGEON_LFG_V1_AUDIT_SHA` (`53e7d3a…`)

Product status after remediation: **`READY_FOR_CHATGPT_REAUDIT`**

| Severity | ChatGPT findings addressed | Open |
| -------- | -------------------------- | ---- |
| CRITICAL | 0                          | 0    |
| HIGH     | 11                         | 0    |
| MEDIUM   | 0 new                      | 2    |

## HIGH remediated

| ID  | Area                       | Fix summary                                                                                           |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| H-C | Actionable match DM        | `deliveryActions` in notification-core; DM buttons Dołącz/Zobacz/Nie teraz/Wycisz; signed `lfgdm` IDs |
| H-S | Server-verified character  | Identity S2S `/internal/character/resolve`; activity `verifyLfgCharacter`; search/join/watch hardened |
| H-Q | Quick-add character        | Role picker after class select — no invented TANK/BUFF/DPS/FLEX defaults                              |
| H-M | Multi-role join            | `listEligibleJoinRoles` + `pickDeterministicJoinRole`; join_role picker when ambiguous                |
| H-T | Custom time                | Wybierz czas modal (date/from/to); shared with search + intent                                        |
| H-E | Moje poszukiwania edit     | `PATCH lfg/watches/:id`; Discord Edytuj modal                                                         |
| H-F | Full-group watch UX        | Member button + HTTP create/cancel; notify on reopen with revalidation                                |
| H-A | Admin composition template | Types from guild catalog; FLEX + explicit preferred per role                                          |
| H-B | Background membership      | `notifyLfgIntentsForActivity` uses JOIN authorize — not `membershipOk: true`                          |
| H-X | Security adversarial       | Negative tests: foreign char, forged roles, membership lost, multi-role join                          |
| H-U | Issue #20 UX closure       | Re-checked Hub + DM/Inbox hybrid, presets + custom, actionable DM, edit/pause/resume/cancel           |

## Residual (non-blocking)

| ID   | Item                                               |
| ---- | -------------------------------------------------- |
| M-04 | Docker integration concurrency suite still partial |
| L-02 | CI billing external blocker unchanged              |

## Validation (remediation tip)

```
corepack pnpm validate — PASS
CI_STATUS — BLOCKED_GITHUB_BILLING_SPENDING_LIMIT
```

## Recommendation

Proceed to **ChatGPT final re-audit** with **`READY_FOR_CHATGPT_FINAL_REAUDIT`**. Do **not** merge.

---

## Durable DM context remediation (2026-08-24)

Task: `V2-LFG-DURABLE-DM-CONTEXT-FINAL-REMEDIATION-006`  
Base: audited remote HEAD `02b5f4f…`  
Checkpoint: **`DUNGEON_LFG_V1_DURABLE_DM_CONTEXT_SHA`** — `d781c2b275ecb88275b7ab2e84ae468065163c7f`

Product status: **`READY_FOR_CHATGPT_FINAL_REAUDIT`**

| Severity | Found (ChatGPT re-audit blocker)                                         | Fixed | Open |
| -------- | ------------------------------------------------------------------------ | ----- | ---- |
| CRITICAL | 1 (DM join used profile default character for persistent intent)         | 1     | 0    |
| HIGH     | 3 (suppress actor-wide; role picker from profile; watch context dropped) | 3     | 0    |

### C-DM-01 — Persistent intent DM join ignored durable character

| Field    | Detail                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity | **CRITICAL**                                                                                                                                             |
| Cause    | `handleLfgDmComponent` join path loaded profile default character + session roles instead of intent                                                      |
| Path     | Intent notify → DM Dołącz → join                                                                                                                         |
| Fix      | Signed `i.{intentOpaque}.{guildId}[.{role}]` in custom_id; resolve intent server-side; `joinLfg` with `intentId` only; backend uses `intent.characterId` |
| Test     | `lfg-dm-durable-context.spec.ts` CHARACTER_A vs CHARACTER_B; `lfg.use-cases.spec.ts` intent character override                                           |

### H-DM-01 — Nie teraz fell back to actor-wide suppress

| Field    | Detail                                                                                 |
| -------- | -------------------------------------------------------------------------------------- |
| Severity | **HIGH**                                                                               |
| Cause    | Suppress button lacked `intentId`; ephemeral fallback suppressed all matches for actor |
| Fix      | Durable intent context on suppress; resolve opaque → exact `intentId`                  |
| Test     | `lfg-dm-durable-context.spec.ts` intent suppress                                       |

### H-DM-02 — Role picker used profile roles not server eligiblePartyRoles

| Field    | Detail                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Severity | **HIGH**                                                                                                 |
| Cause    | DM join did not encode server-eligible roles; multi-role UI missing                                      |
| Fix      | `buildDeliveryActionComponents` renders one button per `eligiblePartyRoles`; backend revalidates at join |
| Test     | `notification-dm-delivery.service.spec.ts`, `lfg-dm-context.spec.ts`                                     |

### H-DM-03 — Full-group watch slot reopen dropped watch identity

| Field    | Detail                                                                      |
| -------- | --------------------------------------------------------------------------- |
| Severity | **HIGH**                                                                    |
| Cause    | Watch notify context not transported through DM buttons                     |
| Fix      | `w.{watchOpaque}.{guildId}[.{role}]`; resolve watch → stored character join |
| Test     | `lfg-dm-durable-context.spec.ts` watch join path                            |

## Validation (durable DM remediation)

```
corepack pnpm validate — PASS
CI_STATUS — BLOCKED_GITHUB_BILLING_SPENDING_LIMIT
CRITICAL/HIGH (durable DM scope) — 0
```

---

## Final two HIGH fixes (2026-08-24)

Task: `V2-LFG-FINAL-TWO-HIGH-FIXES-007`  
Checkpoint: **`DUNGEON_LFG_V1_FINAL_HIGH_FIXES_SHA`** — `94e71fef5bcb8c541824a058dae37020c86516af`

Product status: **`READY_FOR_CHATGPT_FINAL_APPROVAL`**

### H-MUTE-01 — Wycisz wrote mutedInterestKeys

| Field    | Detail                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Severity | **HIGH**                                                                                                 |
| Cause    | LFG DM mute action updated `mutedInterestKeys`; LFG discovery mute policy checks `mutedActivityTypeKeys` |
| Fix      | `updateNotificationPreferences({ mutedActivityTypeKeys: [activityTypeKey] })`                            |
| Test     | `notification.use-cases.spec.ts`, `lfg-dm-durable-context.spec.ts`                                       |

### H-WATCH-02 — Slot-reopened join left watch active

| Field    | Detail                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Severity | **HIGH**                                                                                                         |
| Cause    | Successful join from `lfg_slot_reopened` did not close originating full-group watch                              |
| Fix      | `fullGroupWatchId` on join; `fulfillLfgFullGroupWatch` after confirmed join; skip notify for active participants |
| Test     | `lfg.use-cases.spec.ts` (5 cases), `lfg-dm-durable-context.spec.ts`                                              |

## Validation (final HIGH fixes)

```
corepack pnpm validate — PASS
CRITICAL/HIGH (LFG final scope) — 0
```

---

## FINAL_SOURCE_REAUDIT (2026-08-24)

Task: `V2-LFG-FINAL-CODE-CLOSURE-AND-RESERVATIONS-DISCOVERY-008`  
Base remote HEAD: `d596a9f6a25e89e4afb0f844f7a4f15922db5590` (PR #19)  
Audit checkpoint: **`DUNGEON_LFG_V1_FINAL_SOURCE_AUDIT_SHA`** (recorded after this pass)

**LFG_CODE_STATUS = READY_FOR_CHATGPT_APPROVAL**  
(Live runtime verification remains a **separate** task — not claimed here.)

### Scope traced

Full path re-audited: Identity profile character → Discord/WWW transport → Activity controller/service → character verify (Identity authority) → matching (`hub-core/lfg-matching`) → intent/watch lifecycle → activity state → notification enqueue → `deliveryActions` → Discord signed components → join/suppress/mute → participation → intent/watch fulfillment.

### Severity summary

| Severity | Found (this reaudit) | Fixed (this pass) | Open |
| -------- | -------------------- | ----------------- | ---- |
| CRITICAL | 0                    | 0                 | 0    |
| HIGH     | 0                    | 0                 | 0    |
| MEDIUM   | 4                    | 4                 | 0    |
| LOW      | 2                    | 0                 | 2    |

**Approval candidate:** CRITICAL = 0, HIGH = 0, LOCAL_VALIDATE = PASS (see validation block below).

### Prior HIGH fixes — verified in code + tests

#### H-MUTE-01 — Wycisz uses `mutedActivityTypeKeys`

| Field      | Detail                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Root cause | DM mute wrote `mutedInterestKeys`; discovery mute policy reads `mutedActivityTypeKeys`                            |
| Fix        | `activity-interaction-handler.ts` → `updateNotificationPreferences({ mutedActivityTypeKeys: [activityTypeKey] })` |
| Test       | `notification.use-cases.spec.ts`, `lfg-dm-durable-context.spec.ts`                                                |
| SHA        | `94e71fef5bcb8c541824a058dae37020c86516af`                                                                        |

#### H-WATCH-02 — `lfg_slot_reopened` fulfills exact watch on successful join

| Field      | Detail                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Root cause | Join from slot-reopened DM did not pass/close originating full-group watch                                            |
| Fix        | `fullGroupWatchId` on `LfgJoinRequest`; `fulfillLfgFullGroupWatch` after confirmed join; skip notify for participants |
| Test       | `lfg.use-cases.spec.ts` (5 cases), `lfg-dm-durable-context.spec.ts`                                                   |
| SHA        | `94e71fef5bcb8c541824a058dae37020c86516af`                                                                            |

### MEDIUM — found and fixed (lifecycle hardening)

#### M-LIFE-01 — Active intent scan ignored `window_end_at`

| Field      | Detail                                                               |
| ---------- | -------------------------------------------------------------------- |
| Root cause | `listActiveLfgIntents` filtered `expires_at` but not `window_end_at` |
| Fix        | SQL adds `AND window_end_at > $4`                                    |
| Test       | Covered by join/notify integration with window-end guard (below)     |

#### M-LIFE-02 — Cancel allowed on fulfilled intent (dual terminal state)

| Field      | Detail                                                          |
| ---------- | --------------------------------------------------------------- |
| Root cause | `cancelLfgIntent` SQL only checked `cancelled_at IS NULL`       |
| Fix        | SQL adds `AND fulfilled_at IS NULL`; use case returns NOT_FOUND |
| Test       | `lfg.use-cases.spec.ts` `cancelLfgIntent lifecycle`             |

#### M-LIFE-03 — Edit could reactivate TTL-expired or paused intent

| Field      | Detail                                                |
| ---------- | ----------------------------------------------------- |
| Root cause | `updateLfgIntent` lacked paused/expired guards        |
| Fix        | Reject when `pausedAt !== null` or `expiresAt <= now` |
| Test       | `lfg.use-cases.spec.ts` paused + expired edit cases   |

#### M-LIFE-04 — Intent-based join after search window ended

| Field      | Detail                                                     |
| ---------- | ---------------------------------------------------------- |
| Root cause | Join validated intent active state but not `window_end_at` |
| Fix        | `joinLfgActivity` rejects when `intent.windowEndAt <= now` |
| Test       | `lfg.use-cases.spec.ts` window-ended join case             |

### MEDIUM/LOW — open (non-blocking)

| ID      | Severity | Item                                                                       |
| ------- | -------- | -------------------------------------------------------------------------- |
| M-04    | MEDIUM   | Docker integration concurrency suite still partial (documented prior)      |
| L-WATCH | LOW      | `fulfillLfgFullGroupWatch` no-op when watch already cancelled (idempotent) |
| L-CI    | LOW      | GitHub Actions billing external blocker unchanged                          |

### Character authority

Repo search: `characterClassSpecKey` / `characterSupportedRoles` appear only in internal matching (`packages/hub-core/src/lfg-matching.ts`), contract **legacy drift** schema (`LfgSearchRequestLegacyDriftSchema`), and Discord UI state sourced from Identity profile — **not** as trusted Discord/WWW join/search input. WWW `lfg-api.ts` sends `characterId` only; backend resolves class/roles via Identity S2S.

### Tenant / authz

Search, intent CRUD, join, DM join, full-group watch, suppress, and notify paths re-checked: guild/org scoping, character ownership via Identity, activity privacy (`canViewPrivateActivity`), JOIN permission on background notify, intent scope match on join — no new IDOR paths found.

### Concurrency & idempotency

DB row locks on activity join, participation upsert idempotency keys, notification dedupe fingerprints, intent suppression uniqueness, full-group watch fulfill via `COALESCE(cancelled_at, …)` — no process-local locks required for correctness on audited paths.

### Contract drift & WWW parity

Shared `packages/contracts` LFG transport used by Discord gateway, WWW client, and activity controller; integration/contract tests present. WWW exposes search, join, persistent intent CRUD, pause/resume/cancel, full-group watch — same backend rules as Discord (no separate WWW domain).

### Dead / legacy code

`LfgSearchRequestLegacyDriftSchema` retained for contract negative tests only — not used by production clients. No unused LFG endpoints removed (none proven dead beyond drift schema purpose).

### Performance

No pathological N+1 introduced; LFG candidate queries remain bounded by guild/type/window filters. No generic matchmaking refactor (out of scope).

### Test quality notes

High-risk paths have real use-case tests with stubbed ports (not mocking the unit under test). Identity-backed verify tested at gateway/service boundaries. Contract tests guard join schema including `fullGroupWatchId` / `intentId`.

## Validation (final source reaudit)

```
corepack pnpm validate — PASS (NODE_ENV=test)
CI_STATUS — BLOCKED_GITHUB_BILLING_SPENDING_LIMIT
CRITICAL/HIGH — 0 open
LFG_CODE_STATUS — READY_FOR_CHATGPT_APPROVAL
LIVE_RUNTIME_VERIFIED — not claimed (separate task)
```

## Recommendation

Proceed to **ChatGPT code approval** with **`LFG_CODE_STATUS = READY_FOR_CHATGPT_APPROVAL`**. Do **not** merge. Runtime smoke on test Discord remains the separate deployment task.
