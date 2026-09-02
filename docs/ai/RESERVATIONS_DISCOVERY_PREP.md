# Reservations — Owner Discovery Prep

Task: `V2-RESERVATIONS-OWNER-DISCOVERY-PREP-001`  
Mode: **research / inventory / options only** — no product implementation  
Status gate: `RESERVATIONS_OWNER_DISCOVERY_REQUIRED` · `FOUNDATION_WIP_EXISTS`

**Disclaimer:** Existing code is a **technical prototype**, not an Accepted product definition.
Do not treat migrations, defaults, or notification copy as Owner decisions.

Related SoT: `RESERVATIONS_SCOPE_LOCK.md`, `OWNER_DISCOVERY_GAPS.md`, `PENDING_DECISIONS.md` (RESERVATIONS-DISC-001).

---

## 1. What currently exists (technical)

### Database (activity-service)

| Migration                         | Purpose                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `014_reservations_core.sql`       | `reservation_resources`, `reservation_spots`, `reservations` tables                            |
| `016_reservations_no_overlap.sql` | GiST exclusion constraint — no overlapping active bookings per spot (half-open `[)` intervals) |

**Schema shape (prototype):**

- **Resource** — guild + org scoped, `key`, `label`, `resource_kind` default `'CH'`, `enabled`
- **Spot** — child of resource, `label`, `sort_order`, `enabled`
- **Reservation** — `spot_id`, `owner_discord_user_id`, `starts_at` / `ends_at`, `status` (`pending` \| `confirmed` \| `cancelled` \| `expired` \| `completed`), `version`

No seed data, no admin CRUD migrations, no audit/history tables, no waitlist/queue tables.

### Domain / application (activity-service)

| Artifact                      | Role                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `domain/reservations.ts`      | Pure overlap detection (`intervalsOverlap`, `assertNoDoubleBooking`)                           |
| `domain/reservations.spec.ts` | Unit tests for overlap logic                                                                   |
| `reservations.use-cases.ts`   | `createReservation`, `cancelReservation` (marked PROTOTYPE WIP)                                |
| `activity-repository.ts`      | `getReservationSpotScope`, `listReservationsForSpot`, `insertReservation`, `cancelReservation` |
| `activity.use-cases.ts`       | Wrapper: `createReservation` with `requirePermission(CREATE)`                                  |
| `activity.controller.ts`      | **Single public route:** `POST /activity/v1/reservations`                                      |

**Prototype create behavior (not Accepted product):**

- Validates interval, resolves tenant from DB (`getReservationSpotScope`), checks resource/spot enabled
- Application-level conflict check + DB exclusion constraint (race-safe)
- Inserts with status **`confirmed` immediately** (no pending/approval path)
- Enqueues **TRANSACTIONAL** notification `reservation.confirmed` with ISO timestamp body + `v2://reservations/{id}` deep link

**Cancel:** implemented in use-case + repository (owner-only, `pending`/`confirmed` → `cancelled`) but **no HTTP controller route** exposed.

**Not implemented:** list/search availability, edit, extend, reminders, admin resource setup, Discord/WWW flows, idempotency wrapper dedicated to reservations.

### Hub / navigation (hub-core)

- Module registry entry `reservations` — group **GRA**, label **Rezerwacje**, `availability: 'roadmap'`
- WWW path stub: `/rezerwacje` (no app route implemented)
- Discord Hub select value: `reservations` → roadmap ephemeral only (“moduł na roadmapie…”)
- Deep link contract: `v2://reservations/{id}` → WWW path `/rezerwacje/{id}` (mapping only)

### Notifications

- One prototype kind on create: `reservation.confirmed` (class **TRANSACTIONAL**)
- No reminder, cancel, or conflict notifications

### Security / audit fixes already applied (technical, not product)

From post-overbuild audit — retain as engineering invariants:

- Guild-scoped `requirePermission` on `POST /reservations`
- Client `guildId` / `organizationId` / `resourceId` validated against DB scope (not trusted blindly)
- Double-booking race closed by migration `016`
- Disabled resource/spot rejected at create time

### Tests

- Domain overlap unit tests only
- No integration/E2E for reservations API
- No concurrency integration test documented (exclusion constraint relies on Postgres)

---

## 2. Reusable safely (keep as foundation)

| Layer                                                 | Reusable  | Notes                                                              |
| ----------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| Half-open interval overlap model                      | **Yes**   | Domain + DB exclusion pattern is sound regardless of UX variant    |
| Spot-scoped booking with resource hierarchy           | **Yes**   | Common for CH / room / lane models; hierarchy may expand           |
| Tenant derivation from DB (`getReservationSpotScope`) | **Yes**   | Security pattern — keep                                            |
| Guild/org columns on reservation rows                 | **Yes**   | Aligns with V2 tenancy                                             |
| Status enum skeleton                                  | **Yes**   | Values exist; **transitions** are not decided                      |
| Notification pipeline hook (TRANSACTIONAL class)      | **Yes**   | Kind/copy/timing need Owner catalog                                |
| Deep link module key `reservations`                   | **Yes**   | Taxonomy slot reserved in hub-core                                 |
| Hub `roadmap` availability                            | **Yes**   | Correct until Accepted                                             |
| Authorization via existing activity permission port   | **Maybe** | Reuse pattern; **which permission** is a product/security decision |

**Do not delete** prototype code per governance — classify as `FOUNDATION_WIP`.

---

## 3. Product decisions still missing (Owner Discovery)

Grouped at **high level** — not a micro-questionnaire.

### A. What is being reserved?

- What **resource types** exist beyond prototype default `CH`? (rooms, spots, slots, services?)
- Single guild org scope vs multi-guild shared resources?
- Who **creates/configures** resources and spots (Admin only? delegated roles?)

### B. Booking model

- **Instant confirm** vs **request → approve** vs **organizer-assigned**?
- Fixed **slot grid** (e.g. 2 h blocks) vs **free-form** start/end (prototype today)?
- Min/max duration, buffers between bookings, timezone display rules?
- Can one member hold **multiple** overlapping reservations?

### C. Conflict & capacity UX

- What should the member see when a spot is taken? (pick another spot, waitlist, next window?)
- Is **waitlist/queue** in scope for v1?
- Early cancel / no-show / auto-release policy?

### D. Lifecycle & notifications

- Meaning of `pending`, `expired`, `completed` in practice — who transitions them?
- Which events are **TRANSACTIONAL** vs **DISCOVERY** (if any)?
- Reminder schedule? Cancel notify others?

### E. Surfaces & parity

- Primary entry: **Hub ephemeral**, **WWW**, or both with parity rules?
- Admin: calendar view, resource editor, moderation, diagnostics?
- “Moje” / inbox integration — how reservations appear alongside Activity/LFG?

### F. Permissions & abuse

- Dedicated reservation permissions vs reuse Activity CREATE/JOIN?
- Rate limits, max active reservations per member, officer override?

### G. Relationship to other modules

- **No coupling to Marketplace item hold** unless explicitly decided (Issue #28 gate).
- **No coupling to Activity RSVP** unless explicitly decided (separate domains today).

---

## 4. High-level product variants (2–3)

### Variant A — **Self-serve spot calendar (instant confirm)**

Member picks **resource → spot → time window**; if free, reservation is **immediately confirmed** (closest to current prototype).

**Best when:** trust is high, spots are fungible (CH rooms), low moderation overhead.

### Variant B — **Request & approve**

Member submits desired window; reservation stays **`pending`** until officer approves or rejects.

**Best when:** gildia wants control over CH usage, disputes are common, or resources are scarce/high-value.

### Variant C — **Pool booking (system assigns spot)**

Member picks **resource + duration/time**; backend assigns **any eligible free spot** in the pool (member may not choose spot label).

**Best when:** spot identity does not matter (any free CH slot), UX should be faster, admin manages pool not individual picker.

---

## 5. Trade-offs

| Dimension              | A — Instant spot calendar               | B — Request & approve       | C — Pool assign              |
| ---------------------- | --------------------------------------- | --------------------------- | ---------------------------- |
| Member friction        | Low                                     | Higher (wait state)         | Lowest picker friction       |
| Moderation load        | Low                                     | Higher                      | Low–medium                   |
| Prototype fit          | **Strong** (schema + confirm-on-create) | Weak (pending unused)       | Medium (needs assign logic)  |
| Conflict UX complexity | Medium (pick another spot)              | Higher (reject + messaging) | Lower (opaque assign)        |
| Notification needs     | Confirm + remind + cancel               | Pending + decision + remind | Confirm assign + remind      |
| Admin tooling          | Resource/spot CRUD + calendar           | + approval queue            | Pool config + fairness rules |
| Abuse surface          | Sniping popular slots                   | Spam requests               | Algorithm fairness disputes  |
| Mobile Discord UX      | Calendar/grid ephemeral                 | Status + approve actions    | Shortest wizard              |

**None of these variants is Accepted.** Owner must pick (or hybrid) before implementation prompt.

---

## 6. Existing Discord / WWW / Admin integration points

| Surface                  | Today                                   | Notes                                                 |
| ------------------------ | --------------------------------------- | ----------------------------------------------------- |
| **Discord Hub**          | Roadmap stub via `hub-module-ephemeral` | No booking wizard; must stay `roadmap` until Accepted |
| **Discord deep actions** | None                                    | No signed custom IDs, no ephemeral reservation flow   |
| **WWW**                  | Registry path `/rezerwacje` only        | **No** Next.js route/page; deep link mapper exists    |
| **WWW nav**              | Not linked in AppShell (module roadmap) | Parity TBD                                            |
| **Admin**                | **None**                                | No resource/spot CRUD UI, no calendar, no diagnostics |
| **API**                  | `POST /activity/v1/reservations` only   | No GET availability, no cancel route, no admin APIs   |
| **Notifications Inbox**  | Prototype confirm on create             | Deep link resolves to `/rezerwacje/{id}` (404 today)  |
| **Authorization**        | `activity_mutate` + `CREATE` on guild   | May need dedicated reservation permissions            |

**Integration dependencies already in V2:** Notifications Core (#24), Hub module registry, permission port, activity-service tenancy patterns — reuse, do not fork.

---

## 7. Security / concurrency invariants (non-negotiable)

These are **engineering safety** requirements — any Accepted variant must preserve them:

1. **No double booking** on the same spot for overlapping active intervals (DB exclusion + domain check).
2. **Half-open interval semantics** `[start, end)` — consistent in app and Postgres (changing this breaks `016`).
3. **Tenant scope from SoT** — guild/org/resource/spot relationships resolved from DB; never trust client tenant IDs alone.
4. **Authorization before mutate** — guild-scoped permission check on every create/cancel/admin action.
5. **Owner-only cancel** (or explicit elevated role if Owner extends policy) — no IDOR on reservation id.
6. **Enabled flags honored** — disabled resource/spot cannot be booked.
7. **Private/guild boundary** — no cross-guild reservation leakage in list/search/admin views (when built).
8. **Idempotency** for create/cancel under retry (Discord/WWW) — pattern must match Activity/LFG standards.
9. **Notification class correctness** — booking confirmations/changes are **TRANSACTIONAL**; must not be suppressed by discovery mute.
10. **No silent bypass of conflict** — concurrent last-window races must return actionable **CONFLICT**, not corrupt state.

---

## 8. Prototype assumptions that must NOT become Accepted accidentally

| Prototype assumption                                 | Risk if Accepted by accident                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `resource_kind = 'CH'` default                       | Entire product framed as “CH only” without broader resource taxonomy    |
| Create → **`confirmed` immediately**                 | Skips approval/moderation product Owner may want                        |
| Client-supplied **arbitrary** `startsAt`/`endsAt`    | Implies free-form booking without slot grid policy                      |
| ISO strings in notification body                     | Poor mobile UX; not localized; not Owner copy                           |
| Single **`POST` create** API as “the product”        | Implies no availability browse, cancel UX, or admin setup               |
| **`activity_mutate` CREATE** permission              | May be too broad or too narrow vs intended audience                     |
| **`owner_discord_user_id` only**                     | May need v2 user linkage, officer bookings, or impersonation rules      |
| Cancel exists but **no HTTP/API surface**            | Hidden capability — not a product flow                                  |
| Deep link to `/rezerwacje/{id}` with **no WWW page** | Broken member experience if notifications go live                       |
| Hub module stays roadmap but API is callable         | Members could book via raw API without UX/policy guardrails             |
| Status values in CHECK constraint                    | Implies lifecycle Owner has not defined (`expired`, `completed` unused) |
| No waitlist/table                                    | Assumes conflict = hard fail only                                       |

---

## Owner Discovery — high-level questions (max 8)

1. **Which variant (A / B / C or hybrid)** matches gildia operations for CH and similar resources?
2. **Who configures resources** — Admin-only vs delegated roles vs member self-serve?
3. **Instant confirm vs request/approve** — default member expectation for v1?
4. **Primary surface** for v1 — Discord Hub, WWW, or strict parity?
5. **Notification policy** — which booking events are transactional; reminder timing?
6. **Cancel / no-show / auto-release** — member vs officer override rules?
7. **Relationship to Activity RSVP and Marketplace holds** — explicitly separate or integrate later?
8. **Resource taxonomy beyond CH** — single type or multi-type catalog from day one?

---

## Status

**RESERVATIONS_DISCOVERY_PREP_READY**

Next step (Owner + ChatGPT): run formal Discovery → Options → Decisions → Accepted SoT → only then implementation prompt (`RESERVATIONS_SCOPE_LOCK` update).
