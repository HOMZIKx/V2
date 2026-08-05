# Project State — V2

## Status

`P1_DISCORD_TEST_HARNESS_READY_FOR_REVIEW`

## Aktualny etap

P1 Discord Test Harness zakończony lokalnym live testem (sukces). PR do `main` w toku audytu. Zeabur odłożony.

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
- ADR-0008 (Zeabur) — dokumentacja; **wdrożenie deferred**.

## Zamknięty etap

- **Task ID:** `P0-BOOTSTRAP-001`
- **Status:** `APPROVED_AND_MERGED`
- **PR:** `#3`

## Aktywne zadanie

- **Task ID:** `P1-DISCORD-TEST-HARNESS-001`
- **Status:** `READY_FOR_REVIEW`
- **Branch:** `cursor/p1-discord-test-harness`
- **Live test:** sukces na guild `1534228693017432124` (potwierdzenie właściciela)
- **Application ID / Bot User ID:** `1534432424094728364`
- **Zeabur:** DEFERRED (DEC-001)
- **Pull Request:** [#9](https://github.com/HOMZIKx/V2/pull/9) — draft, **bez merge** do czasu `APPROVED`
- **Finalny commit:** `216b80952143ca3547fe9b6feb9d35f6e1b290f2`
- **CI:** zielone na HEAD (Quality gates, Secret scan, Infrastructure)

## Nadal niezaimplementowane

- Discord OAuth, Better Auth, sesje i MFA;
- docelowy RBAC;
- modele biznesowe i ORM;
- moduły wydarzeń / LFG / moderacji itd.;
- wdrożenie Zeabur (wstrzymane).

## Następny punkt kontrolny

Audyt ChatGPT PR P1 → `APPROVED` / merge. Nie rozpoczynać kolejnego dużego etapu bez statusu `APPROVED`.

## Ważna uwaga

Stary projekt nie definiuje architektury V2.
