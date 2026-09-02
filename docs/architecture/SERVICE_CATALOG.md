# Katalog aplikacji i usług

Ten katalog opisuje stan fundamentu oraz Accepted P4 boundary.

| Element                 | Typ                           | Właściciel danych    | Status             | Odpowiedzialność obecnie                                                                                                                                                                                 |
| ----------------------- | ----------------------------- | -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`                   | aplikacja Next.js App Router  | brak własnych danych | foundation         | techniczna aplikacja WWW i route health                                                                                                                                                                  |
| `admin`                 | aplikacja Vite + React Router | brak własnych danych | **P4.3 Admin UI**  | Centrum Aktywności config UI (`/activity/*`); Identity session / DEV actor header; klient API przez gateway lub activity-service                                                                         |
| `api-gateway`           | NestJS + Fastify              | brak własnych danych | foundation + P4.3  | health + Internal JWT proof + BFF proxy `/activity/v1/*` → activity-service                                                                                                                              |
| `discord-gateway`       | NestJS + discord.js 14.25.1   | brak własnych danych | P1 + P3 + **P4.2** | P1 harness + Authz sync; Centrum hub/event Components V2 + projection deliver; [TEST_BOT_SETUP.md](../discord/TEST_BOT_SETUP.md)                                                                         |
| `identity-service`      | usługa NestJS                 | baza `identity`      | foundation         | Better Auth Discord OAuth, opaque sessions, Internal JWT issue/JWKS, system revoke, login entitlement gate → Authorization                                                                               |
| `authorization-service` | usługa NestJS                 | baza `authorization` | foundation         | P3 access decisions: org/guild/membership, authorize/explain, Discord sync ingest, owner bootstrap — [ADR-0013](decisions/ADR-0013-authorization-foundation.md), [contracts](AUTHORIZATION_CONTRACTS.md) |
| `activity-service`      | usługa NestJS                 | baza `activity`      | **P4.1–P4.3**      | SoT Centrum Aktywności: wydarzenia, RSVP, limity, outbox, Discord projection, Admin API — [CENTRUM_AKTYWNOSCI.md](CENTRUM_AKTYWNOSCI.md), [product](../product/CENTRUM_AKTYWNOSCI.md)                    |

`identity-service`, `authorization-service` i `activity-service` posiadają osobne bazy PostgreSQL.
Usługi nie czytają baz innych usług (tylko HTTP S2S).

P2 Identity i P3 Authorization są na `main` (PR #16 merge `1f23635`).

### P4 — activity-service (P4.1 domain foundation)

| Element            | Typ                                    | Właściciel danych | Status        | Odpowiedzialność                                                                                                          |
| ------------------ | -------------------------------------- | ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `activity-service` | usługa NestJS (`@v2/activity-service`) | baza `activity`   | **P4.1–P4.3** | SoT Centrum: wydarzenia, RSVP, limity, outbox, Discord projection state, **Admin API** `/activity/v1/admin` — port `4400` |

Pakiet: `@v2/activity-service`. Katalog: `services/activity-service`.
Domena/kontrakty/eventy: prefiks `activity`. **Nie** `community-service`.
P4.4 WWW portal użytkownika jest poza tym etapem.
