# Reservations — Owner Decision Pack

Task: `V2-LFG-FINAL-CODE-CLOSURE-AND-RESERVATIONS-DISCOVERY-008`  
Mode: **Discovery only** — no implementation  
Prep source: `docs/ai/RESERVATIONS_DISCOVERY_PREP.md`

**Disclaimer:** Existing activity-service prototype (migrations `014`/`016`, single `POST /reservations`) is **technical foundation only**. Nothing below is Accepted until Owner selects options and ChatGPT locks SoT.

---

## Decision 1 — Core booking model (v1)

What is the default member flow for reserving a guild resource (CH and similar)?

| Option | Description                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | **Self-serve spot calendar** — member picks resource → spot → time; if free, booking is **confirmed immediately** (closest to current prototype). |
| **B**  | **Request & approve** — member submits window; stays **pending** until officer approves or rejects.                                               |
| **C**  | **Pool assign** — member picks resource + time/duration; system assigns **any free spot** in the pool (member does not pick spot label).          |

**RECOMMENDED: A** — lowest friction for fungible CH-style resources; aligns with existing confirmed-on-create prototype and LFG-style self-serve patterns. Choose B only if moderation is a hard requirement for v1; C if spot identity truly does not matter to members.

---

## Decision 2 — Resource & spot configuration authority

Who may create, enable/disable, and label bookable resources and spots?

| Option | Description                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------- |
| **A**  | **Admin-only** — officers configure catalog; members only book.                                      |
| **B**  | **Delegated roles** — dedicated reservation-admin (or activity-admin) role without full guild admin. |
| **C**  | **Member self-serve** — members can propose or create bookable spots (high abuse risk).              |

**RECOMMENDED: A** — matches V2 admin-first catalog pattern (activity types, LFG templates). B is acceptable if officers need to delegate CH management without full admin.

---

## Decision 3 — Primary member surface for v1

Where should booking live first?

| Option | Description                                                             |
| ------ | ----------------------------------------------------------------------- |
| **A**  | **Discord Hub primary** — wizard in Hub; WWW follows later.             |
| **B**  | **WWW primary** — full calendar/browse on web; Discord deep links only. |
| **C**  | **Strict parity** — same capabilities on Hub and WWW from v1 launch.    |

**RECOMMENDED: C** — V2 charter expects member parity across surfaces where module is member-facing; LFG v1 set this precedent. Accept A or B only with explicit temporary asymmetry and a dated parity milestone.

---

## Decision 4 — Conflict & capacity when spot is taken

What happens when the chosen spot/time overlaps an existing booking?

| Option | Description                                                                                   |
| ------ | --------------------------------------------------------------------------------------------- |
| **A**  | **Hard fail + pick another** — show conflict; member chooses another spot or time (no queue). |
| **B**  | **Waitlist / queue** — member joins waitlist for spot+window; notify on release.              |
| **C**  | **Suggest alternatives** — system proposes nearest free spots/times automatically.            |

**RECOMMENDED: A** — simplest v1; engineering already has double-book prevention. B/C add product and notification scope; defer unless CH scarcity makes waitlist essential for launch.

---

## Decision 5 — Booking lifecycle ownership

Who drives status transitions (`pending`, `confirmed`, `cancelled`, `expired`, `completed`)?

| Option | Description                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A**  | **Member self-serve** — instant confirm on create; member can cancel own active bookings; system auto-expires past intervals.                                |
| **B**  | **Officer-gated** — create may be instant or pending per Decision 1; officers may cancel/override any booking; members cancel own only within policy window. |
| **C**  | **System-only completion** — no officer queue; `completed`/`expired` set by scheduler only; minimal member cancel.                                           |

**RECOMMENDED: A** with **B-style officer override** as an explicit sub-rule (officers can cancel any booking; members cancel own). Avoid C unless approval workflow (Decision 1 B) is chosen.

---

## Decision 6 — Relationship to Activity RSVP and Marketplace

Are reservations a separate domain from activity participation and marketplace holds?

| Option | Description                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| **A**  | **Strictly separate** — CH booking does not reserve activity slots or marketplace items; no shared hold semantics in v1. |
| **B**  | **Soft link later** — separate v1; optional deep links from activity detail to “book CH for this run” in a future phase. |
| **C**  | **Integrated holds** — booking a CH can hold or block related activity/marketplace resources in v1.                      |

**RECOMMENDED: A** — preserves bounded context (Issue #28 Marketplace gate, Activity P4 separation). B is the natural evolution path after v1 is stable.

---

## Decision 7 — Resource taxonomy scope for v1

What resource types are in scope at launch?

| Option | Description                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| **A**  | **CH / room only** — single `resource_kind` family; spots are rooms or lanes under one guild CH resource.             |
| **B**  | **Multi-type catalog** — CH plus other kinds (e.g. voice slots, coaching, services) with per-type rules from day one. |
| **C**  | **CH now, extensible schema** — ship CH-only UX but schema/admin allows adding kinds without migration rewrite.       |

**RECOMMENDED: C** — avoids painting product into “CH only” while keeping v1 UX and admin scope manageable (prototype already has `resource_kind` column).

---

## Status

**RESERVATIONS_STATUS = OWNER_DISCOVERY_READY**

Next step (Owner + ChatGPT): record choices above → update `RESERVATIONS_SCOPE_LOCK.md` / Accepted SoT → only then implementation prompt. Do **not** mark Accepted in this pack.
