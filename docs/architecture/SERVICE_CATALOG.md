# Katalog aplikacji i usług

Ten katalog opisuje wyłącznie stan fundamentu Promptu 0. Status `foundation`
oznacza technicznie uruchamialną aplikację bez logiki biznesowej, a `skeleton`
oznacza przygotowaną strukturę warstw usługowych.

| Element                 | Typ                           | Właściciel danych    | Status     | Odpowiedzialność obecnie                                                                                                                                                                      |
| ----------------------- | ----------------------------- | -------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`                   | aplikacja Next.js App Router  | brak własnych danych | foundation | techniczna aplikacja WWW i route health                                                                                                                                                       |
| `admin`                 | aplikacja Vite + React Router | brak własnych danych | foundation | techniczny panel administracyjny                                                                                                                                                              |
| `api-gateway`           | NestJS + Fastify              | brak własnych danych | foundation | health endpoints i deweloperskie OpenAPI                                                                                                                                                      |
| `discord-gateway`       | NestJS + discord.js 14.25.1   | brak własnych danych | foundation | P1 test harness: Gateway/WebSocket, guild-only commands, `/status`, `/panel-test`; tokenless default (`DISCORD_ENABLED=false`); live setup: [TEST_BOT_SETUP.md](../discord/TEST_BOT_SETUP.md) |
| `identity-service`      | usługa NestJS                 | baza `identity`      | skeleton   | podział Domain/Application/Infrastructure/Interface oraz health                                                                                                                               |
| `authorization-service` | usługa NestJS                 | baza `authorization` | skeleton   | podział Domain/Application/Infrastructure/Interface oraz health                                                                                                                               |

`identity-service` i `authorization-service` nie implementują jeszcze
logowania, OAuth, sesji, ORM, modeli domenowych ani reguł uprawnień.
PostgreSQL zawiera osobne bazy i konta usługowe dla obu właścicieli danych.

### Plan P2 (dokumentacja only — ADR Accepted)

Plan fundamentu Identity: [IDENTITY_FOUNDATION.md](IDENTITY_FOUNDATION.md),
[P2 handoff](../ai/P2_IDENTITY_FOUNDATION_HANDOFF.md). Po merge zatwierdzonego
planu PR #10 osobny PR implementacyjny: User / Account / Session / Verification
w `identity-service` (Better Auth za portami — ADR-0012).
`authorization-service` pozostaje bez RBAC do P3.
