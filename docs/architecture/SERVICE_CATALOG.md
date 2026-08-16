# Katalog aplikacji i usług

Ten katalog opisuje stan fundamentu oraz Accepted P4 boundary.

| Element                 | Typ                           | Właściciel danych    | Status              | Odpowiedzialność obecnie                                                                                                                                                                                 |
| ----------------------- | ----------------------------- | -------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`                   | aplikacja Next.js App Router  | brak własnych danych | foundation          | techniczna aplikacja WWW i route health                                                                                                                                                                  |
| `admin`                 | aplikacja Vite + React Router | brak własnych danych | foundation          | techniczny panel administracyjny                                                                                                                                                                         |
| `api-gateway`           | NestJS + Fastify              | brak własnych danych | foundation          | health endpoints i deweloperskie OpenAPI                                                                                                                                                                 |
| `discord-gateway`       | NestJS + discord.js 14.25.1   | brak własnych danych | foundation          | P1 harness + opt-in P3 Authz sync (`DISCORD_AUTHORIZATION_SYNC_ENABLED`); intents Guilds (default) or Guilds+GuildMembers when sync on; [TEST_BOT_SETUP.md](../discord/TEST_BOT_SETUP.md)                |
| `identity-service`      | usługa NestJS                 | baza `identity`      | foundation          | Better Auth Discord OAuth, opaque sessions, Internal JWT issue/JWKS, system revoke, login entitlement gate → Authorization                                                                               |
| `authorization-service` | usługa NestJS                 | baza `authorization` | foundation          | P3 access decisions: org/guild/membership, authorize/explain, Discord sync ingest, owner bootstrap — [ADR-0013](decisions/ADR-0013-authorization-foundation.md), [contracts](AUTHORIZATION_CONTRACTS.md) |
| `activity-service`      | usługa NestJS                 | baza `activity`      | **P4.1 foundation** | SoT Centrum Aktywności: wydarzenia, RSVP, limity, outbox, panel state, audyt — [CENTRUM_AKTYWNOSCI.md](CENTRUM_AKTYWNOSCI.md), [product](../product/CENTRUM_AKTYWNOSCI.md)                               |

`identity-service`, `authorization-service` i `activity-service` posiadają osobne bazy PostgreSQL.
Usługi nie czytają baz innych usług (tylko HTTP S2S).

P2 Identity i P3 Authorization są na `main` (PR #16 merge `1f23635`).

### P4 — activity-service (P4.1 domain foundation)

| Element            | Typ                                    | Właściciel danych | Status               | Odpowiedzialność                                                                                                      |
| ------------------ | -------------------------------------- | ----------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `activity-service` | usługa NestJS (`@v2/activity-service`) | baza `activity`   | **P4.1 implemented** | SoT Centrum Aktywności: wydarzenia, RSVP, limity, outbox, panel ops (state only), audyt — port `4400`, `/activity/v1` |

Pakiet: `@v2/activity-service`. Katalog: `services/activity-service`.
Domena/kontrakty/eventy: prefiks `activity`. **Nie** `community-service`.
P4.2 Discord UI nie jest częścią tego etapu.
