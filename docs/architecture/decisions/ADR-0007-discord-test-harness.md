# ADR-0007: Discord test harness (P1)

- **Status:** Accepted
- **Data:** 2026-08-05

## Kontekst

Po zamknięciu fundamentu Promptu 0 `discord-gateway` był technicznym szkieletem bez połączenia z Discordem. Etap P1 ma dostarczyć pierwszy bezpieczny, testowalny adapter: połączenie Gateway, komendy guild-scoped, panel testowy ze standardem UX V2 oraz pełne testy automatyczne bez tokenu w CI.

Wymagania bezpieczeństwa: jeden zatwierdzony serwer testowy, brak global commands, brak privileged intents, sekrety wyłącznie lokalnie, manualny live test przed audytem produktowym.

## Decyzja

Przyjmujemy następujące decyzje dla harnessu P1:

### SDK i transport

- **discord.js** w wersji **14.25.1**, przypiętej lockfilem.
- Połączenie przez **Discord Gateway (WebSocket)**; rejestracja komend przez **Discord REST API v10**.
- NestJS 11 pozostaje hostem procesu `discord-gateway`; logika Discorda jest izolowana w adapterze infrastrukturalnym i routerze interakcji.

### Intents i uprawnienia

- **P1 (oryginał):** wyłącznie intent **`GatewayIntentBits.Guilds`**. Bez `MessageContent`, `GuildMembers`, `GuildPresences` ani innych privileged intents.
- **P3 amendment:** patrz sekcja poniżej — `GuildMembers` jest wymagany dla sync członkostwa (P3-D1).
- Scopes instalacji OAuth: **`bot`** i **`applications.commands`**.
- Minimalne uprawnienia bota (zalecane / docelowe): **View Channels**, **Send Messages**, **Embed Links**, **Attach Files**, **Read Message History**. Bez **Administrator**.
  - `Attach Files` jest wymagane do bannera panelu Components V2 (`attachment://`).
  - Bitmask invite (minimalna): `permissions=117760`.
- **Nota (DEC-002, 2026-08-05):** właściciel świadomie zainstalował bota testowego z uprawnieniem Administrator (`permissions=8`) wyłącznie na guild `1534228693017432124` na czas lokalnego live testu. To **nie** jest konfiguracja zalecana ani produkcyjna.
- **Po teście:** odebrać Administrator (Server Settings → Integrations / Members → bot → uprawnienia) i przywrócić wyłącznie zestaw minimalny powyżej; ewentualnie ponownie zainstalować invite z `permissions=117760`.

### Komendy i izolacja guild

- Komendy rejestrowane **wyłącznie** dla `DISCORD_TEST_GUILD_ID` (guild `1534228693017432124` w środowisku testowym). **Zakaz** rejestracji global commands w kodzie harnessu.
- **`DISCORD_STRICT_GUILD_ISOLATION=true`** (domyślnie): po `ready` bot weryfikuje członkostwo w dozwolonym guild; obecność na innym serwerze kończy proces z czytelnym błędem; każda interakcja ponownie weryfikuje `guildId`.
- Id guild pochodzi z walidowanej konfiguracji, nie z hardcode w logice domenowej.

### Komponenty bez stanu w pamięci procesu

- Custom IDs komponentów są **wersjonowane i podpisane HMAC-SHA256** (`DISCORD_COMPONENT_SIGNING_SECRET`); weryfikacja constant-time.
- Interakcje istniejącego panelu działają **po restarcie** procesu — bez collectorów opartych na pamięci jako jedynym mechanizmie.
- Brak bazy danych i ORM na tym etapie.

### Autoryzacja testowa

- Tymczasowa allowlista operatorów: `DISCORD_TEST_OPERATOR_IDS` plus uprawnienie **Manage Guild** na serwerze testowym dla `/panel-test` i akcji destrukcyjnych. To nie jest docelowy system RBAC.

### Konfiguracja i CLI

- `DISCORD_ENABLED=false` jako bezpieczny default dla `pnpm dev` i CI.
- Skrypty cross-platform: `pnpm discord:test:doctor`, `register`, `start`, `generate-secret`.
- Sekrety tylko w lokalnym `.env`; redakcja w logach i błędach.

### Testy i CI

- **Brak live Discorda w CI** — brak tokenu, brak połączenia Gateway w GitHub Actions.
- Testy Vitest obejmują konfigurację, izolację guild, signed custom IDs, renderer panelu, health/readiness i router na mockowanym adapterze.
- Manualny live test na guild testowym jest obowiązkową bramką przed statusem `READY_FOR_REVIEW`.
- **Live test (2026-08-05):** sukces początkowy — guild `1534228693017432124`, Application/Bot ID `1534432424094728364`.
- **Remediacja UX (2026-08-05):** publiczny `/panel-test` = Discord Components V2 (`Container` + `IsComponentsV2`); legacy embed usunięty z panelu publicznego. Live API probe: flag `32768`, top component type `17`, bez embeds.

## Konsekwencje

- Pierwszy bot V2 może być bezpiecznie uruchomiony wyłącznie na dedykowanym serwerze testowym.
- CI pozostaje deterministyczne i bez sekretów Discorda.
- Kolejne moduły Discorda rozszerzają ten sam adapter, router i model signed custom IDs zamiast ad-hoc handlerów.
- Rotacja `DISCORD_COMPONENT_SIGNING_SECRET` unieważnia istniejące custom IDs paneli — akceptowalne na etapie testowym.
- Docelowe OAuth, RBAC, synchronizacja członków i produkcyjny rollout wymagają osobnych ADR-ów i etapów.

## Powiązane dokumenty

- [TEST_BOT_SETUP.md](../../discord/TEST_BOT_SETUP.md)
- [DISCORD_POST_INTERACTION_STANDARD.md](../../ux/DISCORD_POST_INTERACTION_STANDARD.md)
- [TEST_DISCORD.md](../../environments/TEST_DISCORD.md)
- [CHATGPT_TO_CURSOR.md](../../ai/CHATGPT_TO_CURSOR.md) — zakres P1

## Amendment (P3-D1 / P3-D20 — 2026-08-05)

Owner-approved membership sync supersedes the P1 **Guilds-only** intent restriction:

- `GatewayIntentBits.Guilds` **and** `GatewayIntentBits.GuildMembers` are required for Discord → Authorization sync.
- `MessageContent` and `GuildPresences` remain forbidden.
- Guild isolation (`DISCORD_STRICT_GUILD_ISOLATION`) is unchanged: only the configured test guild is synced; foreign guilds are rejected/left.
- Sync is gated by `DISCORD_AUTHORIZATION_SYNC_ENABLED` (default `false`) so the P1 harness remains tokenless-safe.

