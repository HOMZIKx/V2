# Katalog aplikacji i usług

Ten katalog opisuje wyłącznie stan fundamentu Promptu 0. Status `foundation`
oznacza technicznie uruchamialną aplikację bez logiki biznesowej, a `skeleton`
oznacza przygotowaną strukturę warstw usługowych.

| Element                 | Typ                           | Właściciel danych    | Status     | Odpowiedzialność obecnie                                        |
| ----------------------- | ----------------------------- | -------------------- | ---------- | --------------------------------------------------------------- |
| `web`                   | aplikacja Next.js App Router  | brak własnych danych | foundation | techniczna aplikacja WWW i route health                         |
| `admin`                 | aplikacja Vite + React Router | brak własnych danych | foundation | techniczny panel administracyjny                                |
| `api-gateway`           | NestJS + Fastify              | brak własnych danych | foundation | health endpoints i deweloperskie OpenAPI                        |
| `discord-gateway`       | NestJS adapter                | brak własnych danych | foundation | bezpieczny start i health bez tokenu Discorda                   |
| `identity-service`      | usługa NestJS                 | baza `identity`      | skeleton   | podział Domain/Application/Infrastructure/Interface oraz health |
| `authorization-service` | usługa NestJS                 | baza `authorization` | skeleton   | podział Domain/Application/Infrastructure/Interface oraz health |

`identity-service` i `authorization-service` nie implementują jeszcze
logowania, OAuth, Better Auth, ORM, modeli domenowych ani reguł uprawnień.
PostgreSQL zawiera osobne bazy i konta usługowe dla obu właścicieli danych.
