# Project State — V2

## Status

`PROMPT_0_APPROVED_PENDING_MERGE`

## Aktualny etap

Fundament Promptu 0 przeszedł audyt ChatGPT i pełne CI na końcowym HEAD gałęzi
`cursor/p0-foundation-bootstrap`. PR #3 jest zatwierdzony do scalenia.

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
- zakres i kryteria akceptacji Promptu 0;
- monorepo pnpm + Nx;
- standardy jakości i testowania;
- lokalna infrastruktura oraz izolacja baz identity/authorization;
- standardy kontraktów OpenAPI i przyszłych zdarzeń;
- standard postów i interakcji Discord (D-023) oraz reguła Cursor;
- oryginalna identyfikacja wizualna V2 (D-024);
- dedykowany serwer testowy Discord;
- wizja Desktop Companion / overlay (ADR-0006).

## Aktywne zadanie

- **Task ID:** `P0-BOOTSTRAP-001`
- **Status:** `APPROVED`
- **PR:** `#3`
- **Finalny HEAD:** `7335e89cb424c7d13d309d33690379616ced361b`
- **CI:** `30956552185` — success

## Zaimplementowany fundament

- aplikacje techniczne `web`, `admin`, `api-gateway` i `discord-gateway`;
- szkielety `identity-service` i `authorization-service` z warstwami oraz health checks;
- pakiety wspólne, konfiguracja, obserwowalność, testy, design system oraz konfiguracje TypeScript i ESLint;
- Docker Compose z PostgreSQL, Redis i RabbitMQ oraz odseparowanymi bazami identity/authorization;
- skrypty developerskie, CI, Renovate, kontrola architektury i dokumentacja fundamentu;
- przypięte obrazy Compose i porty loopback;
- test izolacji baz i runtime smoke wszystkich sześciu procesów;
- granice Nx, lint i typecheck testów;
- coverage obejmujące nieimportowane pliki źródłowe;
- generator usług z jawnym portem i własnością danych;
- ochrona development/test przed przypadkowym połączeniem z zewnętrzną infrastrukturą;
- pełne `pnpm validate` obejmujące E2E i runtime smoke.

## Niezaimplementowane

- integracja z Discord API i rzeczywisty bot online;
- Discord OAuth, Better Auth, sesje i MFA;
- modele biznesowe, ORM, reguły uprawnień i moduły produktowe;
- zdarzenia biznesowe, Outbox, retry, DLQ i Streams;
- produkcyjny hosting lub deployment.

## Następny punkt kontrolny

`P1-DISCORD-TEST-HARNESS-001` — bezpieczne uruchomienie pierwszego bota na serwerze testowym `1534228693017432124`, bez funkcji biznesowych.

## Blokady

Brak blokad Promptu 0.

## Ważna uwaga

Stary projekt nie definiuje architektury V2. Jest wyłącznie opcjonalną referencją dla wybranych wzorów.
