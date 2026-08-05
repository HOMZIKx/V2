# PROJECT_STATE

## Status

`READY_FOR_RE-AUDIT` — plan P2 Identity Foundation zamknięty decyzjami właściciela
(2026-08-05); PR planistyczny #10 po sync z `main` (P1). Poprawki re-audytu
(CHANGES REQUIRED) w toku / po push.

## Active phase

P2 Identity Foundation — **planning close** (PR #10). Implementacja P2 **nie
rozpoczęta** i **zakazana** do czasu merge planu + osobnego PR implementacyjnego.

## Current objective

Domknąć niespójności dokumentacyjne z re-audytu P2 (PR body, D-017, ownership
sesji, tip SHA bez pętli). Status `READY_FOR_RE-AUDIT`. Bez merge, bez instalacji
Better Auth, bez kodu OAuth / sesji / DB / UI logowania.

## In scope now

- Poprawki docs z re-audytu „CHANGES REQUIRED przed merge”.
- ADR-0009 / 0010 / 0011 / 0012 Accepted; DEC-003–009 Accepted; D-016 SUPERSEDED.
- Walidacja dokumentów + push do PR #10; komentarz PR z finalnym HEAD / workflow
  (bez commitowania tip SHA w pętli).

## Out of scope now

- Instalacja Better Auth / jakiejkolwiek biblioteki auth.
- Implementacja OAuth, sesji, cookie, JWT, bazy Identity, ekranów logowania.
- Zmiany runtime Discord (P1 zamknięte na `main`).
- Admin override w Discord (DEC-002 / ADR-0007 — osobny tor, test guild only).
- Merge PR #10 do `main`.
- Deploy produkcyjny / Zeabur Identity (D-030 / DEC-001).
- P3 membership / guild-scoped revoke policy (DEC-006 C / zakres D-017 / ADR-0010).

## Blockers

Brak blokad decyzyjnych P2. Oczekiwanie na re-audit / APPROVED właściciela przed
merge planu.

## Decisions needed

Brak otwartych DEC dla zamknięcia planu P2. Pin wersji Better Auth — w PR
implementacyjnym. Guild-level revoke policy — P3 (`DEC-006 C` / zakres `D-017` /
ADR-0010).

## Branch / tip (bez pętli SHA)

- Branch: `planning/p2-identity-foundation`
- PR: #10
- Stabilny plan-close merge: `42b0fa2449994e6f4b435700fcaf85913dcd6082`
- Aktualny tip SHA i numery workflow CI: **źródło prawdy w GitHub** (PR Checks /
  Actions), nie w tym pliku.

## Next recommended step

Właściciel: re-audit poprawek → `APPROVED` → merge planu. Dopiero potem osobny PR
implementacyjny P2 (proof slice Better Auth za portami Identity).

## Last updated

2026-08-05 — Cursor (re-audit CHANGES REQUIRED)
