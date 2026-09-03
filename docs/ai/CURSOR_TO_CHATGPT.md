# Cursor → Owner

## Status

Przeanalizowałem EQ/postacie vs Projekt Hard i naprawiłem konkretne błędy logiki
(nie tylko copy). CI Quality gates wcześniej padło na Prettier docs — też
ogarnięte w tym torze.

## Co naprawione

- Reset timerów PH: jazda 23 h, Biolog/księga o północy
- Inbox zaproszeń / akceptacja tylko przez odbiorcę
- Konflikt tej samej karty EQ na dwóch postaciach
- Create character: unikalne ID + startowe timery PH
- Aktywny set zapisuje się; notatka na karcie EQ; puste sloty ≠ „Brak”
- Rozróżnienie: **Timery** (metiny) vs **Postęp Projekt Hard** (Biolog/jazda/księgi)

## Nadal open

- Spójne pozy class×gender (DEC-065)
- API / bot reminders / Zeabur
- Minimapy lochów małp z lokalnego dumpa

## Marker

`READY_FOR_OWNER_REVIEW`
