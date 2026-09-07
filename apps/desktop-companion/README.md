# DESTILED Companion — Windows prototype

Minimalny uruchamialny klient desktopowy V2. Nie ingeruje w proces gry i nie automatyzuje rozgrywki.

## Uruchomienie

Na Windows 10/11 uruchom dwuklikiem:

```text
Start-DestiledCompanion.cmd
```

Launcher startuje Windows PowerShell 5.1 w trybie STA i omija lokalną politykę wykonywania tylko dla tego procesu.

Po uruchomieniu:
- panel jest widoczny od razu, nawet jeśli klient gry nie działa;
- Companion szuka widocznego okna o tytule zawierającym `Metin2`, `Projekt Hard` albo `Project Hard`;
- po wykryciu gry panel przykleja się do prawego górnego rogu okna;
- `Ctrl+Shift+D` pokazuje lub ukrywa panel;
- ikona w zasobniku systemowym pozwala pokazać/ukryć lub zamknąć aplikację;
- przyciski `Timery`, `Party / Mapy` i `WWW` otwierają odpowiednie moduły `https://desapp.zeabur.app`.

## Diagnostyka

Aplikacja zapisuje log tutaj:

```text
%LOCALAPPDATA%\DestiledCompanion\companion.log
```

Jeżeli start się nie powiedzie, zamiast cichego zamknięcia wyświetlany jest komunikat z błędem i ścieżką logu.

## Ręczny wzorzec tytułu gry

Jeżeli launcher Projekt Hard ma inny tytuł okna, można uruchomić:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File .\Start-DestiledCompanion.ps1 -WindowTitlePattern "(?i)TU_WPISZ_FRAGMENT_TYTULU"
```

## Zakres v0.1

To jest stabilny shell startowy: okno, tray, globalny skrót, wykrywanie/śledzenie okna gry, logowanie błędów i wejścia do modułów WWW. Synchronizacja danych i natywne widgety V2 są kolejną warstwą i nie są w tej wersji udawane atrapami.
