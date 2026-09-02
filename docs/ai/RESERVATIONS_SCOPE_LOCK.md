# Reservations — Scope Lock (Stage 6)

## Status

| Flag                   | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| **Owner Discovery**    | `RESERVATIONS_OWNER_DISCOVERY_REQUIRED`                    |
| **Code on branch**     | `FOUNDATION_WIP_EXISTS`                                    |
| **Product acceptance** | **not Accepted** — no complete Owner Discovery pack in SoT |

Owner Product Discovery gate (Issue #26 process amendment 2026-08-21) applies.
Reservations does **not** have a recorded Owner-Accepted discovery pack equivalent to
Hub (#22) or Marketplace gate (#28).

## Classification of existing code

Historical WIP under `24828b7` — treat as **PROTOTYPE / FOUNDATION WIP**:

- migration `014_reservations_core.sql` (resources, spots, reservations)
- domain `assertNoDoubleBooking` / interval overlap
- `createReservation` / `cancelReservation` use-cases + POST API
- transactional notification on create (copy/timing **not** Owner-Accepted)

Must **not** define final:

resource model · reservation duration · conflict UX · waiting behavior · release behavior ·
notification timing · Discord UX · WWW UX · Admin UX

## Cursor rules

- **Do not expand** Reservations product behavior before Owner Discovery.
- **Do not delete** foundation code (reusable prototype).
- Hub module remains `roadmap` stub until Accepted.
- Gap matrix: `docs/ai/OWNER_DISCOVERY_GAPS.md`.

## Checkpoint

Accepted Stage 6 checkpoint: **pending** Owner Discovery + DoD.
