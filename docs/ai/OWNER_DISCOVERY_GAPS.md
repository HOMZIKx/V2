# Owner Discovery Gap Matrix

Task: `V2-OWNER-DISCOVERY-GATE-COMPLIANCE-REMEDIATION-001`  
Governance rule: **IDEA → Owner+ChatGPT Discovery → Options → Owner Decisions → Accepted SoT → Implementation prompt.**  
Continuous execution does **not** override this rule.

Status vocabulary:

| Status                                            | Meaning                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `ACCEPTED`                                        | Explicit Owner decision recorded in Issue / scope lock / ADR     |
| `OWNER_DECISION_REQUIRED`                         | Product behavior not yet Owner-Accepted — Cursor must not invent |
| `TECHNICAL_ONLY`                                  | Engineering foundation with no final UX/product semantics        |
| `IMPLEMENTATION_ASSUMPTION_REQUIRES_OWNER_REVIEW` | Code/docs imply product behavior not yet Accepted                |
| `FOUNDATION_WIP`                                  | Prototype code/migrations exist; not released product            |

Legend: **SAFE TO KEEP?** = retain as reusable prototype without treating as final product.  
**MUST NOT EXPAND?** = no further product behavior until Owner Discovery closes.

---

## Hub

| DECISION                                                | CURRENT IMPLEMENTATION                                          | STATUS                                              | OWNER DECISION NEEDED                                       | SAFE TO KEEP?   | MUST NOT EXPAND?                       |
| ------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- | --------------- | -------------------------------------- |
| One `#v2-centrum` Hub message, edit-in-place, reconcile | Hub panel publish/reconcile in discord-gateway + activity admin | **ACCEPTED** (#22 / Hub scope lock)                 | —                                                           | YES             | NO (within Accepted shell)             |
| IA map GRA/RYNEK/GILDIA/TY + module registry            | `@v2/hub-core` `DEFAULT_HUB_MODULES`                            | **ACCEPTED**                                        | —                                                           | YES             | NO (registry only)                     |
| Reservations/Marketplace as roadmap stubs in Hub        | `availability: 'roadmap'` + roadmap ephemeral                   | **ACCEPTED** (stub only)                            | Final module UX when modules ship                           | YES             | YES (no fake “available”)              |
| Activities Hub copy: matching-first LFG order           | `hub-module-ephemeral.ts` + `lfg-hub-ephemeral.ts`              | **IMPLEMENTED** (#20 v1)                            | Team-space / polish only                                  | YES             | YES (team-space only)                  |
| “Dla mnie” example reasons incl. LFG                    | `renderHubForMeFoundationEphemeral`                             | **IMPLEMENTATION_ASSUMPTION_REQUIRES_OWNER_REVIEW** | Which reasons appear, ranking, empty-state policy           | YES             | YES                                    |
| Profile foundation ephemeral field list                 | `renderHubProfileFoundationEphemeral`                           | **ACCEPTED** (foundation scope)                     | Full edit flows, validation rules, multi-char UX            | YES             | YES (beyond foundation)                |
| Deep links `v2://…` contract                            | notification + activity deep links in code                      | **ACCEPTED** (principle)                            | Per-module URL taxonomy for unreleased modules              | YES             | YES for Marketplace/Reservations paths |

---

## Profile

| DECISION                                           | CURRENT IMPLEMENTATION                               | STATUS                        | OWNER DECISION NEEDED                      | SAFE TO KEEP? | MUST NOT EXPAND?    |
| -------------------------------------------------- | ---------------------------------------------------- | ----------------------------- | ------------------------------------------ | ------------- | ------------------- |
| V2 identity + characters + active character        | identity-service profile domain (ADR-0009 extension) | **ACCEPTED** (Hub foundation) | Character limits, delete/merge, visibility | YES           | YES (product rules) |
| Class/spec catalog separate from party role        | `@v2/hub-core` catalogs                              | **ACCEPTED**                  | Catalog contents per game/org              | YES           | NO (catalog data)   |
| Party roles TANK/BUFF/DPS/FLEX separate from class | party-role catalog + LFG domain                      | **ACCEPTED** (#20 direction)  | Role labels, FLEX semantics in UI          | YES           | YES (UX polish)     |
| WWW `/profil` edit surface                         | web app routes (partial)                             | **OWNER_DECISION_REQUIRED**   | Full profile UX, mobile layout, error copy | YES           | YES                 |
| Admin profile diagnostics                          | minimal / none                                       | **OWNER_DECISION_REQUIRED**   | Admin views for profile support            | N/A           | YES                 |

---

## Interests

| DECISION                                          | CURRENT IMPLEMENTATION                                            | STATUS                      | OWNER DECISION NEEDED                          | SAFE TO KEEP? | MUST NOT EXPAND?          |
| ------------------------------------------------- | ----------------------------------------------------------------- | --------------------------- | ---------------------------------------------- | ------------- | ------------------------- |
| interest ≠ Discord role ≠ notification preference | docs + notification policy + Hub copy                             | **ACCEPTED** (#27)          | —                                              | YES           | NO                        |
| Interest catalog + user selections SoT            | identity-service (Issue #27 direction)                            | **ACCEPTED** (principles)   | Catalog keys, org scoping, admin CRUD UX       | YES           | YES (admin UX)            |
| Role projection **safety** validation             | `interest-role-projection.ts` `validateInterestRoleMappingSafety` | **ACCEPTED** (safety rules) | —                                              | YES           | NO                        |
| Role projection **desired-state compute**         | `computeInterestRoleProjection`                                   | **TECHNICAL_ONLY**          | When/how often to reconcile                    | YES           | YES                       |
| Role projection **Discord APPLY/mutation**        | **not wired** — compute only, no gateway apply loop               | **OWNER_DECISION_REQUIRED** | Apply timing, failure UX, partial apply, audit | YES (compute) | **YES** (no silent apply) |
| Admin interest→role mapping UI                    | partial / TBD                                                     | **OWNER_DECISION_REQUIRED** | Mapping editor, preview, dry-run               | YES           | YES                       |

**True status:** `ROLE_PROJECTION_POLICY = implemented foundation` · `ROLE_PROJECTION_DISCORD_MUTATION = pending`

---

## Notifications

| DECISION                                               | CURRENT IMPLEMENTATION                           | STATUS                        | OWNER DECISION NEEDED                  | SAFE TO KEEP? | MUST NOT EXPAND?       |
| ------------------------------------------------------ | ------------------------------------------------ | ----------------------------- | -------------------------------------- | ------------- | ---------------------- |
| Classes DISCOVERY / TRANSACTIONAL / SYSTEM_SECURITY    | `@v2/notification-core`, migration 012           | **ACCEPTED** (#24 / ADR-0016) | —                                      | YES           | NO (invariants)        |
| Discovery mute never suppresses transactional/security | `isDeliveryAllowedByPreference`                  | **ACCEPTED**                  | —                                      | YES           | NO                     |
| DM-first + Inbox fallback                              | outbox → discord-gateway DM + inbox rows         | **ACCEPTED** (principle)      | —                                      | YES           | NO (delivery path)     |
| Preferences + per-interest/activity mute keys          | `notification_preferences` table + API           | **ACCEPTED** (model)          | UI for prefs on Discord/WWW            | YES           | YES (UX)               |
| Dedupe + meaningful-change fingerprint                 | dedupe memory + `shouldSuppressAsUnchanged`      | **ACCEPTED** (mechanism)      | Coalescing **window duration**         | YES           | YES (timing constants) |
| Deep links by durable object id                        | `deep_link` column + enqueue schema              | **ACCEPTED** (principle)      | Full catalog of link targets           | YES           | YES                    |
| Notification **catalog** (kinds, titles, copy)         | ad hoc kinds in Activity/LFG/Marketplace enqueue | **OWNER_DECISION_REQUIRED**   | Per-event copy, localization, severity | YES           | **YES**                |
| Digest / batching behavior                             | not implemented                                  | **OWNER_DECISION_REQUIRED**   | Digest rules, batch windows            | N/A           | YES                    |
| Quiet hours / priority thresholds                      | not implemented                                  | **OWNER_DECISION_REQUIRED**   | Policy per class                       | N/A           | YES                    |
| Retention / archive / delete                           | inbox persistence only                           | **OWNER_DECISION_REQUIRED**   | TTL, GDPR, export                      | YES (store)   | YES                    |
| Extract to `notification-service`                      | deferred in ADR-0016                             | **OWNER_DECISION_REQUIRED**   | Timing of service split                | N/A           | YES                    |

**Scope lock status:** principles **Owner-Accepted** via Issue #24; **product catalog and timings not Accepted**.

---

## Activity (Centrum P4)

| DECISION                                       | CURRENT IMPLEMENTATION            | STATUS                      | OWNER DECISION NEEDED | SAFE TO KEEP? | MUST NOT EXPAND?   |
| ---------------------------------------------- | --------------------------------- | --------------------------- | --------------------- | ------------- | ------------------ |
| Activity domain, RSVP, waitlist, reconfirm     | activity-service P4.1–P4.4        | **ACCEPTED** (P4 decisions) | —                     | YES           | within P4 Accepted |
| Single-form Discord create → preview → publish | discord-gateway + Owner Amendment | **ACCEPTED** (P4-CLOSURE)   | —                     | YES           | NO                 |
| Centrum panel publish/reconcile                | P4-D6 Accepted                    | **ACCEPTED**                | —                     | YES           | NO                 |
| Hub “Aktywności” as available module           | module registry `available`       | **ACCEPTED**                | —                     | YES           | NO                 |

---

## LFG (Activity 2.0 / Issue #20)

**Module status:** `IMPLEMENTED_PENDING_CHATGPT_AUDIT` · Issue #20 discovery **CLOSED** (2026-08-22).

| DECISION                                       | CURRENT IMPLEMENTATION                                               | STATUS                           | OWNER DECISION NEEDED     | SAFE TO KEEP? | MUST NOT EXPAND? |
| ---------------------------------------------- | -------------------------------------------------------------------- | -------------------------------- | ------------------------- | ------------- | ---------------- |
| Matching not public post board                 | `rankLfgMatch`, Hub + WWW search, no channel spam                    | **IMPLEMENTED**                  | —                         | YES           | NO (within v1)   |
| DM-first match delivery                        | `notifyLfgIntentsForActivity` → DISCOVERY DM/Inbox, coalesce, mute   | **IMPLEMENTED**                  | Copy polish               | YES           | YES (team-space) |
| Characters + class/spec + party roles          | identity profile + session roles (no profile mutation)               | **IMPLEMENTED**                  | Multi-char polish         | YES           | YES (polish)     |
| TANK / BUFF / DPS / FLEX party roles           | `@v2/hub-core` + migration 017 `party_role_key`                      | **IMPLEMENTED**                  | —                         | YES           | NO               |
| Discovery-first (match existing before create) | ephemeral wizard + similar-group warning before create               | **IMPLEMENTED**                  | —                         | YES           | NO               |
| Waiting intent / watch pool                    | `lfg_intents` pause/resume/cancel/fulfill + overlap guard             | **IMPLEMENTED**                  | TTL tuning                | YES           | YES (constants)  |
| Multi-step Discord LFG wizard                  | `lfg-hub-ephemeral.ts` mobile-first flow + Moje poszukiwania         | **IMPLEMENTED** (v1)             | Team-space                | YES           | YES (team-space) |
| Team-space / party thread UX                   | not implemented                                                      | **OWNER_DECISION_REQUIRED**      | Post-match flow           | N/A           | **YES**          |
| Public role-ping spam as primary UX            | not implemented (by design)                                          | **ACCEPTED** (forbidden)         | —                         | N/A           | YES              |
| Match scoring weights / reasons display        | human-readable `matchReason`; scores not shown in UX                 | **IMPLEMENTED** (v1 UX policy)   | Weight tuning             | YES           | YES              |
| Anti-spam / rate limits for LFG                | intent/join guards + notification dedupe                             | **IMPLEMENTED** (baseline)       | Limit tuning              | YES           | YES              |
| Admin LFG configuration                        | composition templates per activity type                              | **IMPLEMENTED** (v1 templates)   | Diagnostics polish        | YES           | YES (polish)     |
| WWW LFG surface                                | `/szukam-ekipy` search, intents, join/view                           | **IMPLEMENTED** (v1 parity)      | Mobile polish             | YES           | YES (polish)     |
| Dynamic matching on Activity lifecycle         | outbox hooks publish/RSVP/resign/cancel/schedule                     | **IMPLEMENTED**                  | —                         | YES           | NO               |
| H-08 party role fill accounting                | `countParticipationsByPartyRole` real SQL                            | **IMPLEMENTED**                  | —                         | YES           | NO               |
| H-09 notify wiring                             | `triggerLfgMatchingForActivity` on lifecycle                       | **IMPLEMENTED**                  | —                         | YES           | NO               |

---

## Reservations

| DECISION                                       | CURRENT IMPLEMENTATION                                     | STATUS                                              | OWNER DECISION NEEDED                   | SAFE TO KEEP? | MUST NOT EXPAND? |
| ---------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- | ------------- | ---------------- |
| Complete Owner Discovery pack                  | **none recorded** in SoT                                   | **OWNER_DECISION_REQUIRED**                         | Full #26-style discovery before product | N/A           | **YES**          |
| Resource model (CH / spots / org scope)        | migration 014 `reservation_resources`, `reservation_spots` | **FOUNDATION_WIP**                                  | Resource types, hierarchy, admin setup  | YES (schema)  | **YES**          |
| Half-open interval double-booking              | `assertNoDoubleBooking`                                    | **TECHNICAL_ONLY**                                  | Conflict UX, waitlist, grace periods    | YES           | YES              |
| Reservation duration rules / min-max slot      | API accepts arbitrary start/end                            | **OWNER_DECISION_REQUIRED**                         | Slot length, buffers, timezone display  | YES (API)     | **YES**          |
| Status lifecycle pending/confirmed/cancelled/… | schema CHECK + create as `confirmed`                       | **FOUNDATION_WIP**                                  | Who confirms, auto-expire, release      | YES           | **YES**          |
| Waiting behavior / queue                       | not implemented                                            | **OWNER_DECISION_REQUIRED**                         | Queue model                             | N/A           | YES              |
| Release / early cancel policy                  | `cancelReservation` stub                                   | **OWNER_DECISION_REQUIRED**                         | Penalties, notifications                | YES           | YES              |
| Notification timing (confirm/remind/cancel)    | transactional enqueue on create                            | **IMPLEMENTATION_ASSUMPTION_REQUIRES_OWNER_REVIEW** | Reminder schedule                       | YES           | **YES**          |
| Discord UX                                     | Hub roadmap stub only                                      | **OWNER_DECISION_REQUIRED**                         | Full flow                               | YES (stub)    | **YES**          |
| WWW UX                                         | route stub `/rezerwacje` in registry                       | **OWNER_DECISION_REQUIRED**                         | Full flow                               | YES           | **YES**          |
| Admin UX                                       | not implemented                                            | **OWNER_DECISION_REQUIRED**                         | Resource admin, calendars               | N/A           | YES              |

**Module status:** `RESERVATIONS_OWNER_DISCOVERY_REQUIRED` · `FOUNDATION_WIP_EXISTS`

---

## Marketplace

| DECISION                         | CURRENT IMPLEMENTATION                            | STATUS                                              | OWNER DECISION NEEDED                 | SAFE TO KEEP?     | MUST NOT EXPAND? |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------------- | ----------------- | ---------------- |
| Issue #28 gate                   | authoritative **DO NOT IMPLEMENT YET**            | **OWNER_DECISION_REQUIRED**                         | Entire product discovery              | N/A               | **YES**          |
| BUY/SELL offers + watches schema | migration 015, `marketplace_*` tables             | **FOUNDATION_WIP**                                  | Final schema semantics                | YES (placeholder) | **YES**          |
| `offerMatchesWatch` rules        | substring + price/budget filters                  | **FOUNDATION_WIP**                                  | Matching rules, fuzzy search, bonuses | YES (prototype)   | **YES**          |
| Offer TTL / `expires_at` column  | nullable column, no policy                        | **OWNER_DECISION_REQUIRED**                         | TTL defaults, renewal                 | YES (column)      | **YES**          |
| Reservation-of-item behavior     | **not in scope** — do not infer from Reservations | **OWNER_DECISION_REQUIRED**                         | If marketplace holds items            | N/A               | **YES**          |
| Catalog structure / categories   | `marketplace_categories` seed-less table          | **FOUNDATION_WIP**                                  | Category tree, items, stats           | YES               | **YES**          |
| Bonus / reputation / moderation  | not implemented                                   | **OWNER_DECISION_REQUIRED**                         | All                                   | N/A               | **YES**          |
| Notifications on match           | DISCOVERY enqueue in `createMarketplaceOffer`     | **IMPLEMENTATION_ASSUMPTION_REQUIRES_OWNER_REVIEW** | Copy, frequency, mute                 | YES               | **YES**          |
| Discord / WWW / Admin UX         | Hub roadmap stub; POST API only                   | **OWNER_DECISION_REQUIRED**                         | All surfaces                          | YES (stub/API)    | **YES**          |
| Privacy / trading safety         | not implemented                                   | **OWNER_DECISION_REQUIRED**                         | Reporting, blocks                     | N/A               | **YES**          |

**Module status:** `OWNER_DISCOVERY_REQUIRED` · `FOUNDATION_WIP_EXISTS` · `NOT_ACCEPTED_FOR_PRODUCT_IMPLEMENTATION`

---

## Cross-cutting

| DECISION                                                              | STATUS                                       | MUST NOT EXPAND?          |
| --------------------------------------------------------------------- | -------------------------------------------- | ------------------------- |
| Stage 6/7 product implementation                                      | **STOP** until Owner Discovery               | **YES**                   |
| Prototype API endpoints (`/reservations`, `/marketplace/offers`, LFG) | **FOUNDATION_WIP** — not released product    | **YES** (no UX expansion) |
| GitHub CI green                                                       | **OWNER_ACTION_REQUIRED** (`CI-BILLING-001`) | —                         |

---

## Checkpoint

Recorded under `OWNER_DISCOVERY_GOVERNANCE_REMEDIATION_SHA`
(`9a6ab229544776f68ced8be6de4d6f4add3d496c`) in `PROJECT_STATE.md`.
