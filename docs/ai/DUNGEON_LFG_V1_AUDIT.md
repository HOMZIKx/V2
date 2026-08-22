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

| Field | Detail |
| ----- | ------ |
| Severity | **CRITICAL** |
| Cause | Gateway `joinLfg` body omitted required API field; controller Zod rejected all Discord joins |
| Path | Hub → Dołącz → activity-service `/lfg/join` |
| Fix | Resolve confirmed guild status via `getGuildConfig`; send `statusDefId`, roles, class spec to API |
| Test | `activity-interaction-handler.spec.ts` join case |
| SHA | audit fix commit |

### C-02 — Nie teraz (`suppress`) required `intentId` but search flow had none

| Field | Detail |
| ----- | ------ |
| Severity | **CRITICAL** |
| Cause | Suppress API required watch id; ephemeral search-without-watch could not suppress |
| Path | Match card → Nie teraz |
| Fix | Migration `018` + `lfg_actor_match_suppressions`; optional `intentId`; actor-level fingerprint suppress |
| Test | `lfg.use-cases.spec.ts` actor suppress case |
| SHA | audit fix commit |

### H-01 — Join allowed waitlist when LFG slot full

| Field | Detail |
| ----- | ------ |
| Severity | **HIGH** |
| Cause | `joinLfgActivity` assigned waitlist instead of failing closed |
| Path | Atomic join / stale DM |
| Fix | Fail with actionable `PRECONDITION_FAILED` when no open slot |
| Test | join unit path (role/capacity cases) |
| SHA | audit fix commit |

### H-02 — Join did not revalidate specific party role fill

| Field | Detail |
| ----- | ------ |
| Severity | **HIGH** |
| Cause | `rankLfgMatch` eligible but selected role already filled |
| Path | BUFF need filled between render and click |
| Fix | `assertPartyRoleStillOpen` after rank, before upsert |
| Test | `lfg.use-cases.spec.ts` join role filled |
| SHA | audit fix commit |

### H-03 — Intent scope not validated on join

| Field | Detail |
| ----- | ------ |
| Severity | **HIGH** |
| Cause | Missing guild/org match between intent and activity |
| Path | Cross-tenant join attempt with stolen intent id |
| Fix | Reject when intent guild/org mismatches activity |
| Test | covered by join preconditions |
| SHA | audit fix commit |

### H-04 — Duplicate participation not rejected on LFG join

| Field | Detail |
| ----- | ------ |
| Severity | **HIGH** |
| Cause | Upsert updated existing row silently (double-click) |
| Path | Same user double join |
| Fix | `CONFLICT` when active participation exists |
| Test | join unit path |
| SHA | audit fix commit |

### H-05 — Full-group reopen notify unwired

| Field | Detail |
| ----- | ------ |
| Severity | **HIGH** |
| Cause | `lfg_full_group_watches` persisted but never notified |
| Path | 8/8 → 7/8 lifecycle |
| Fix | `notifyFullGroupWatchesForActivity` in `triggerLfgMatchingForActivity` |
| Test | notify unit wiring (repository stubs) |
| SHA | audit fix commit |

### H-06 — Resume allowed expired / past-window intents

| Field | Detail |
| ----- | ------ |
| Severity | **HIGH** |
| Cause | SQL resume did not check `expires_at` / `window_end_at` |
| Path | Moje poszukiwania → Wznów |
| Fix | Pre-check in use-case + SQL guards |
| Test | resume preconditions |
| SHA | audit fix commit |

### M-01 — Search API leaked internal `score`

| Field | Detail |
| ----- | ------ |
| Severity | **MEDIUM** |
| Cause | Match DTO included ranking score |
| Fix | Strip score from public search response |
| Test | existing search tests |
| SHA | audit fix commit |

---

## Findings (open — non-blocking for ChatGPT audit)

### M-02 — Character ownership not verified S2S in activity-service

| Field | Detail |
| ----- | ------ |
| Severity | **MEDIUM** |
| Cause | `createLfgWatch` accepts any UUID `characterId` via direct API |
| Mitigation | UUID format validation; Discord/WWW clients source id from profile |
| Recommended | Identity S2S verify endpoint + activity port (follow-up) |

### M-03 — Full-group watch member UI/API surface minimal

| Field | Detail |
| ----- | ------ |
| Severity | **MEDIUM** |
| Cause | Backend notify exists; Discord/WWW create-watch UX not exposed |
| Recommended | Add button on full-match cards in follow-up polish |

### M-04 — Docker integration concurrency tests absent

| Field | Detail |
| ----- | ------ |
| Severity | **MEDIUM** |
| Scenarios | Last-slot race, overlapping intent concurrency, cross-guild negatives |
| Recommended | Expand `activity-repository.integration.spec.ts` |

### M-05 — Notify dedupe relies on fingerprint + dedupe memory (correct by design)

| Field | Detail |
| ----- | ------ |
| Severity | **MEDIUM** (observation) |
| Note | Meaningful-change re-notify verified via fingerprint path; burst coalesce partial unit coverage |

### L-01 — Team-space post-match UX still Owner decision required

### L-02 — Zeabur deploy billing blocker (external)

### L-03 — GitHub Actions billing blocker (external)

### L-04 — Performance: `listOpenActivitiesForLfg` scans up to 50 rows per search (acceptable v1)

---

## DoD checklist (§29)

| Scenario | Status |
| -------- | ------ |
| existing match first | PASS unit |
| no match → intent | PASS unit |
| duplicate overlapping intent | PASS unit |
| expired intent | PASS SQL/use-case guards |
| paused / resumed intent | PASS API + resume guards |
| private activity hidden | PASS unit |
| cross-guild / cross-org hidden | PASS authz + rank; integration OPEN |
| membership / permission lost | PASS authorize port; integration OPEN |
| character role mismatch | PASS rank + assertPartyRoleStillOpen |
| role need filled | PASS unit |
| slot reopened | PASS notifyFullGroupWatches |
| stale DM click | PASS join revalidation |
| concurrent last slot | PASS lockActivity serialize; integration OPEN |
| Nie teraz suppression | PASS actor + intent suppress |
| meaningful change re-notify | PASS fingerprint |
| mute discovery | PASS notification-core prior tests |
| transactional survives mute | PASS notification-core prior tests |
| several matches coalesced | PASS notify byUser coalesce |
| successful join closes intent | PASS fulfillLfgIntent on join |

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

| Marker | SHA |
| ------ | --- |
| `DUNGEON_LFG_V1_IMPLEMENTATION_SHA` | `976b89cf4740ef9b3948dd83a82e32659e4eeb07` |
| `DUNGEON_LFG_V1_AUDIT_SHA` | pending push |
