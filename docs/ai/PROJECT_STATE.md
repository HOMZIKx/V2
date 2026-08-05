# Project State — V2

## Status

`P1_DISCORD_TEST_HARNESS_READY_FOR_RE-AUDIT`

## Aktualny etap

Żywy bot na `cursor/p1-discord-test-harness` serwuje **Components V2** (stary proces na :4100 zabity i zastąpiony). PR #9 bez merge.

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
- model tożsamości, MFA i sesji (docelowy — niezaimplementowany);
- trwały protokół pracy AI;
- standardy jakości, testów i lokalnej infrastruktury;
- standard postów i interakcji Discord (D-023);
- oryginalna identyfikacja wizualna V2 (D-024);
- dedykowany serwer testowy Discord `1534228693017432124`;
- wizja Desktop Companion / overlay (ADR-0006);
- Discord test harness P1 (ADR-0007) — remediacja Components V2 w toku audytu;
- ADR-0008 (Zeabur) — dokumentacja; **wdrożenie deferred**.

## Zamknięty etap

- **Task ID:** `P0-BOOTSTRAP-001`
- **Status:** `APPROVED_AND_MERGED`
- **PR:** `#3`

## Aktywne zadanie

- **Task ID:** `P1-DISCORD-TEST-HARNESS-001`
- **Status:** `READY_FOR_RE-AUDIT`
- **Branch:** `cursor/p1-discord-test-harness`
- **Pull Request:** [#9](https://github.com/HOMZIKx/V2/pull/9) — **bez merge**
- **Tip (live V2 bot):** `68303c2c833e53606ce1344309e5acb50c1829b9`
- **Finalny commit (remediation):** `4ae207a4f70a6c3e6175a4f36cd324b1f8921c03`
- **Zmiana UX:** publiczny `/panel-test` = Components V2 Container (bez legacy embed)
- **Zeabur:** DEFERRED (DEC-001)

## Nadal niezaimplementowane

- Discord OAuth, sesje platformowe, MFA;
- RBAC;
- modele biznesowe i ORM;
- moduły produktowe;
- wdrożenie Zeabur (wstrzymane).

## Następny punkt kontrolny

Ponowny audyt ChatGPT PR #9. Nie merge. Nie startować implementacji P2 z tego PR.
