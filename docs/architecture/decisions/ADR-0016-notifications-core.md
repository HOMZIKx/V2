# ADR-0016: Notifications Core domain (Stage 4)

- **Status:** Accepted
- **Data:** 2026-08-21
- **Task:** `V2-CORE-FOUNDATION-CONTINUOUS-RESUME-004` / Issue #24
- **Related:** ADR-0015 Hub Core; Activity inbox foundation

## Decyzja

1. Notification classes `DISCOVERY` | `TRANSACTIONAL` | `SYSTEM_SECURITY` are
   first-class fields; discovery mute must never suppress transactional/security.
2. Shared contracts live in `@v2/notification-core`.
3. Stage 4 persists notification SoT in `activity` DB (`notification_*` tables)
   and exposes `/activity/v1/notifications/*` (+ evolves inbox) so Activity can
   integrate immediately without a new deployable service boundary.
4. Delivery: prefer Discord DM; always ensure Inbox persistence; if DM blocked,
   Inbox remains source of truth for the user.
5. Discord Gateway gains explicit DM send capability for notification delivery only;
   public Hub channel remains free of personalized dumps.

## Konsekwencje

- Later modules enqueue via the same notification API/outbox events.
- Optional future extract to `notification-service` is additive, not a rewrite.
