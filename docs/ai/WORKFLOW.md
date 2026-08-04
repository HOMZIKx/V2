# Workflow ChatGPT ↔ Cursor ↔ GitHub

## Role ChatGPT

- prowadzi dialog produktowy i architektoniczny z właścicielem;
- zapisuje zatwierdzone ustalenia w repozytorium;
- przygotowuje precyzyjne zadania i kryteria akceptacji;
- audytuje kod, dokumentację, testy, commity i Pull Requesty;
- przygotowuje poprawki lub kolejny etap.

## Role Cursora

- czyta konstytucję, ADR-y i aktualny stan projektu;
- przygotowuje plan przed implementacją;
- implementuje wyłącznie zatwierdzony zakres;
- wykonuje testy i kontrole jakości;
- aktualizuje dokumentację i raportuje wynik;
- nie podejmuje samodzielnie decyzji zastrzeżonych dla właściciela.

## GitHub jako źródło prawdy

Kod, dokumentacja, decyzje i raporty są wersjonowane w Git. Historia czatów nie jest źródłem prawdy.

## Statusy zadań

- `DRAFT`
- `READY_FOR_CURSOR`
- `IN_PROGRESS`
- `BLOCKED`
- `READY_FOR_REVIEW`
- `CHANGES_REQUIRED`
- `APPROVED`
- `CLOSED`

Cursor nie rozpoczyna kolejnego dużego etapu bez `APPROVED` dla poprzedniego.

## Pliki komunikacyjne

### `CHATGPT_TO_CURSOR.md`

Zawiera bieżące zadanie: cel, kontekst, zakres, poza zakresem, kryteria akceptacji, wymagane testy, dokumenty do przeczytania i operacje zabronione.

### `CURSOR_TO_CHATGPT.md`

Zawiera raport: status, commit, zmienione pliki, wykonane i niewykonane elementy, wyniki testów, założenia, odstępstwa, dług techniczny i pytania.

### `PENDING_DECISIONS.md`

Zawiera nierozstrzygnięte decyzje blokujące pracę. Cursor nie zamienia ich w własne założenia.

### `PROJECT_STATE.md`

Zawiera aktualny stan platformy i musi być aktualizowany po każdym zatwierdzonym etapie.

## Protokół zadania

1. ChatGPT zapisuje lub przygotowuje zadanie.
2. Właściciel zatwierdza zadanie.
3. Cursor odczytuje dokumenty nadrzędne i przedstawia plan.
4. Cursor implementuje na osobnej gałęzi.
5. Cursor uruchamia testy i zapisuje raport.
6. Cursor tworzy commit lub Pull Request.
7. ChatGPT audytuje realne zmiany w repozytorium.
8. Właściciel podejmuje decyzje dotyczące konfliktów i zakresu.
9. Dopiero po `APPROVED` rozpoczyna się kolejny etap.

## Zasada dowodów

Stwierdzenie „gotowe” nie jest wystarczające. Raport musi zawierać dokładne polecenia, wyniki testów, listę plików, commit SHA oraz znane ograniczenia.
