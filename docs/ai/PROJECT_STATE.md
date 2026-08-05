# Project State — V2

## Status

`P1_ZEABUR_FULL_STACK_DEPLOY_IN_PROGRESS`

## Aktualny etap

P1 Discord Test Harness + zatwierdzone rozszerzenie **DEC-001 B**: pełne wdrożenie aktualnego stosu V2 na osobnym Zeabur (ADR-0008).

## Zatwierdzone

- wizja i model produktu;
- jedna organizacja i wiele serwerów Discord;
- hybrydowy profil użytkownika;
- pełna platforma WWW + Discord;
- model uprawnień;
- mikrousługi;
- główny stos TypeScript;
- monorepo pnpm + Nx;
- własność danych;
- REST/OpenAPI + RabbitMQ;
- backend Node/Nest/Fastify;
- podział Web/Admin;
- model tożsamości, MFA i sesji;
- trwały protokół pracy AI;
- standardy jakości, testów i lokalnej infrastruktury;
- standard postów i interakcji Discord (D-023);
- oryginalna identyfikacja wizualna V2 (D-024);
- dedykowany serwer testowy Discord `1534228693017432124`;
- wizja Desktop Companion / overlay (ADR-0006);
- Discord test harness P1 (ADR-0007);
- pełne wdrożenie stosu na osobnym Zeabur (ADR-0008 / D-030).

## Zamknięty etap

- **Task ID:** `P0-BOOTSTRAP-001`
- **Status:** `APPROVED_AND_MERGED`
- **PR:** `#3`
- **Merge commit:** `877c680f234836ab55c5c345abf0a2175c31c24f`

## Aktywne zadanie

- **Task ID:** `P1-DISCORD-TEST-HARNESS-001` + Zeabur full-stack (DEC-001 B)
- **Status:** `AWAITING_OWNER_ZEABUR_VARIABLES`
- **Branch:** `cursor/p1-discord-test-harness`
- **Deploy config:** `Dockerfile.*`, `docs/deploy/ZEABUR.md`, `docs/deploy/ZEABUR_OWNER_VARIABLES.md`
- **Live test Discord:** po Redeploy `discord-gateway` z sekretami w Zeabur (guild `1534228693017432124`)
- **Pull Request:** dopiero po zielonym CI i potwierdzonym działaniu wdrożenia — bez samodzielnego scalenia

## Cel

- hostowany stos: web, admin, api-gateway, discord-gateway, identity-service, authorization-service;
- PostgreSQL×2, Redis, RabbitMQ — nowe add-ony, nie legacy;
- bot Discord 24/7 na guild testowym;
- sekrety tylko w Zeabur Variables.

## Nadal niezaimplementowane (produkt)

- Discord OAuth, Better Auth, sesje i MFA;
- docelowy system uprawnień;
- modele biznesowe i ORM;
- moduły wydarzeń, rezerwacji, LFG, moderacji, ticketów, muzyki, automatyzacji i analityki;
- RabbitMQ w funkcjach biznesowych (add-on przygotowany).

## Następny punkt kontrolny

Właściciel: utworzy serwisy/add-ony według `docs/deploy/ZEABUR.md`, wklei Variables z `ZEABUR_OWNER_VARIABLES.md`, Redeploy, zgłosi URL-e bez sekretów. Cursor weryfikuje health + live test Discord, potem PR.

## Blokady

Brak dostępu agenta do panelu Zeabur / CLI — deploy kończy właściciel Variables + Redeploy. Token Discord tylko w Zeabur Secret Variables.

## Ważna uwaga

Stary projekt nie definiuje architektury V2. Jest wyłącznie opcjonalną referencją dla wybranych wzorów. Nie mieszać z `dobry-temat`.
