# Notifications Core — Scope Lock (Stage 4)

## Status

| Layer                  | Status                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| **Principles**         | **Owner-Accepted** via Issue **#24** + ADR-0016 (core invariants)                                       |
| **Implementation**     | **FOUNDATION** at `NOTIFICATIONS_CORE_CHECKPOINT_SHA` (`ea3e7b9`) — not full product catalog acceptance |
| **Unresolved product** | See **OWNER_DECISION_REQUIRED** below                                                                   |

Continuous execution documented requirements but did **not** grant acceptance of every
product detail (timings, catalog, digest). Governance:
`V2-OWNER-DISCOVERY-GATE-COMPLIANCE-REMEDIATION-001`.

## Owner-Accepted principles (do not reopen)

- DM-first delivery for important personalized messages
- Persistent V2 Inbox (WWW + Discord entry)
- read/unread · delivery history · retry · dedupe · meaningful-change policy
- fallback if DM blocked → Inbox
- deep links (`v2://…`) by durable object identity
- preferences · mute/unmute (discovery class)
- interest ≠ role ≠ notification preference (#27 alignment)

## Classes (invariant — Accepted)

| Class             | Muteable via discovery prefs | Notes                                |
| ----------------- | ---------------------------- | ------------------------------------ |
| `DISCOVERY`       | Yes (per interest/activity)  | Matching offers, optional discovery  |
| `TRANSACTIONAL`   | No (not via discovery mute)  | Joined-event updates, confirmations  |
| `SYSTEM_SECURITY` | No                           | Security / account / critical system |

Example: user muted Azrael discovery, joined Azrael event, time changes →
**TRANSACTIONAL** still delivered per policy.

## OWNER_DECISION_REQUIRED (not Accepted — do not invent)

- Coalescing **window duration** (mechanism exists; timing open)
- Digest / batching behavior
- Quiet hours · priority thresholds
- Retention / archive / delete policy
- Full **notification catalog** (kinds, titles, copy per module)
- Discord/WWW preference UX details
- Immediate extract to standalone `notification-service` (ADR defers to Owner)

Gap matrix: `docs/ai/OWNER_DISCOVERY_GAPS.md`.

## Integration order (Accepted direction)

1. Activity producers first (schedule change, cancel, waitlist, remove, reconfirm).
2. Later modules reuse the same domain/API **only within Accepted scope** per module.

## Ownership (Stage 4 — Accepted architecture)

Notification SoT tables and APIs live in `activity-service` DB (`notification_*`), with
shared contracts in `@v2/notification-core`.

## Checkpoint

`NOTIFICATIONS_CORE_CHECKPOINT_SHA` = historical **implementation** marker for Stage 4
foundation — distinguish from full notification **product catalog** acceptance.
