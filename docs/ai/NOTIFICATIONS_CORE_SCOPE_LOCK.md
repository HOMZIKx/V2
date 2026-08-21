# Notifications Core — Scope Lock (Stage 4)

## Status

`OWNER_ACCEPTED` via continuous execution task `V2-CORE-FOUNDATION-CONTINUOUS-RESUME-004`
(Issue #24). GitHub issue body not fetchable without auth in this agent session;
this file mirrors the Accepted requirements from the Owner continuous task.

## Product

Durable Notification domain with:

- DM-first delivery for important personalized messages
- Persistent V2 Inbox (WWW + Discord entry)
- read/unread
- delivery history
- retry
- dedupe
- coalescing
- fallback if DM blocked → Inbox
- deep links (`v2://…`)
- preferences
- mute/unmute
- meaningful-change policy

## Classes (invariant)

| Class             | Muteable via discovery prefs | Notes                                |
| ----------------- | ---------------------------- | ------------------------------------ |
| `DISCOVERY`       | Yes (per interest/activity)  | Matching offers, optional discovery  |
| `TRANSACTIONAL`   | No (not via discovery mute)  | Joined-event updates, confirmations  |
| `SYSTEM_SECURITY` | No                           | Security / account / critical system |

Example: user muted Azrael discovery, joined Azrael event, time changes →
**TRANSACTIONAL** still delivered per policy.

## Integration order

1. Activity producers first (schedule change, cancel, waitlist, remove, reconfirm).
2. Later stages (LFG, Reservations, Marketplace) reuse the same domain/API.

## Ownership (Stage 4)

Notification SoT tables and APIs live in `activity-service` DB under explicit
notification schema (`notification_*`), with shared contracts in
`@v2/notification-core`. Extract to standalone `notification-service` only when
multi-producer load requires it (PENDING if Owner prefers immediate extract).

## Checkpoint

`NOTIFICATIONS_CORE_CHECKPOINT_SHA`
