# Post-Overbuild Technical Audit

Task: `V2-POST-OVERBUILD-TECHNICAL-AUDIT-001`  
Audit range: `DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA` (`90fc384…`) → `POST_OVERBUILD_TECHNICAL_AUDIT_SHA`  
Product status remains: **`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`** (not READY).

Governance reference: `docs/ai/OWNER_DISCOVERY_GAPS.md`.

---

## Summary

Deep audit of Hub/Profile/Interests/Notifications/LFG/Reservations/Marketplace foundations
after rapid Core Foundation implementation. **CRITICAL/HIGH correctness and security defects
were fixed** without expanding product scope or claiming Accepted features.

| Severity | Found | Fixed this audit | Documented / deferred |
| -------- | ----- | ---------------- | --------------------- |
| CRITICAL | 3     | 3                | 0                     |
| HIGH     | 9     | 7                | 2                     |
| MEDIUM   | 12+   | 2                | 10+                   |
| LOW      | 8+    | 0                | 8+                    |

Local validation: `corepack pnpm validate` on audit tip (see checkpoint SHA).

---

## CRITICAL (fixed)

### C-01 — LFG search leaked private activities

|                      |                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Module**           | LFG / Activity                                                                                                                  |
| **Finding**          | `listOpenActivitiesForLfg` returned private activities; search skipped `canViewPrivateActivity` and guild READ authz.           |
| **Fix**              | `requirePermission(READ)` on LFG endpoints; filter with `canViewPrivateActivity`; tighten SQL (org + exact type key, no ILIKE). |
| **Tests**            | activity-service unit suite (existing); integration negative tests **open**                                                     |
| **Owner dependency** | None (security invariant)                                                                                                       |

### C-02 — Reservation double-booking race

|                      |                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Module**           | Reservations WIP                                                                                                         |
| **Finding**          | Check-then-insert under READ COMMITTED allowed concurrent overlaps.                                                      |
| **Fix**              | Migration `016_reservations_no_overlap.sql` — GiST exclusion constraint on spot + time range; map `23P01` to `CONFLICT`. |
| **Tests**            | Domain overlap tests exist; **concurrency integration test open**                                                        |
| **Owner dependency** | Lifecycle/status semantics still Owner Discovery                                                                         |

### C-03 — Notification DM outbox marked delivered on HTTP 200 failures

|                      |                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Module**           | Notifications                                                                                              |
| **Finding**          | Gateway returns 200 with `{ status: 'rate_limited' \| 'upstream_error' }`; outbox completed without retry. |
| **Fix**              | `ActivityOutboxDispatcher` parses notification deliver body; retries/fails appropriately.                  |
| **Tests**            | `outbox-dispatcher.spec.ts` — rate_limited retry case                                                      |
| **Owner dependency** | None                                                                                                       |

---

## HIGH (fixed)

### H-01 — LFG endpoints missing guild-scoped authorization

**Fix:** `requirePermission` on search/watch/cancel/list/reservations/marketplace/prefs wrappers.

### H-02 — LFG dedupe collision blocked meaningful updates

**Fix:** `refreshNotificationInboxItem` on fingerprint change; DM outbox when fingerprint changes; LFG notify records match on processed inbox.

**Tests:** `notification.use-cases.spec.ts` — fingerprint change case.

### H-03 — Reservation client-supplied tenant scope

**Fix:** `getReservationSpotScope` validates spot→resource→guild/org/enabled; server derives tenant from DB.

### H-04 — Marketplace watch notification fan-out unbounded

**Fix:** Cap `MAX_MARKETPLACE_MATCH_NOTIFICATIONS = 50` per offer create.

### H-05 — LFG cancel silent success on foreign/missing id

**Fix:** `cancelLfgIntent` returns boolean; throws `NOT_FOUND` when zero rows.

### H-06 — LFG invalid window / party role validation

**Fix:** Controller enum validation for party roles; window ordering refine; use-case asserts.

### H-07 — LFG org filter on intent notify query

**Fix:** `listActiveLfgIntents` filters `organization_id`; passes `activityTypeKey` for discovery mute.

---

## HIGH (documented — not product-expanded)

### H-08 — `countParticipationsByPartyRole` stub → false-positive role matches

|                      |                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- |
| **Status**           | **OPEN (technical debt)**                                                              |
| **Safe interim**     | Matching engine runs but role-need scores may be wrong until RSVP carries party roles. |
| **Owner dependency** | LFG UX/RSVP role assignment discovery                                                  |

### H-09 — `notifyLfgIntentsForActivity` unwired + incomplete match gate

|                             |                                                                    |
| --------------------------- | ------------------------------------------------------------------ |
| **Status**                  | **OPEN (latent)** — function has zero call sites today.            |
| **Required before wire-up** | Full `rankLfgMatch` per intent, private visibility, atomic dedupe. |
| **Owner dependency**        | LFG notify UX/copy                                                 |

---

## MEDIUM (selected)

| ID   | Module        | Finding                                                    | Action                                                                     |
| ---- | ------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| M-01 | Notifications | Activity-type mute bypass when only `interestKey` set      | Partial fix on LFG (`activityTypeKey` added); full producer audit **open** |
| M-02 | Notifications | Dual enqueue paths (inbox-only vs full pipeline)           | Documented; unify **deferred** (no product decision)                       |
| M-03 | Notifications | DM payload trusts outbox recipient without inbox reconcile | Documented; gateway inbox lookup **deferred**                              |
| M-04 | LFG           | Duplicate active watches allowed                           | Documented; unique partial index **deferred** (Owner TTL policy)           |
| M-05 | Marketplace   | Numeric bounds / org dimension on watches                  | Documented (#28 discovery)                                                 |
| M-06 | Reservations  | No `enabled` resource/spot enforcement beyond scope check  | Fixed enabled check in scope validation                                    |
| M-07 | Profile       | Role projection Discord APPLY not wired                    | **Correctly not claimed complete** — safety compute only                   |
| M-08 | Hub           | Implementation assumptions in Hub copy                     | Governed in `OWNER_DISCOVERY_GAPS.md`                                      |

---

## LOW (selected — documented)

- LFG ILIKE name fallback removed (was M-level data leak risk).
- Preference endpoints lack guild membership proof beyond READ permission (acceptable with authz port).
- Party role DB column lacks CHECK constraint (invalid values filtered at API).
- `notifyLfgIntentsForActivity` dead code until Activity publish hooks LFG.

---

## Database audit (migrations 011–016)

| Migration                     | Notes                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `011_hub_core_foundation`     | Registry/settings foundations — OK for Accepted Hub shell                                |
| `012_notifications_core`      | Class CHECK, dedupe/prefs/delivery tables — OK; dedupe memory PK lacks kind/guild (M-03) |
| `013_lfg_matching`            | Intents + role requirements — no unique active intent index (M-04)                       |
| `014_reservations_core`       | Resource/spot/reservation — FK OK; tenant not enforced at DB (fixed in app + 016)        |
| `015_marketplace_core`        | Prototype schema — no Owner Accepted semantics                                           |
| `016_reservations_no_overlap` | **Added** — exclusion constraint for active overlaps                                     |

Identity interest-role projection: safety validation in domain; **no Discord mutation** (by design, pending Owner).

---

## Hub / auto-sync regression check

- Activity projection outbox + Discord deliver path **unchanged** for accepted Centrum flows.
- Notification deliver added parallel HTTP path with corrected retry semantics.
- No new Hub modules or public personalized dumps introduced.

Manual/live regression: **recommended** after billing restores CI (Discord outage/restart scenarios).

---

## Code quality scan (TODO/FIXME/HACK)

No material `as any` or silent empty catches found in audited modules. WIP modules carry
governance comments pointing to `OWNER_DISCOVERY_GAPS.md`. `countParticipationsByPartyRole`
stub explicitly documents incomplete role fill data.

---

## Validation

| Check           | Result (audit tip)                     |
| --------------- | -------------------------------------- |
| format          | PASS (after prettier on changed files) |
| lint            | PASS                                   |
| typecheck       | PASS                                   |
| unit + coverage | PASS                                   |
| architecture    | PASS                                   |
| e2e             | PASS                                   |
| runtime smoke   | PASS                                   |
| `pnpm validate` | PASS                                   |

---

## Checkpoint ledger

| Marker                                     | SHA                     |
| ------------------------------------------ | ----------------------- |
| `DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA` | `90fc384…` (historical) |
| `POST_OVERBUILD_TECHNICAL_AUDIT_SHA`       | `25552dc75a5551f7185d77a8c02bbca5999bee89` |

---

## Explicit non-goals (Owner Discovery still required)

- Marketplace #28 product UX/schema/catalog
- Reservations lifecycle/UX
- Full LFG Discord wizard / team-space
- Notification catalog/timing/digest/quiet hours
- Interest→role Discord mutation apply loop
- Treating any WIP module as Accepted Stage checkpoint

**STOP:** No new product implementation until Owner Accepted SoT per module.
