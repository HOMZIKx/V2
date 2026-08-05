# Katalog aplikacji i usług

Ten katalog opisuje wyłącznie stan fundamentu Promptu 0. Status `foundation`
oznacza technicznie uruchamialną aplikację bez logiki biznesowej, a `skeleton`
oznacza przygotowaną strukturę warstw usługowych.

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

P2 Identity (Better Auth + Internal JWT) jest na `main`. P3 Authorization foundation:
ADR-0013 / Issue #15.
