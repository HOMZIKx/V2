# Katalog aplikacji i usług

Ten katalog opisuje stan fundamentu oraz Accepted P4 boundary.

| Element                 | Typ                           | Właściciel danych    | Status     | Odpowiedzialność obecnie                                                                                                                                                                                 |
| ----------------------- | ----------------------------- | -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`                   | aplikacja Next.js App Router  | brak własnych danych | foundation | techniczna aplikacja WWW i route health                                                                                                                                                                  |
| `admin`                 | aplikacja Vite + React Router | brak własnych danych | foundation | techniczny panel administracyjny                                                                                                                                                                         |
| `api-gateway`           | NestJS + Fastify              | brak własnych danych | foundation | health endpoints i deweloperskie OpenAPI                                                                                                                                                                 |
| `discord-gateway`       | NestJS + discord.js 14.25.1   | brak własnych danych | foundation | P1 harness + opt-in P3 Authz sync (`DISCORD_AUTHORIZATION_SYNC_ENABLED`); intents Guilds (default) or Guilds+GuildMembers when sync on; [TEST_BOT_SETUP.md](../discord/TEST_BOT_SETUP.md)                |
| `identity-service`      | usługa NestJS                 | baza `identity`      | foundation | Better Auth Discord OAuth, opaque sessions, Internal JWT issue/JWKS, system revoke, login entitlement gate → Authorization                                                                               |
| `authorization-service` | usługa NestJS                 | baza `authorization` | foundation | P3 access decisions: org/guild/membership, authorize/explain, Discord sync ingest, owner bootstrap — [ADR-0013](decisions/ADR-0013-authorization-foundation.md), [contracts](AUTHORIZATION_CONTRACTS.md) |

`identity-service` i `authorization-service` posiadają osobne bazy PostgreSQL.
Authorization nie czyta bazy Identity; Identity nie czyta bazy Authorization.

P2 Identity i P3 Authorization są na `main` (PR #16 merge `1f23635`).

### P4 — activity-service (Accepted boundary, kod jeszcze nie)

| Element            | Typ                        | Właściciel danych | Status                          | Odpowiedzialność                                                                                                                                                         |
| ------------------ | -------------------------- | ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activity-service` | usługa NestJS (plan P4.1+) | baza `activity`   | **planned** (ADR-0014 Accepted) | SoT Centrum Aktywności: wydarzenia, RSVP, limity, outbox, panel ops, audyt — [CENTRUM_AKTYWNOSCI.md](CENTRUM_AKTYWNOSCI.md), [product](../product/CENTRUM_AKTYWNOSCI.md) |

Pakiet: `@v2/activity-service`. Katalog: `services/activity-service`.
Domena/kontrakty/eventy: prefiks `activity`. **Nie** `community-service`.

Kod/migracje powstają dopiero w implementacyjnym P4.1 po `READY_FOR_CURSOR`.
Stary PR #17 superseded. Spec SoT = PR **#18 merged** (`8c1b095`).
