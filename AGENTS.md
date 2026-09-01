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

## Szybki model pracy

Nie wykonuj pełnego ponownego odczytu repo przy każdym kroku.

### Kontynuacja tego samego zadania

Przeczytaj tylko:

1. `AGENTS.md`;
2. `.cursor/rules/00-project-constitution.mdc`;
3. `docs/ai/PROJECT_STATE.md`;
4. `docs/ai/CURSOR_TO_CHATGPT.md`;
5. dokument/spec/ADR bezpośrednio dotyczący zadania;
6. pliki zmienione od ostatniego checkpointu, jeśli kontynuujesz istniejący task.

Nie czytaj ponownie całego `PROJECT_CHARTER`, `DECISION_LOG`, wszystkich ADR-ów ani całego repo, jeśli nie ma niepewności lub konfliktu.

### Cold start / duża niepewność / nowy obszar

Dopiero wtedy rozszerz odczyt o:

- `docs/NON_NEGOTIABLES.md`;
- `docs/PROJECT_CHARTER.md`;
- `docs/DECISION_LOG.md`;
- `docs/architecture/SYSTEM_ARCHITECTURE.md`;
- tylko właściwe ADR-y;
- `docs/ai/WORKFLOW.md`;
- `docs/ai/PENDING_DECISIONS.md`.

Nie ma obowiązku czytania wszystkich ADR-ów przy każdym zadaniu.

## Tryby wykonania

### FAST — domyślny dla małych, jednoznacznych zmian

Przykłady: bugfix, copy, mały UI fix, test fix, drobny refactor, pojedynczy endpoint, dokumentacja.

- Nie przedstawiaj osobnego planu, jeśli zakres jest jednoznaczny.
- Zaimplementuj od razu.
- Uruchom tylko testy/typowanie/lint/build dotyczące zmienionego obszaru.
- Nie uruchamiaj pełnego `pnpm validate`.
- Nie aktualizuj `PROJECT_STATE.md` po każdej drobnej poprawce; aktualizuj przy checkpoint/handoff.

### STANDARD — zaakceptowany feature lub większa zmiana w jednym module

- Krótki plan tylko jeśli pomaga uniknąć ryzyka.
- Czytaj tylko SoT i ADR-y związane z modułem.
- Uruchom affected/targeted lint, typecheck, testy i build dla zmienionych projektów.
- Pełny `pnpm validate` nie jest wymagany po każdej iteracji.

### CHECKPOINT — koniec etapu, security boundary, merge/release readiness

Tutaj wykonaj pełne wymagane walidacje, w tym `corepack pnpm validate`, runtime/recovery/security odpowiednio do zakresu, zaktualizuj SoT i utwórz immutable checkpoint SHA.

## Autonomiczne wykonanie

Dla już zaakceptowanego zakresu:

- nie pytaj Ownera o zgodę na uruchamianie zwykłych komend;
- nie pytaj, czy kontynuować następną oczywistą część tego samego zadania;
- nie zatrzymuj się po testach, commitach, checkpointach lub technicznych fixach tylko po to, by czekać na potwierdzenie;
- wykonuj bezpieczne techniczne poprawki autonomicznie;
- uruchamiaj wymagane testy, commity i push automatycznie;
- niskiego ryzyka szczegóły implementacyjne i UX możesz rozstrzygać sam zgodnie z Accepted SoT.

Zatrzymaj się i poproś Ownera tylko gdy:

1. nowa lub istotnie zmieniona funkcja produktu wymaga discovery;
2. brakuje wymaganych sekretów/credentials/access, których nie da się bezpiecznie uzyskać;
3. wymagane jest nieodwracalne/destrukcyjne działanie poza repo;
4. istnieje realny konflikt Accepted SoT, bezpieczeństwa lub własności danych;
5. pojawia się CRITICAL/HIGH security/data-isolation blocker.

Jeśli jeden obszar jest zablokowany, kontynuuj niezależną bezpieczną pracę.

## Granice produktu

- Nowe duże zachowanie produktu: **NO OWNER DISCOVERY → NO IMPLEMENTATION**.
- To nie dotyczy jednoznacznych bugfixów, CI, security, recovery, refactorów i niskiego ryzyka microdetails zgodnych z zaakceptowanym kierunkiem.
- Nie zmieniaj samodzielnie granic usług, własności danych ani zaakceptowanych kontraktów domenowych.

## Git i PR

- Pracuj na gałęzi zadania; nie commituj bezpośrednio do `main`.
- Podczas aktywnych audytów: additive commits only.
- Bez `amend`, `rebase`, `force push`, `squash` i przepisywania checkpointów.
- Nie merguj samodzielnie PR do `main`.
- Continuous execution dla zaakceptowanego zakresu nie wymaga czekania na `APPROVED` po każdym technicznym checkpointcie; merge/final acceptance nadal wymaga zamknięcia audytów i Owner gate.

## Raportowanie

`CURSOR_TO_CHATGPT.md` ma być krótkim handoffem: co zrobiono, SHA, testy, blokery, co dalej. Nie twórz wielostronicowego raportu dla małego FAST tasku.

`PROJECT_STATE.md` aktualizuj przy istotnym checkpointcie, zmianie statusu modułu, nowym blockerze lub handoffie — nie po każdej drobnej zmianie.

## Granice referencji

Stary projekt jest wyłącznie referencją dla selektywnie ocenionych wzorów. Zakazane jest kopiowanie jego architektury, całego monorepo lub automatyczne powielanie jego decyzji.
