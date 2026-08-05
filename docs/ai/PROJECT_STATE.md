# Project State — V2

## Status

`P2_IDENTITY_FOUNDATION_PLANNING_READY_FOR_REVIEW`

## Aktualny etap

Pakiet **planistyczny** P2 Identity Foundation oczekuje na audyt ChatGPT. **Brak implementacji P2.**  
P1 Discord Test Harness: osobny PR (#9) — nadal wymaga `APPROVED` / merge (patrz DEC-007).

## Zatwierdzone

- wizja i model produktu;
- jedna organizacja i wiele serwerów Discord;
- hybrydowy profil użytkownika;
- pełna platforma WWW + Discord;
- model uprawnień (docelowy — niezaimplementowany);
- mikrousługi;
- główny stos TypeScript;
- monorepo pnpm + Nx;
- własność danych;
- REST/OpenAPI + RabbitMQ;
- backend Node/Nest/Fastify;
- podział Web/Admin;
- historyczny model tożsamości D-016…D-020 (**część pod rewizją w DEC-003+**);
- trwały protokół pracy AI;
- standardy jakości, testów i lokalnej infrastruktury;
- standard postów i interakcji Discord (D-023);
- oryginalna identyfikacja wizualna V2 (D-024);
- dedykowany serwer testowy Discord `1534228693017432124`;
- wizja Desktop Companion / overlay (ADR-0006);
- Discord test harness P1 (ADR-0007) — na `main` wg stanu merge;
- ADR-0008 (Zeabur) — dokumentacja; **wdrożenie deferred**.

## Zamknięty etap

- **Task ID:** `P0-BOOTSTRAP-001`
- **Status:** `APPROVED_AND_MERGED`
- **PR:** `#3`

## Aktywne zadanie (planowanie)

- **Task ID:** `P2-IDENTITY-FOUNDATION-001`
- **Status:** `READY_FOR_REVIEW` (planning only)
- **Branch:** `planning/p2-identity-foundation`
- **Handoff:** `docs/ai/P2_IDENTITY_FOUNDATION_HANDOFF.md`
- **ADR Proposed:** 0009, 0010, 0011
- **PENDING:** DEC-003 … DEC-009
- **Pull Request:** [#10](https://github.com/HOMZIKx/V2/pull/10) — draft, **bez merge**
- **Finalny commit:** `38dd7b35279086fe3c202d10727d579e05f90c9a`

## Równoległy kontekst P1

- **Task ID:** `P1-DISCORD-TEST-HARNESS-001`
- **Status:** oczekuje `APPROVED` / merge (PR #9 na osobnej gałęzi)
- **Uwaga:** Workflow zabrania startu **implementacji** P2 bez APPROVED poprzedniego etapu (DEC-007).

## Nadal niezaimplementowane

- Identity OAuth / sesje / profil (P2 — po APPROVED planu);
- MFA;
- RBAC / authorization-service;
- modele biznesowe poza szkieletem;
- Zeabur (deferred);
- moduły produktowe.

## Następny punkt kontrolny

Audyt ChatGPT pakietu planistycznego P2 → decyzje DEC-* → `APPROVED` planu → dopiero brief implementacyjny.  
Nie rozpoczynać P3. Nie implementować P2 w tym PR.
