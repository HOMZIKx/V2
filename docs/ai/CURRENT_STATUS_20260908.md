# DESTILED — current status — 2026-09-08

Ten plik jest bieżącym krótkim źródłem statusu po dzisiejszych merge'ach. Starsze handoffy i audyty w `docs/ai/` pozostają historią i nie powinny nadpisywać tego stanu.

## Zmergowane do `preview/destiled-web`

| Obszar | Stan kodu | Stan produkcyjnego runtime |
| --- | --- | --- |
| PR #86 — dzienne PW timerów + Kingdom War | MERGED; CI green | WYMAGA live proof po deployu |
| PR #88 — aktywność rozdzielona per guild | MERGED | WYMAGA proof na realnych danych obu guildów |
| PR #89 — analiza screena EQ przez Gemini | MERGED | WYMAGA realnego importu screena i trwałego zapisu |
| PR #90 — avatary Discord w rankingach | MERGED | WYMAGA sprawdzenia po deployu na realnym rankingu |

## Twarde zasady statusu

- `MERGED`, zielone CI, HTTP 200/201 ani obecność zmiennej środowiskowej nie oznaczają automatycznie `DONE` produkcyjnie.
- Funkcję oznaczamy jako produkcyjnie potwierdzoną dopiero po przejściu pełnego przepływu użytkownika.
- Jeżeli funkcja zapisuje stan, proof ma obejmować ponowny odczyt; gdy istotna jest trwałość procesu/kontenera, także restart albo redeploy i ponowny odczyt.

## Najważniejsze brakujące proofy

1. **OAuth -> zapis -> trwałość**  
   Realny użytkownik zatwierdza Discord OAuth, powstaje sesja, Web zapisuje zmianę przez właściwy backend, po reloadzie dane istnieją; następnie restart/redeploy odpowiedniej usługi i ponowny odczyt.

2. **Nowe PW timerów / Kingdom War**  
   Sprawdzić na realnym Discordzie: godzina ustawiona przez ownera, wysyłka dziennego PW, edycja istniejącej wiadomości zamiast spamu, współdzielone wybory postaci oraz Kingdom War dokładnie T-30. Sprawdzić też trwałość registry przy restarcie Discord Gateway.

3. **AI EQ / Gemini**  
   Zalogowany użytkownik -> upload realnego screena -> draft Gemini -> korekta/potwierdzenie -> zapis itemu -> reload -> item nadal istnieje. Providerem jest Gemini. Web używa `GEMINI_API_KEY`; opcjonalnie `GEMINI_VISION_MODEL`.

4. **Aktywność per guild**  
   Na produkcji potwierdzić osobno Destiled i Projekt Sojusz: własne wiadomości, własny voice, własny Top 10, bez sumowania między guildami. Dodatkowo wykonać restart proof na niezerowych licznikach.

5. **Ranking z avatarami**  
   Po deployu sprawdzić, że realni użytkownicy mają poprawne avatary, a brak avatara nie psuje rankingu.

## Otwarte obszary funkcjonalne

- Metiny / Generały: pełny audyt implementacji względem aktualnych reguł map, kanałów, harmonogramów i całkowicie oddzielnych stanów polowań.
- EQ współdzielone: nie uznawać realtime collaboration za gotowe bez osobnego audytu transportu i konfliktów zapisu.
- Docelowy Activity SoT pozostaje osobnym długiem architektonicznym; bieżący persistent volume nie zastępuje migracji domenowej.

## Konfiguracja AI EQ

Aktualny endpoint: `apps/web/app/api/equipment/analyze-item/route.ts`.

- `GEMINI_API_KEY` — wymagany sekret usługi Web;
- `GEMINI_VISION_MODEL` — opcjonalny override modelu;
- fallback w kodzie: `gemini-3.8-flash`.

Nie używać już `OPENAI_API_KEY` / `OPENAI_VISION_MODEL` jako konfiguracji tego endpointu.
