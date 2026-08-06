# Centrum Aktywności — WWW i Admin (P4 outline)

## Status

`PRODUCT_ACCEPTED scope — UI copy/assets OWNER_DECISION_REQUIRED`

Discord i WWW dzielą backend, dane i reguły. Brak osobnego modelu RSVP/limitów.

## WWW — pierwszy zakres (P4.4)

W zakresie:

- przeglądanie aktywności;
- zapis i zmiana statusu RSVP;
- Moje aktywności (utworzone / zapisane / zakończone / anulowane);
- powiadomienia panelowe (wspólna skrzynka z Discordem).

Poza pierwszym zakresem WWW:

- tworzenie aktywności (pozostaje na Discordzie w P4.4);
- serie, multi-discord admin UX, Desktop.

Wymagania: sesja Identity + Authz `permission.platform.login.www` oraz te same
permission checks co Discord dla mutacji.

## Admin — podstawowy zakres (P4.3)

Konfiguracja (bez pełnego panelu platformy):

- rodzaje aktywności;
- statusy + flaga „zajmuje miejsce”;
- katalog pól uczestnika;
- dozwolone kanały publikacji (per Discord);
- dozwolone pingi;
- limity;
- dostępność „Innej aktywności” (per serwer);
- przypomnienia domyślne;
- czas przechowywania posta Discord;
- powody zgłoszeń (+ Inny powód).

Widoczne etykiety Admin UI = `OWNER_DECISION_REQUIRED` (poza nazwami funkcji
już ustalonymi w produkcie).
