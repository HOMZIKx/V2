# Cursor → Owner

## Status

Dopięta spójność Timery ↔ Party oraz EQ camp wg Twoich follow-upów.

### Timery (`/timers`)

- **Zbite** otwiera mini-okno z mapą (pinezka opcjonalna).
- Zbity cel **nie znika** — zjeżdża do „Odliczanie” z clockiem.
- Ostatnie **20% okna** na innym CH → podświetlenie kanału + banner.
- Ikony boss/metin (wygenerowane z katalogu; realne sprite’y można podmienić).
- Wyższy kontrast nazw, czasów i przycisków.

### Party (`/maps`)

- Twój wybór mapy = **widok osobisty** (nie nadpisuje mapy party automatycznie).
- Przyciski: skocz do mapy party / ustaw mój widok jako mapę party.
- Pinezki skauta TTL ~10 min + prune z localStorage.
- Cross-link do Timerów.

### EQ (karta postaci / obóz)

- Centrum = **inventory** (siatka slotów, dowolna liczba kart).
- Postacie wokół: max 8 slotów EQ; drag lub tap (mobile).
- Tryb **ognisko**: timery PH, Start = jeden klik, running zablokowany, Dodaj timer.
- Tło jak reszta app (nie czarne).
- Bonusy: nazwy wyłącznie z dumpa + ręczna obserwacja; przy dodawaniu przedmiotu
  wybierasz subset bonusów z katalogu (klik) i zapisane linie są traktowane jako
  „explicit” (nie nadpisujemy ich pełną drabinką); **DEC-068** — pełne drabinki
  po dostarczeniu nieuciętego eksportu ze starego dobry-temat.
- Źródło drabinek: `wiki-item-bonus-overrides.json` z publicznego API pl-wiki
  Metin2 (`action=parse`/`wikitext`) jako nadrzędne dane nad uciętym dumpem.

## Plan Web (SoT z gita)

Dalej wg `WEB_PRODUCT_DESIGN_AND_DELIVERY.md` / D-061: stabilizacja first-player

- create/edit setów/itemów/timerów za mockami. **Bez** API/Discord prod i bez
  bota, dopóki Web nie będzie zaakceptowany.
- Włączone dev-safe online persistence MVP (snapshot `PlayerStoreState` przez `player-team-service`)
  — login dalej wyłączony; używany demo header.

## Marker

`READY_FOR_OWNER_REVIEW` + `DEC-066` + `DEC-067` + `DEC-068`
