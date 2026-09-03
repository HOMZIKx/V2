# ADR-0015: Granica player-team-service

- **Status:** Accepted
- **Data:** 2026-09-03
- **Gałąź:** `cursor/player-team-online-persistence-dfe5`
- **Depends on:** ADR-0001, ADR-0005, ADR-0011, ADR-0013, NON_NEGOTIABLES.md

## Kontekst

Web app (DESTILED Web) przez cały czas P0–P5 używał wyłącznie `localStorage`
jako źródła prawdy dla stanu gracza (postacie, przedmioty EQ, timery, notatki,
historia). Właściciel potwierdził: chcemy online persistence **zgodnie z planem**
i tak, żeby **bot mógł współpracować ze stroną web na określonych zasadach**.

Brak produkcyjnego logowania nie blokuje: do czasu właściwego auth wiring
stosujemy dev-safe demo-header.

Decyzje z NON_NEGOTIABLES:
- każda usługa jest właścicielem swoich danych;
- usługi nie importują wzajemnie logiki biznesowej;
- komunikacja synchroniczna: REST + OpenAPI;
- domena i warstwa aplikacji nie importują NestJS/ORM/Discord SDK.

## Decyzja

### 1. Właściciel danych

`player-team-service` (`@v2/player-team-service`, baza PostgreSQL `player_team`)
jest jedynym właścicielem danych zespołów graczy:
- przestrzenie robocze (workspaces)
- postacie
- przedmioty EQ i sety
- timery respawnu
- notatki
- historia zdarzeń

Żadna inna usługa nie czyta bazy `player_team` bezpośrednio.
Bot (`discord-gateway`) i Web korzystają wyłącznie z API tej usługi.

### 2. Schema

Relacyjna — osobne tabele:
- `player_team_workspaces`
- `player_team_characters`
- `player_team_equipment_items`
- `player_team_equipment_sets`
- `player_team_set_slots`
- `player_team_respawn_timers`
- `player_team_notes`
- `player_team_history`
- `player_team_viewer_snapshots` — JSONB snapshot całego `PlayerStoreState`
  per viewer (dev-sync bridge, do usunięcia gdy per-mutation endpoints wdrożone)

Migracje zarządza własny runner (`player_team_schema_migrations`).

### 3. API

Prefix: `/player-team/v1`

MVP (snapshot sync):
- `GET  /player-team/v1/me/state` — zwraca ostatnio zapisany snapshot
- `PUT  /player-team/v1/me/state` — zapisuje snapshot z OCC (`expectedRevision`)

Kolejne fazy (per-mutation): workspaces CRUD, characters CRUD, EQ mutations,
timers, notes — wg OpenAPI kontrakt v1 (osobny plik).

### 4. Auth — dev-safe bridge

Do czasu właściwego auth wiring (nie dotyczy tego PR):
- demo-header `x-demo-viewer-id` niesie `viewerId` (identity demo mode)
- `PLAYER_TEAM_ALLOW_DEMO_WRITE=true` (domyślnie true w dev)
- w produkcji header zamieniamy na internal JWT od Identity Service

### 5. Bot-web integration

Bot używa tych samych endpointów API (wewnątrz sieci serwisów).
Wspólna logika biznesowa leży w `player-team-service` — nie jest duplikowana
w `discord-gateway` ani w Web.

### 6. Warstwy wewnętrzne

- `domain` — encje i reguły (np. walidacja slotów EQ, OCC revision)
- `application` — przypadki użycia, porty
- `infrastructure` — PostgreSQL (pg), migracje
- `interface` — NestJS + Fastify HTTP

Domain i Application nie importują NestJS, pg, Discord SDK.

## Alternatywy odrzucone

- **JSONB blob per user** — łatwe w MVP, ale uniemożliwia zapytania relacyjne,
  indeksy, JOIN z botowymi danymi i audyt historii. Zastąpione relacyjnym schema.
- **Trzymanie danych w `identity-service`** — narusza granicę własności danych;
  identity service jest właścicielem sesji/kont, nie danych gameplay.
- **Brak osobnej usługi (tylko localStorage)** — uniemożliwia bot-web współpracę
  i persistence między sesjami przeglądarki.

## Konsekwencje

- Nowy serwis w Zeabur wymaga osobnej bazy `player_team` (add-on Postgres lub
  schema w istniejącym klastrze z osobnymi credentials).
- Per-mutation API (faza po MVP) wymaga mapowania `PlayerStoreState` ↔ relacyjne
  tabele — osobna praca po akceptacji tego ADR.
- `player_team_viewer_snapshots` jest tymczasowe — usuniemy gdy Web przejdzie na
  per-mutation endpoints i nie będzie potrzebował całego snapshot'u.
