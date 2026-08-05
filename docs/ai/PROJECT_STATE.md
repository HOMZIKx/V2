# Project State — V2

## Status

`P1_DISCORD_TEST_HARNESS_READY_FOR_LIVE_TEST`

## Aktualny etap

P1 Discord Test Harness — **lokalny live test na pierwszym miejscu**.  
Wdrożenie Zeabur (DEC-001 B / ADR-0008) jest **wstrzymane** do potwierdzenia działania bota lokalnie.

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
- ADR-0008 (Zeabur) — dokumentacja przyjęta, **wdrożenie odłożone**.

## Zamknięty etap

- **Task ID:** `P0-BOOTSTRAP-001`
- **Status:** `APPROVED_AND_MERGED`
- **PR:** `#3`
- **Merge commit:** `877c680f234836ab55c5c345abf0a2175c31c24f`

## Aktywne zadanie

- **Task ID:** `P1-DISCORD-TEST-HARNESS-001`
- **Status:** `READY_FOR_LIVE_TEST`
- **Branch:** `cursor/p1-discord-test-harness`
- **Priorytet:** lokalny bot 24/7-process na PC → live test guild `1534228693017432124`
- **Zeabur:** wstrzymany (nie tworzyć 6 serwisów / nie wdrażać teraz)
- **Pull Request:** po lokalnym live teście i zielonym CI — bez samodzielnego scalenia

## Cel aktywnego zadania

- bezpieczne połączenie `discord-gateway` z Discordem (lokalnie);
- działanie wyłącznie na guild `1534228693017432124`;
- `/status`, `/panel-test`, select, modal, odśwież, usuń, restart procesu;
- brak tokenu w czacie / Git.

## Następny punkt kontrolny

1. Właściciel: lokalny `.env` wg `docs/discord/TEST_BOT_SETUP.md`
2. `pnpm discord:test:doctor` → `register` → `start`
3. Pełny live test na Discordzie
4. Potwierdzenie w czacie (Application ID / Bot User ID / Guild ID — bez sekretów)
5. Dopiero potem: PR oraz ewentualne wznowienie Zeabur

## Blokady

Live test wymaga lokalnego tokenu i signing secret w ignorowanym `.env`. Agent nie prosi o wklejenie tokenu do czatu.

## Ważna uwaga

Stary projekt nie definiuje architektury V2. Jest wyłącznie opcjonalną referencją dla wybranych wzorów.
