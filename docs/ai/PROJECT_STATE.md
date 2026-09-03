# PROJECT_STATE

## Status

`preview/destiled-web`. SoT: `WEB_PRODUCT_DESIGN_AND_DELIVERY.md` (Phase gates +
D-061 immediate next). Bot Discord odłożony do akceptacji Web.

## Latest owner direction (2026-09-03)

- **DEC-066/067:** Timery ≠ Party — dopięte + spójność (osobny widok mapy Party,
  cross-linki, prune pinezek).
- **Timery UX:** Zbite → mini-mapa pinezki; zbity cel zjeżdża do sekcji
  odliczania; CH podświetla się w ostatnich 20% okna na innym kanale; ikony
  metin/boss (SVG z katalogu) + kontrast list.
- **EQ camp:** inventory siatka (Metin2-like, nielimitowana) w centrum; postacie
  wokół z 8 slotami; drag/tap; tryb ognisko + Start timer (running zablokowany);
  tło w stylu app (nie czarne); edycja bonusów z dumpa / obserwacji.
- **EQ (bonusy):** przy dodawaniu przedmiotu wybierasz subset bonusów z katalogu
  (w UI „kliknij”), a zapisane bonusy są traktowane jako „explicit” (nie nadpisujemy
  ich pełną drabinką z katalogu).
- **EQ (źródło bonusów):** dołączony `wiki-item-bonus-overrides.json` (pobrany z
  API pl-wiki Metin2, bez zgadywania) i podpięty jako nadrzędne źródło drabinek
  bonusów dla kart EQ.
- **DEC-068:** pełne drabinki bonusów wymagają nieuciętego dumpa / starego app.
- **Online persistence (MVP, dev):** dodany `player-team-service` + Web dev-safe snapshot persistence (bez włączania logowania).

## Marker

`READY_FOR_OWNER_REVIEW` + `DEC-066` + `DEC-067` + `DEC-068`
