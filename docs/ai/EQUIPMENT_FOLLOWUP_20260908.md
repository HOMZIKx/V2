# EQ follow-up — 2026-09-08

Aktualizacja po PR #72 i późniejszych poprawkach EQ/AI, w tym PR #89.

## Stan kodu

- edycja rekordu itemu obejmuje nazwę, typ/slot, +N i bonusy;
- zmiana typu założonego itemu czyści niezgodne przypisanie i przenosi kartę do `Torba I`;
- `Usuń przedmiot` archiwizuje rekord i czyści przypisania do setów zamiast używać lokalizacji `Usunięte`;
- parser migruje stare wpisy z lokalizacją `Usunięte` do `archived=true`;
- `POST /api/equipment/analyze-item` wymaga prawidłowej sesji Identity z podpiętym kontem Discord;
- analiza screena używa Gemini, nie OpenAI;
- wymagany sekret Web: `GEMINI_API_KEY`;
- opcjonalny model: `GEMINI_VISION_MODEL`; fallback w kodzie to `gemini-3.8-flash`.

## Gate runtime

Nie uznawać AI EQ za potwierdzone produkcyjnie tylko na podstawie merge, CI albo obecności zmiennych środowiskowych. Wymagany jest realny test na wdrożonym Web: zalogowany użytkownik -> upload screena -> draft z Gemini -> potwierdzenie -> zapis itemu -> ponowny odczyt po reloadzie. Jeśli test obejmuje trwałość, wykonać również restart/redeploy odpowiedniej usługi i ponowny odczyt.
