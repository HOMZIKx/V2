# V2 — zasady pracy

## NAJWYŻSZY PRIORYTET: ciągłość poprawek

Każdy ChatGPT, Cursor, Codex, agent AI i kolejna sesja pracująca nad tym repo ma obowiązek traktować `docs/ai/FIX_LOG.md` jako podstawowy rejestr wykonanych napraw.

**Zasada bez wyjątków:** zadanie obejmujące poprawkę, hotfix, naprawę błędu, zmianę integracji, poprawkę CI/deploymentu lub usunięcie blockera NIE jest zakończone, dopóki odpowiedni wpis nie zostanie dopisany do `docs/ai/FIX_LOG.md`.

Przed rozpoczęciem zmian należy sprawdzić najnowsze wpisy w `FIX_LOG.md`, aby:

- nie powtarzać już wykonanej pracy;
- nie przywracać wcześniej usuniętych błędów;
- znać niepotwierdzone ryzyka i niedokończone przepływy E2E;
- kontynuować od faktycznego stanu repo i deploymentu, a nie od założeń z wcześniejszego chatu.

Jeżeli dokumentacja projektu, opis PR, poprzedni chat lub założenie agenta jest sprzeczne z nowszym potwierdzonym wpisem w `FIX_LOG.md`, najpierw zweryfikuj stan kodu/runtime. Nie wolno automatycznie nadpisywać nowszej poprawki starszym założeniem.

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
2. `docs/ai/FIX_LOG.md` — **obowiązkowo; najpierw najnowsze wpisy i wpisy `PARTIAL`, `BLOCKED`, `REGRESSION`**;
3. `.cursor/rules/00-project-constitution.mdc`;
4. `docs/NON_NEGOTIABLES.md`;
5. `docs/PROJECT_CHARTER.md`;
6. `docs/DECISION_LOG.md`;
7. `docs/architecture/SYSTEM_ARCHITECTURE.md`;
8. wszystkie ADR-y w `docs/architecture/decisions/`;
9. `docs/ai/WORKFLOW.md`;
10. `docs/ai/PROJECT_STATE.md`;
11. `docs/ai/PENDING_DECISIONS.md`.

## Protokół pracy Cursor / ChatGPT / Codex / AI

- Pracuj na osobnej gałęzi zadania, jeśli charakter pracy tego wymaga; nie commituj bezpośrednio do `main`.
- Przed implementacją sprawdź `docs/ai/FIX_LOG.md` i ustal, czy problem nie był już wcześniej naprawiany lub częściowo naprawiany.
- Przed implementacją przedstaw plan, zakres, elementy poza zakresem,
  zmieniane usługi, dane, kontrakty, ryzyka i decyzje wymagające właściciela, jeśli zadanie nie jest prostym hotfixem.
- Wykonuj wyłącznie zatwierdzony zakres. Konflikt z konstytucją, bezpieczeństwem,
  architekturą, własnością danych lub zakresem zapisz w
  `docs/ai/PENDING_DECISIONS.md`.
- Nie uznawaj funkcji za działającą wyłącznie dlatego, że ekran istnieje, request zwraca HTTP 200, test jednostkowy jest zielony albo deployment ma status success. Dla funkcji produkcyjnych weryfikuj pełny przepływ tak daleko, jak pozwala dostęp: `WWW → API → DB → reload/restart → API → WWW`, a dla Discord również `WWW/API → bot/gateway → Discord`.
- Po zmianach uruchom odpowiednie `format:check`, lint, typecheck, testy,
  kontrolę architektury i build; następnie zaktualizuj `PROJECT_STATE.md` oraz
  `CURSOR_TO_CHATGPT.md`, jeżeli dotyczy.
- **Po KAŻDEJ poprawce dopisz wpis do `docs/ai/FIX_LOG.md` przed uznaniem zadania za zakończone.** Wpis ma zawierać problem, przyczynę, rozwiązanie, pliki, commit/PR, walidację, deployment/runtime oraz pozostałe ryzyka.
- Jeżeli poprawka jest tylko częściowo potwierdzona, użyj statusu `PARTIAL` lub `BLOCKED`; nie zapisuj `DONE` na podstawie samego builda lub deployu.
- Utwórz PR do `main` bez samodzielnego merge, jeśli obowiązuje standardowy proces głównej gałęzi. Następnego dużego etapu nie
  zaczynaj przed statusem `APPROVED`, jeśli taki gate jest wymagany dla danego etapu.

## Granice referencji

Stary projekt jest wyłącznie referencją dla selektywnie ocenionych wzorów.
Zakazane jest kopiowanie jego architektury, całego monorepo lub automatyczne
powielanie jego decyzji.
