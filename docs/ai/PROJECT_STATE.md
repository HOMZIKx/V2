# Project State — V2

## Status

`P1_DISCORD_TEST_HARNESS_READY_FOR_CURSOR`

## Aktualny etap

Prompt 0 został zatwierdzony i scalony do `main` w PR #3. Fundament techniczny jest zamknięty. Następne zadanie przygotowuje pierwszy rzeczywiście działający bot V2 na dedykowanym serwerze testowym.

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
- wizja Desktop Companion / overlay (ADR-0006).

## Zamknięty etap

- **Task ID:** `P0-BOOTSTRAP-001`
- **Status:** `APPROVED_AND_MERGED`
- **PR:** `#3`
- **Merge commit:** `877c680f234836ab55c5c345abf0a2175c31c24f`

## Aktywne zadanie

- **Task ID:** `P1-DISCORD-TEST-HARNESS-001`
- **Status:** `READY_FOR_CURSOR`
- **Źródło:** `docs/ai/CHATGPT_TO_CURSOR.md`
- **Oczekiwany branch Cursora:** `cursor/p1-discord-test-harness`
- **Oczekiwany wynik:** Pull Request do `main`, bez samodzielnego scalenia.

## Cel aktywnego zadania

- bezpieczne połączenie `discord-gateway` z Discordem;
- działanie wyłącznie na guild `1534228693017432124`;
- guild-scoped commands bez global commands;
- `/status` i pierwszy panel `/panel-test`;
- select menu, przyciski i modal zgodne ze standardem UX;
- stateless signed custom IDs działające po restarcie;
- pełne testy bez tokenu w CI;
- obowiązkowy manualny live test przed audytem.

## Nadal niezaimplementowane

- Discord OAuth, Better Auth, sesje i MFA;
- docelowy system uprawnień;
- modele biznesowe i ORM;
- moduły wydarzeń, rezerwacji, LFG, moderacji, ticketów, muzyki, automatyzacji i analityki;
- RabbitMQ w funkcjach biznesowych;
- produkcyjny hosting lub deployment.

## Następny punkt kontrolny

Cursor implementuje P1, tworzy PR, przeprowadza manualny live test po lokalnym ustawieniu sekretów przez właściciela i zgłasza finalny PR do audytu ChatGPT.

## Blokady

Kod nie ma blokad. Rzeczywisty live test będzie wymagał ręcznego utworzenia/konfiguracji aplikacji w Discord Developer Portal i lokalnego ustawienia tokenu. Token nie może być przekazywany przez czat ani GitHub.

## Ważna uwaga

Stary projekt nie definiuje architektury V2. Jest wyłącznie opcjonalną referencją dla wybranych wzorów.
