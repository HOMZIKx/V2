# ADR-0015: V2 Hub Core shell and module registry

- **Status:** Accepted
- **Data:** 2026-08-21
- **Task:** `V2-HUB-CORE-OWNER-SCOPE-LOCK-002`
- **Owner decisions:** resolves `HUB-CORE-001` / Issue #22 scope lock

## Kontekst

Stage 3 of Issue #26 requires a product Hub shell beyond Activity Centrum alone.
Owner Accepted the IA map, public vs personal rules, and foundations without
authorizing full Reservations / Marketplace / Notifications / Overlay.

## Decyzja

1. Shared Hub contracts live in `@v2/hub-core` (registry, deep links, catalogs,
   channel-retirement statuses, sync rule constants) — Domain-safe, no Nest/Discord/ORM.
2. Canonical Discord entry remains one Admin-configured Hub channel + one panel
   owned by `activity-service` delivery/reconcile; `discord-gateway` renders from
   the registry (Activity is the first **available** module).
3. Player profile, characters, interests, and interest→role mapping data are owned
   by `identity-service` (extension of ADR-0009 basic profile). Interest is V2 SoT;
   Discord roles may be projections with explicit guild-scoped mappings and safety
   checks. Notification preferences are **not** Interests (Stage 4).
4. WWW and Discord share the same module keys, deep-link model, and profile objects.
5. Overlay/Desktop Companion is deferred; only durable IDs/contracts are prepared.

## Konsekwencje

- No giant hardcoded navigation switch across adapters; registry is the map.
- Hub Core can ship foundations while later stages fill module bodies.
- Channel retirement is Owner-gated; Hub Core never mass-deletes Discord channels.
