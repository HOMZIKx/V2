# Desktop Companion — wizja produktu

## Status

`FOUNDATIONAL — szczegóły UX odroczone do etapu modułu`

## Definicja

Desktop Companion to instalowana aplikacja V2 dla Windows, która wykrywa okno gry i wyświetla nad nim konfigurowalne widgety. Użytkownik uruchamia panel skrótem klawiszowym, wybiera akcję i wraca do gry bez przełączania się na Discord lub przeglądarkę.

Nie jest to samodzielny drugi bot. Jest to kolejny klient tego samego systemu.

## Wspólny system

```text
Nakładka V2 ↔ Backend V2 ↔ Bot Discord
                     ↕
                 Web / Admin
```

Przykład:

1. Użytkownik naciska skrót w grze.
2. Wybiera `Potrzebuję wsparcia`.
3. Backend waliduje sesję, uprawnienia, cooldown i dane zgłoszenia.
4. Zgłoszenie zostaje zapisane raz jako wspólny rekord.
5. Bot aktualizuje panel lub publikuje komunikat na Discordzie.
6. Inny użytkownik odpowiada na Discordzie.
7. Nakładka pokazuje zgłaszającemu, kto jedzie i jaki jest status.

## Założenia obowiązkowe

- Minimalna liczba kliknięć.
- Natychmiastowa i jasna informacja zwrotna.
- Brak automatyzowania gry.
- Brak ingerencji w pamięć procesu gry.
- Widgety są konfigurowalne: widoczność, pozycja, rozmiar, przezroczystość i skróty.
- Stałe widgety i chwilowe panele mogą współistnieć.
- Nakładka musi działać poprawnie na różnych DPI i konfiguracjach monitorów.
- Akcje i powiadomienia synchronizują się w obie strony z Discordem i WWW.
- Restart aplikacji lub bota nie może usuwać zgłoszeń ani powodować ich duplikacji.

## Przykładowe przyszłe widgety

Poniższa lista nie jest zatwierdzonym zakresem pierwszej wersji:

- szybkie wezwanie wsparcia;
- aktywne zgłoszenia i osoby odpowiadające;
- oznaczenie metina, bossa, rudy albo spotu;
- zajęcie lub zwolnienie spotu;
- status grupy i brakujące role/klasy;
- nadchodzące wydarzenie;
- pilne ogłoszenia liderów;
- skrócone powiadomienia z wybranych modułów platformy.

## Granica odpowiedzialności

Desktop Companion odpowiada za:

- prezentację widgetów;
- obsługę skrótów i interakcji użytkownika;
- bezpieczne przechowanie własnej sesji;
- wykrywanie i śledzenie okna gry;
- komunikację z publicznym API i kanałem real-time.

Backend odpowiada za:

- uprawnienia;
- walidację;
- dane i historię;
- synchronizację;
- idempotencję;
- reguły biznesowe;
- publikację zdarzeń do Discord Gateway i pozostałych klientów.

## Szczegóły do ustalenia później

Nie wybieramy jeszcze:

- konkretnego frameworka desktopowego;
- finalnych skrótów;
- finalnych widgetów;
- palety, rozmiarów i animacji;
- dokładnego sposobu wykrywania gry;
- obsługi trybu exclusive fullscreen.

Te decyzje zapadną przed implementacją modułu, po prototypie technicznym i makietach UX.
