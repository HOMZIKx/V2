# Centrum Aktywności — Discord UX (P4)

## Status

`PRODUCT_ACCEPTED skeleton — visible assets OWNER_DECISION_REQUIRED (Issue #12)`

Szkielet interakcji zgodny z decyzjami właściciela. **Bez** finalnych kolorów,
emoji, bannerów i copy poza zaakceptowanymi etykietami funkcji.
Zgodność: `docs/ux/DISCORD_POST_INTERACTION_STANDARD.md`, D-023, D-024.

## Zaakceptowane etykiety funkcji (nie assety)

Główny panel: **Utwórz aktywność** | **Szukam ekipy** | **Moje aktywności** |
**Powiadomienia**.

Wydarzenie: **Zgłoś**; kontakt z organizatorem; pełna lista uczestników (funkcja).

Odpowiedniki statusów (konfigurowalne): Będę / Może będę / Nie będę;
po zmianie terminu: Wymaga potwierdzenia.

## Cel

Jeden publiczny, stabilny post Centrum na dozwolonym kanale. Osobiste
potwierdzenia i błędy = ephemeral. Bot aktualizuje ten sam post wydarzenia
zamiast publikować kolejne statusowe wiadomości.

## Główny panel Centrum

1. Nagłówek / tytuł modułu — copy = `OWNER_DECISION_REQUIRED`.
2. Krótki opis — `OWNER_DECISION_REQUIRED`.
3. Banner opcjonalny — tylko po Issue #12.
4. Akcje: Utwórz aktywność; Szukam ekipy; Moje aktywności; Powiadomienia
   (native select i/lub buttons — `OWNER_DECISION_REQUIRED` dla layoutu wizualnego).
5. Footer/status tylko gdy niesie stan (np. Authz unavailable).

**Szukam ekipy** = uproszczona, szybka ścieżka tworzenia **tej samej** aktywności
(nie osobny produkt).

## Formularz tworzenia (prywatny)

- Jeden większy formularz / modal — **nie** kreator krok po kroku.
- Anuluj + powrót do panelu głównego.
- **Bez** zbędnego przycisku „Wstecz” w jednym formularzu.
- Szkic niedokończony: 24 h.
- Przed publikacją: podgląd.
- Pola obowiązkowe: nazwa, rodzaj, termin, serwer, kanał publikacji.
- Opcjonalne: opis, koniec / czas trwania, pola z katalogu, limit, pingi (≤2),
  współorganizator, VC istniejący, prywatność (od P4.6).

## Post wydarzenia

- Kompaktowy; organizator widoczny; przycisk kontaktu.
- RSVP / zmiana statusu; lista (skrót + pełna lista).
- Zarządzanie organizatora pod postem **oraz** w Moje aktywności.
- Opcjonalny wątek = rozmowa uczestników.
- Przycisk **Zgłoś** (katalog powodów + Inny powód).
- Accent / emoji / ikony = `MODULE_ACCENT_PENDING` / Issue #12.

## Stany obowiązkowe

| Stan              | Publiczne                      | Ephemeral                                      |
| ----------------- | ------------------------------ | ---------------------------------------------- |
| loading           | Discord deferred               | —                                              |
| empty             | copy `OWNER_DECISION_REQUIRED` | —                                              |
| success           | update in-place                | potwierdzenie                                  |
| validation error  | —                              | powód                                          |
| authz unavailable | niedostępność panelu           | explain                                        |
| deny              | —                              | brak uprawnienia                               |
| destructive       | —                              | confirm (anuluj / usuń uczestnika / przejęcie) |

## Publikacja panelu (TECHNICAL_OPEN szczegół)

Produkt wymaga stałego posta i update in-place. Dokładny mechanizm
(slash operatora vs auto przy starcie) = dawne P4-D6 / TECHNICAL_OPEN.
`/panel-test` P1 **nie** jest produkcyjnym Centrum.

## Mobile

Select/button → jedna akcja → ephemeral/modal. Bez łańcuchów publicznych
wiadomości i bez reakcji emoji jako nawigacji.

## Test plan UX (po implementacji P4.2)

- Desktop + mobile Discord.
- Deny / allow / stale Authz.
- Double interaction nie duplikuje create/RSVP.
- Restart gateway; signed custom IDs.
- Empty / long participant list / waitlist advance notification.
