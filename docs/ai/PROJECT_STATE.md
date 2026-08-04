# Project State — V2

## Status

`PROMPT_0_IMPLEMENTED_PENDING_REVIEW`

## Aktualny etap

Fundament Promptu 0 został zaimplementowany na gałęzi
`cursor/p0-foundation-bootstrap` i oczekuje na audyt ChatGPT. Status
szczegółowy przekazuje `docs/ai/CURSOR_TO_CHATGPT.md`.

## Zatwierdzone

- wizja i model produktu;
- jedna organizacja i wiele serwerów Discord;
- hybrydowy profil użytkownika;
- pełna platforma WWW + Discord;
- model uprawnień;
- mikrousługi;
- główny stos TypeScript;
- monorepo;
- własność danych;
- REST/OpenAPI + RabbitMQ;
- backend Node/Nest/Fastify;
- podział Web/Admin;
- model tożsamości, MFA i sesji;
- trwały protokół pracy AI;
- zakres i kryteria akceptacji Promptu 0.
- monorepo pnpm + Nx;
- standardy jakości i testowania;
- lokalna infrastruktura oraz izolacja baz identity/authorization;
- standardy kontraktów OpenAPI i przyszłych zdarzeń.

## Aktywne zadanie

- **Task ID:** `P0-BOOTSTRAP-001`
- **Status:** `READY_FOR_REVIEW`
- **Źródło:** `docs/ai/CHATGPT_TO_CURSOR.md`
- **Oczekiwany branch Cursora:** `cursor/p0-foundation-bootstrap`
- **Oczekiwany wynik:** Pull Request do `main`, bez samodzielnego scalenia.

## Zaimplementowany fundament

- aplikacje techniczne `web`, `admin`, `api-gateway` i `discord-gateway`;
- szkielety `identity-service` i `authorization-service` z warstwami oraz
  health checks;
- pakiety wspólne, konfiguracja, obserwowalność, testy, design system oraz
  konfiguracje TypeScript i ESLint;
- Docker Compose z PostgreSQL 16, Redis 7 i RabbitMQ 3-management oraz
  odseparowanymi bazami identity/authorization;
- skrypty developerskie, CI, Renovate, kontrola architektury i dokumentacja
  fundamentu.
- remediacje audytowe: przypięte obrazy Compose oraz porty loopback, bezpieczne
  domyślne hosty, test generatora usługi, smoke runtime i sprawdzanie izolacji
  baz w osobnym jobie CI.
- granice Nx nie traktują już `scope:shared` jako uprawnienia; test jednostkowy
  blokuje zależność usługi od `type:ui` i od tagu informacyjnego bez typu.
- progi Vitest V8 oraz testy izolacji PostgreSQL są przygotowane do egzekwowania
  w CI; smoke runtime uruchamia entrypointy buildów wszystkich sześciu procesów.

## Niezaimplementowane

- Discord OAuth, Better Auth, sesje, MFA i integracja z Discord API;
- modele biznesowe, ORM, reguły uprawnień i moduły produktowe;
- zdarzenia biznesowe, AsyncAPI/JSON Schema, Outbox, retry, DLQ i Streams;
- produkcyjny hosting lub deployment.

## Następny punkt kontrolny

Audyt ChatGPT zmian Promptu 0. Nie rozpoczynać Promptu 1 bez statusu
`APPROVED`.

## Blokady

Brak blokad produktowych. Na hoście implementacji Cursor brakowało Docker CLI /
Docker Desktop — lokalne `docker compose config` i healthy kontenery nie zostały
wykonane; CI ma wykonać walidację Compose.

## Ważna uwaga

Stary projekt nie definiuje architektury V2. Jest wyłącznie opcjonalną referencją dla wybranych wzorów.
