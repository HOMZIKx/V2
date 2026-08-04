# V2 — zasady pracy

## Lokalnie

Folder roboczy: `C:\Users\mateu\OneDrive\Pulpit\NowyTematV2`  
Repo: `https://github.com/HOMZIKx/V2.git`

## Cel

Budujemy **nową aplikację od zera** w tym repo.

## Referencja (stary projekt)

Folder wzorów: `C:\Users\mateu\OneDrive\Pulpit\Nowy folder\Aplikaja-gildii-main`

- Wolno: czytać i kopiować wzory (komponenty, CSS, endpointy, copy, assety) — selektywnie.
- Nie wolno: przenosić całego starego monorepo.
- Kod i commit tylko w V2 / `NowyTematV2`.

## Deploy

Osobny Zeabur project — nie mieszać ze starym `dobry-temat`.

## Obowiązkowa kolejność czytania

Przed rozpoczęciem pracy przeczytaj:

1. `AGENTS.md`;
2. `.cursor/rules/00-project-constitution.mdc`;
3. `docs/NON_NEGOTIABLES.md`;
4. `docs/PROJECT_CHARTER.md`;
5. `docs/DECISION_LOG.md`;
6. `docs/architecture/SYSTEM_ARCHITECTURE.md`;
7. wszystkie ADR-y w `docs/architecture/decisions/`;
8. `docs/ai/WORKFLOW.md`;
9. `docs/ai/PROJECT_STATE.md`;
10. `docs/ai/PENDING_DECISIONS.md`.

## Protokół pracy Cursor

- Pracuj na osobnej gałęzi zadania; nie commituj bezpośrednio do `main`.
- Przed implementacją przedstaw plan, zakres, elementy poza zakresem,
  zmieniane usługi, dane, kontrakty, ryzyka i decyzje wymagające właściciela.
- Wykonuj wyłącznie zatwierdzony zakres. Konflikt z konstytucją, bezpieczeństwem,
  architekturą, własnością danych lub zakresem zapisz w
  `docs/ai/PENDING_DECISIONS.md`.
- Po zmianach uruchom odpowiednie `format:check`, lint, typecheck, testy,
  kontrolę architektury i build; następnie zaktualizuj `PROJECT_STATE.md` oraz
  `CURSOR_TO_CHATGPT.md`.
- Utwórz PR do `main` bez samodzielnego merge. Następnego dużego etapu nie
  zaczynaj przed statusem `APPROVED`.

## Granice referencji

Stary projekt jest wyłącznie referencją dla selektywnie ocenionych wzorów.
Zakazane jest kopiowanie jego architektury, całego monorepo lub automatyczne
powielanie jego decyzji.
