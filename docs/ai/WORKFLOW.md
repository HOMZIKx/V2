# Workflow ChatGPT ↔ Cursor ↔ GitHub

## Role ChatGPT

- prowadzi dialog produktowy i architektoniczny z właścicielem;
- zamyka duże decyzje produktowe przed implementacją;
- przygotowuje precyzyjne zadania i kryteria akceptacji;
- audytuje checkpointy i realne zmiany w repo;
- wykryte findings przekazuje jako kolejne additive fixy.

## Rola Cursora

- implementuje zaakceptowany zakres;
- rozstrzyga autonomicznie niskiego ryzyka szczegóły techniczne i UX zgodne z SoT;
- uruchamia proporcjonalne testy i kontrole jakości;
- nie wymyśla samodzielnie nowego dużego zachowania produktu;
- nie czeka na Ownera przy rutynowych komendach, testach, commitach, pushach i kolejnych oczywistych krokach zaakceptowanego zadania.

## GitHub jako źródło prawdy

Kod, dokumentacja, Accepted SoT, checkpointy i raporty są wersjonowane w Git/GitHub. Historia czatów nie jest źródłem prawdy.

## Zasada nadrzędna

**NO OWNER DISCOVERY → NO IMPLEMENTATION OF NEW MAJOR PRODUCT BEHAVIOR.**

Jednocześnie:

**Accepted scope → Cursor wykonuje ciągle i autonomicznie.**

Owner discovery gate dotyczy decyzji produktowych, a nie zwykłych bugfixów, CI, security, recovery, refactorów i microdetails.

## Trzy tryby pracy

### FAST

Domyślny dla jednoznacznych małych zmian: bugfix, copy/UI fix, test fix, drobny refactor, dokumentacja, pojedynczy endpoint.

Przebieg:

1. odczytaj bieżący task/state i tylko właściwy SoT;
2. implementuj bez osobnej ceremonii planowania;
3. uruchom targeted/affected testy i kontrole;
4. commit + push;
5. kontynuuj, jeśli zakres zadania nie jest jeszcze skończony.

Pełny `corepack pnpm validate` nie jest wymagany.

### STANDARD

Zaakceptowany feature lub większa zmiana w jednym module.

Przebieg:

1. odczytaj `AGENTS.md`, bieżący state/handoff i task-specific spec/ADR;
2. krótki plan tylko gdy istnieje realne ryzyko lub kilka sensownych ścieżek;
3. implementuj cały zaakceptowany zakres;
4. uruchom affected lint/typecheck/tests/build;
5. commit + push i krótki handoff.

Nie wykonuj ponownie pełnego odczytu wszystkich ADR-ów i dokumentów projektu bez potrzeby.

### CHECKPOINT

Koniec etapu, security boundary, runtime closure, merge/release readiness lub jawnie wymagany pełny audit.

Wtedy wykonaj pełne wymagane validation/security/runtime/recovery, zaktualizuj SoT, zapisz immutable checkpoint SHA i przygotuj materiał do audytu.

## Continuous execution

Owner amendment: dla już zaakceptowanego zakresu Cursor może i powinien przechodzić przez kolejne techniczne zadania bez czekania na ręczny audit poprzedniego checkpointu, o ile nie istnieje blocker.

Nie obowiązuje już stara zasada „zawsze czekaj na APPROVED przed następną techniczną pracą”.

`APPROVED` nadal jest wymagane dla:

- merge/final acceptance;
- zamknięcia Owner gate;
- rozpoczęcia nowej dużej funkcji produktu, jeśli discovery nie zostało wcześniej zamknięte.

## STOP conditions

Cursor zatrzymuje normalny ciąg tylko przy:

- CRITICAL security finding;
- HIGH security/data-isolation finding;
- realnym ryzyku utraty/korupcji danych;
- nieodwracalnym/destrukcyjnym działaniu wymagającym Ownera;
- braku niezbędnych credentials/access;
- sprzeczności Accepted SoT, której nie da się bezpiecznie rozstrzygnąć;
- rzeczywistym `OWNER_DECISION_REQUIRED` dotyczącym dużego zachowania produktu.

Jeśli blocker dotyczy tylko części zadania, Cursor kontynuuje niezależną bezpieczną pracę.

## ROLLING AUDIT MODE

1. Istotny zakończony zakres ma immutable checkpoint SHA.
2. ChatGPT może audytować wcześniejszy checkpoint, gdy branch jest już dalej.
3. Findings są naprawiane additive commits na aktualnej linii historii.
4. HIGH/CRITICAL ma pierwszeństwo przed normalnym developmentem.
5. Podczas audit queue: bez amend, rebase, force push, squash i przepisywania historii.
6. Merge nadal wymaga zamknięcia wszystkich blockerów i finalnego Owner/ChatGPT acceptance.

## Walidacja — zasada proporcjonalności

Nie uruchamiaj najdroższej walidacji po każdej zmianie.

- FAST → targeted/affected checks.
- STANDARD → affected lint/typecheck/tests/build + potrzebne integration tests.
- CHECKPOINT → pełny `corepack pnpm validate` oraz runtime/security/recovery adekwatnie do etapu.

Pełne validate można uruchomić wcześniej, jeśli zmiana dotyka szerokiego trust boundary lub istnieje realne ryzyko regresji przekrojowej.

## Pliki komunikacyjne

### `CHATGPT_TO_CURSOR.md`

Bieżące zadanie i kryteria. Nie musi być przepisywane dla każdego małego continuation tasku, jeśli prompt i SoT są jednoznaczne.

### `CURSOR_TO_CHATGPT.md`

Krótki handoff: status, checkpoint/commit, najważniejsze zmiany, testy, blokery, następny krok. Nie twórz rozbudowanego raportu dla FAST tasków.

### `PENDING_DECISIONS.md`

Tylko rzeczywiste nierozstrzygnięte decyzje. Nie wrzucaj tam microdetails, które można bezpiecznie rozstrzygnąć zgodnie z Accepted SoT.

### `PROJECT_STATE.md`

Aktualizuj przy zmianie statusu modułu, istotnym checkpointcie, blockerze lub handoffie. Nie po każdej drobnej poprawce.

## Protokół zadania

1. Owner + ChatGPT zamykają duże decyzje produktu, jeśli są potrzebne.
2. Cursor bierze zaakceptowany task i wybiera FAST/STANDARD/CHECKPOINT.
3. Cursor czyta tylko kontekst potrzebny do bezpiecznej pracy.
4. Cursor implementuje autonomicznie.
5. Cursor uruchamia proporcjonalne validation.
6. Cursor commit/push bez pytania o rutynową zgodę.
7. Cursor kontynuuje zaakceptowany zakres, chyba że wystąpi STOP condition.
8. ChatGPT audytuje checkpointy asynchronicznie.
9. Merge/release/final acceptance następuje dopiero po zamknięciu audytów i Owner gate.

## Zasada dowodów

„Gotowe” musi być poparte kodem i odpowiednią walidacją, ale poziom raportowania ma być proporcjonalny do ryzyka. Dokładne pełne raporty są wymagane na CHECKPOINT, nie przy każdej drobnej iteracji.
