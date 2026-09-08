# EQ follow-up — 2026-09-08

Follow-up po merge PR #72.

Zakres pozostający na branchu `feat/equipment-inventory-screenshot-import-20260908` ponad `preview/destiled-web`:

- pełna edycja tego samego rekordu itemu: nazwa, typ/slot, +N, bonusy;
- zmiana typu założonego itemu czyści niezgodne przypisanie i przenosi kartę do `Torba I`;
- `Usuń przedmiot` archiwizuje rekord i czyści wszystkie przypisania do setów zamiast używać lokalizacji `Usunięte`;
- parser migruje stare wpisy z lokalizacją `Usunięte` do `archived=true`;
- `POST /api/equipment/analyze-item` wymaga prawidłowej sesji Identity z podpiętym kontem Discord przed użyciem OpenAI.

Nie uznawać runtime AI za potwierdzony, dopóki `OPENAI_API_KEY` nie jest skonfigurowany w produkcyjnej usłudze Web i nie przejdzie realny import screena.
