# DESTILED Web — audit jakości (2026-09-03)

- **Branch inspected:** `cursor/destiled-cursor-handoff-dfe5` / `preview/destiled-web`
- **Runtime:** Next.js `http://127.0.0.1:3000` (dev)
- **Against:** `FIRST_PLAYER_JOURNEY_COHERENCE_REVIEW`, D-038–D-060, D-061
- **Screenshots:** `/opt/cursor/artifacts/screenshots/destiled-*.png`

## Verdict

Właściciel ma rację: to **dopracowany happy-path demo**, nie domknięty first-player
product shell. Brand/shell wygląda dobrze, ale logika ścieżki, stany i zawartość
kontraktu są niepełne; nawigacja promuje Mapy/Targ/Aktywność przed domknięciem
rdzenia.

## Co działa (powierzchownie)

- Shell DESTILED + ciemna paleta, desktop i mobile layout.
- Fixture „Mateusz / Asteria” z kartami postaci, taskami Done/Później/Nie mogę,
  notatkami, EQ drag/drop, flip timerów.
- Część mutacji trafia do `localStorage` (workspace, EQ, profil edit, maps).
- Na wielu ekranach jest `mock-notice` o lokalnym / demo adapterze.

## Krytyczne luki vs zamówiony first slice

| Kontrakt | Stan w UI |
| -------- | --------- |
| Discord entry (eligible / cancel / unavailable / ineligible / revoke) | **Brak** — start od razu jako zalogowany Mateusz |
| First-use: Create workspace + Accept invite | **Brak w UI** — empty fixtures tylko w testach |
| Home: ready timers, last workspace/character, create | **Nie** — metryki „moduły”, hub maps/activity |
| Create character → pojawia się w workspace | **Nie** — lokalny sukces bez listy |
| EQ: create/edit item, readiness 6 stanów, Mark as moved | **Częściowo / brak** |
| Timery: duration, next-ready, Discord delivery states | **Uproszczone** |
| History append-only od mutacji | **Nie** — fixture; mutacje nie logują |
| Connection matrix (offline/reconnect/denied) | **Prawie zawsze „Połączono” / online** |
| Routes respektują `teamId` / `invitationId` | **Hardcode Asteria / fixture** |

## Fake / niespójna honesty

- Live dots, „2 online”, „XiaoHu ogląda kartę”, dzwonek powiadomień, profil
  „Członek” bez auth.
- Accept invitation → „dostęp przyznany” bez efektu w listTeams.
- Dashboard: Targ = „W przygotowaniu”, ale w shellu Targ jest pełnym linkiem;
  Mapy/Aktywność = „DOSTĘPNY” mimo later-scope.
- Market to katalog itemów (nie targ ogłoszeń); Activity to RSVP eventów (nie
  analytics TOP10 z kontraktu).
- EQ: level 55 vs item lvl 75; broken image w katalogu; literówka „Zatruby”.

## Over-scope

Mapy (duże demo + localStorage), Targ (cienki katalog), Aktywność (RSVP) są w
głównej nawigacji i konkurują z niedokończonym rdzeniem.

## Priorytet napraw (propozycja dla właściciela)

### P0

1. Zawęzić nav do first-slice; Mapy/Targ/Aktywność = later / ukryte.
2. Discord entry mock (wszystkie outcome).
3. First-use Create workspace + Accept invite.
4. Home zgodne z 3 pytaniami kontraktu.
5. Create character zapisuje do wspólnego mock store i pojawia się w liście.
6. Honesty pass (bez fałszywego live chrome).
7. Usunąć hardcode `asteria` z linków.

### P1

EQ item CRUD + readiness; pełniejsze timery/reminder states; notes z revision;
mutacje → history; loading/reconnect/denied surfaces.

### P2

Odsunąć/flagować maps/market/activity; rename market→katalog albo leave later;
dopinać assety gdy owner priorytetyzuje.

## Evidence screenshots

- `destiled-01-home.png` — dashboard hub + fake Discord connected
- `destiled-02-teams.png` — workspace fixture + localStorage notice
- `destiled-04-character-eq.png` — EQ board (luki treści/logiki)
- `destiled-08-maps.png` / `09-market` / `10-activity` — premature modules
- `destiled-12-home-mobile.png` — mobile home
