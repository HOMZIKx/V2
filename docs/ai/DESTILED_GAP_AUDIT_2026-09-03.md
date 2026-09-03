# DESTILED — audyt luk vs plan i runtime (2026-09-03)

Cel: uczciwa lista tego, co jest tip-top lokalnie, a czego brakuje do
prawidłowego działania **bota + aplikacji** zgodnie z D-038–D-061 / first-slice.

## Werdykt

Web first-slice to **dopracowany mock w przeglądarce** (localStorage), nie
produkcja. Bot Discord to **harness P1** (`/status`, `/panel-test`), nie
towarzysz timerów/EQ. Tip-top w sensie „wygląda i da się kliknąć lokalnie”
≠ tip-top „działa dla gildii na żywo”.

## A. Web — zrobione (lokalny mock)

| Obszar | Stan |
| --- | --- |
| Discord entry (symulowane outcome) | Jest |
| First-use: create workspace / invite | Jest w store + UI |
| Workspace → postać → EQ / timery postaci / notatki / historia | Jest (localStorage) |
| Katalog itemów + bonusy + ikony wiki | Jest (dobry-temat + pl-wiki) |
| Shared swords (Warrior/Ninja/Sura) | Zweryfikowane online |
| 8/8 class×gender PNG 272×360 | Jest (różne serie poz — patrz luka) |
| Timery metinów/bossów z katalogu dobry-temat | Jest pod `/maps`, nav **Timery**, default widok listy |
| Atlasy top-down 512×512 (nie panoramy) | 15 terenów + Grota; lochy małp = schemat; Loch Pająków = wiki |
| Honesty: pasek „Podgląd lokalny” | Jest |

## B. Web — braki / niespójności (nadal)

1. **Brak prawdziwego API / Identity / player-team service** — brak syncu między
   urządzeniami, lease’ów, autorytatywnego czasu serwera.
2. **Reminder Discord** (`reminderState`) — w demo często `unavailable` / `off`;
   brak ścieżki do gatewaya.
3. **Postacie: spójność wizualna poz** — męskie klasy to dynamiczne portrety
   klasowe; część damskich to inne serie (np. Desert costume). Wymaga jednej
   serii assetów (owner: lokalny dump / jedna linia wiki).
4. **Loch Małp (3 poziomy)** — brak oficjalnych minimap top-down; schematyczny
   atlas. Opcja: nadpisz z `dobry-temat/frontend/public`.
5. **Fixture Asteria / fake presence** — część starszych snapshotów nadal z
   hardcodem; główna ścieżka idzie przez `player-store`, ale leftover fixtures
   mogą mylić.
6. **Targ / Aktywność** — poza first-slice (D-049); poprawnie „później”.
7. **Mapy kooperacyjne realtime (D-048)** — UI party lokalne; bez WebSocket /
   Postgres / bot notifications.
8. **EQ readiness 6 stanów / Mark as moved / pełny CRUD** — częściowo vs kontrakt.
9. **Zeabur** — DEC-001 deferred.

## C. Bot (`discord-gateway`) — wymagane do „prawdziwego” działania

| Potrzeba produktu | Stan dziś |
| --- | --- |
| P1 harness guild-only + Components V2 | OK (PR #9) |
| Powiadomienia timerów postaci / biologii | Brak |
| Powiadomienia respawnów / party map | Brak |
| Panele EQ / workspace (poza LAB) | Brak |
| Integracja Identity + Authorization | Usługi w monorepo; bot ich nie woła dla Web |
| Deploy produkcyjny | Wstrzymany (DEC-001) |

Bez osobnej decyzji właściciela **nie** dokładamy nowych komend ani mikroserwisów
„przy okazji”.

## D. Priorytet tip-top (kolejność sensowna)

### W tym PR / Cursor (bez nowej architektury)

1. Atlasy top-down zamiast panoram — **zrobione**.
2. Timery jako pierwsza powierzchnia wyprawy (nav + default) — **zrobione**.
3. Honesty strip + docs — **zrobione**.
4. Dopiąć EQ/UX human (Projekt Hard): walidacje, stany puste/błąd, spójne copy.
5. Jedna seria renderów klas (spójne pozy) gdy owner wskaże źródło albo lokalny dump.

### Wymaga decyzji / backend (nie w scope mocka)

1. `player-team` (lub równoważny) + Identity OAuth Discord prawdziwy.
2. Reminder pipeline: Web → API → discord-gateway.
3. Realtime map sessions (D-048) + authZ.
4. Wznowienie Zeabur (DEC-001).

## E. Marker

`GAP_AUDIT_HONEST` — Web mock first-slice mocny; produkcja bot+API niegotowa.
