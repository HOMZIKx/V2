# Cursor → ChatGPT

## Status

`READY_FOR_REVIEW`

## Task ID

`P2-IDENTITY-FOUNDATION-001` (**planning only**)

## Branch, commit i PR

- **Branch:** `planning/p2-identity-foundation`
- **Finalny commit:** `55a3549ee916a18586b06e66695ea21e29467159`
- **PR:** [#10](https://github.com/HOMZIKx/V2/pull/10) (draft, bez merge)

## Co zrobiono

Przygotowano **wyłącznie dokumentację** fundamentu Identity:

- Kompletny handoff: `docs/ai/P2_IDENTITY_FOUNDATION_HANDOFF.md`
- Architektura: `docs/architecture/IDENTITY_FOUNDATION.md`
- ADR **Proposed:** 0009 (granica Identity), 0010 (multi-provider), 0011 (sesje/transport)
- `PENDING_DECISIONS.md`: DEC-003 … DEC-009 z wariantami i rekomendacjami
- Aktualizacja `PROJECT_STATE.md`, `DECISION_LOG.md`, `SYSTEM_ARCHITECTURE.md`, `SERVICE_CATALOG.md`, `DATA_OWNERSHIP.md`
- Ten raport + brief audytowy w `CHATGPT_TO_CURSOR.md`

## Czego NIE zrobiono (świadomie)

- Brak implementacji kodu P2
- Brak zależności Better Auth / OAuth w lockfile
- Brak zmian `NON_NEGOTIABLES` (wymaga DEC-003)
- Brak merge
- Brak startu P3 / RBAC / MFA / Zeabur

## Weryfikacja repo przed rekomendacjami tech

| Fakt                     | Wynik                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `identity-service`       | Szkielet health only                                                                 |
| `better-auth` w lockfile | Brak                                                                                 |
| D-019 Better Auth        | ACCEPTED historycznie — **ponownie otwarte** jako DEC-004                            |
| D-016 Discord-only       | ACCEPTED — **konflikt** z briefem P2 → DEC-003                                       |
| Sesje Redis / cookie     | D-020 ACCEPTED — rekomendacja potwierdzenia DEC-008 (opaque), nie JWT w przeglądarce |

## Rekomendacje (nie decyzje)

1. Przyjąć **DEC-003 B** (multi-provider) albo **C** (Discord wymagany do pierwszego konta) — inaczej P2 Google jest sprzeczne z konstytucją.
2. **DEC-004:** spike Better Auth vs lżejszy stack OAuth+session przed Accepted ADR.
3. **DEC-005 A:** bez auto-link po emailu.
4. **DEC-007 A:** implementacja P2 dopiero po P1 APPROVED+merge i APPROVED planu.
5. **DEC-008 A / DEC-009 A:** opaque cookie session; krótki JWT tylko jako internal context.

## Definition of Done tego PR planistycznego

- Dokumentacja kompletna względem briefu właściciela
- PENDING wypełnione
- PR do `main` bez merge
- Stan projektu: oczekiwanie na audyt ChatGPT

## Prośba do ChatGPT

1. Audyt pakietu planistycznego.
2. Rozstrzygnięcie lub priorytetyzacja DEC-003 … DEC-009 z właścicielem.
3. Po akceptacji: `APPROVED` planu + brief implementacyjny (osobno).
4. Nie zlecać implementacji P2 w tym samym kroku co sam audyt planu, jeśli DEC-003/004 otwarte.
