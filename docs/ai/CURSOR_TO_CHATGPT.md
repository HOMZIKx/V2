# Cursor → ChatGPT

## Status

`READY_FOR_LIVE_TEST`

Implementacja kodu harnessu P1 jest przygotowana do manualnego live testu przez właściciela. CI i pełna walidacja na finalnym HEAD — **pending validation**. Pull Request i live test Discord — **pending owner**.

## Task ID

`P1-DISCORD-TEST-HARNESS-001`

## Branch, commit i PR

- **Branch:** `cursor/p1-discord-test-harness`
- **Finalny commit:** `aba7f6ef0b3716109461a9b0ccf83d41329f3e30`
- **PR:** pending after live test

## Zakres wykonany

- Adapter `discord.js` 14.25.1 z połączeniem Gateway/WebSocket i REST v10.
- Walidowana konfiguracja harnessu (`DISCORD_ENABLED`, token, guild, operatorzy, signing secret, strict isolation).
- Guild-scoped commands `/status` i `/panel-test` z rejestracją wyłącznie na `DISCORD_TEST_GUILD_ID`.
- Panel testowy V2 LAB: select menu, przyciski, modal, odświeżenie i bezpieczne usunięcie.
- Stateless signed custom IDs (HMAC-SHA256).
- Strict guild isolation przy starcie i na każdej interakcji.
- Skrypty CLI: `doctor`, `register`, `start`, `generate-secret`.
- Testy Vitest bez live Discorda; redakcja sekretów.
- Dokumentacja: `TEST_BOT_SETUP.md`, ADR-0007, aktualizacje `.env.example`, README, DEVELOPMENT, SERVICE_CATALOG, TESTING_STRATEGY, QUALITY_GATES.

## Architektura Discord Gateway

- **Cykl życia klienta:** stany `disabled` → `connecting` → `ready` / `degraded` / `failed` / `stopping`; timeout startu; graceful shutdown.
- **Router interakcji:** centralny dispatch do handlerów komend i komponentów (application layer).
- **Signed custom IDs:** wersjonowany format, HMAC z `DISCORD_COMPONENT_SIGNING_SECRET`, constant-time verify.
- **Izolacja guild:** weryfikacja członkostwa i `guildId` per interakcja; strict mode kończy proces przy nieautoryzowanym serwerze.
- **Health/readiness:** `/health/live`, `/health/ready` odzwierciedlają stan procesu i gotowości Discorda.
- **Restart:** panel i komponenty działają po restarcie bez collectorów w pamięci.

## Wersje

- **discord.js:** 14.25.1
- **Discord API:** v10
- **Node.js:** 24 LTS

## Intents, scopes i permissions

### Intents

- `GatewayIntentBits.Guilds` only — brak privileged intents.

### Scopes instalacji

- `bot`
- `applications.commands`

### Minimalne permissions

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Brak Administrator

## Komendy i komponenty

- `/status` — ephemeral, bezpieczne metadane harnessu.
- `/panel-test` — publiczny panel; operator allowlist lub Manage Guild.
- Select menu: stan systemu, test odpowiedzi, formularz testowy (modal).
- Przyciski: Odśwież, Usuń panel (danger + potwierdzenie).
- Modal: pole „Uwagi testowe” (max 300 znaków); treść nie logowana.

## Wyniki automatyczne

```text
pnpm validate                    → pending validation
pnpm discord:test:generate-secret → implemented (local only)
pnpm discord:test:doctor          → implemented (requires owner local .env)
pnpm discord:test:register        → implemented (requires owner local .env)
```

### GitHub Actions

- **Run:** pending after push
- **HEAD SHA:** pending after push
- **Quality gates:** pending CI
- **Infrastructure integration:** pending CI
- **Secret scan:** pending CI
- **PR Title:** pending (after live test)

## Manualny live test

**Nie wykonany przez Cursora.** Właściciel musi wykonać kroki z [TEST_BOT_SETUP.md](../discord/TEST_BOT_SETUP.md) lokalnie. Nie wpisuj tokenu ani signing secret.

- **Application ID:** _(owner — after doctor)_
- **Bot User ID:** _(owner — after doctor)_
- **Guild ID:** `1534228693017432124`
- **Bot online:** pending owner
- **Brak działania na innych guild:** pending owner
- **`/status` ephemeral:** pending owner
- **Publikacja jednego `/panel-test`:** pending owner
- **Select menu:** pending owner
- **Modal:** pending owner
- **Odświeżenie tego samego panelu:** pending owner
- **Bezpieczne usunięcie:** pending owner
- **Działanie panelu po restarcie:** pending owner
- **Brak reakcji i publicznego spamu:** pending owner
- **Brak sekretów/treści modala w logach:** pending owner

## Global commands

- **Zarejestrowane global commands:** harness nie rejestruje global commands; `doctor` ostrzega, jeśli istnieją stare global commands w aplikacji.
- **Dowód użycia wyłącznie guild route:** kod i testy deklaracji komend — guild-only.

## Bezpieczeństwo

- Redakcja `DISCORD_TOKEN` i `DISCORD_COMPONENT_SIGNING_SECRET` w logach/błędach.
- `DISCORD_STRICT_GUILD_ISOLATION=true` domyślnie.
- Operator allowlist + Manage Guild dla panelu testowego.
- Signed custom IDs; brak wrażliwych danych w payloadzie.
- Minimalne intents i permissions; brak live Discorda w CI.

## Zmienione pliki i dokumenty

- `apps/discord-gateway/` — adapter, router, panel, testy, CLI
- `package.json` — skrypty `discord:test:*`
- `.env.example` — zmienne harnessu
- `docs/discord/TEST_BOT_SETUP.md` — **new**
- `docs/architecture/decisions/ADR-0007-discord-test-harness.md` — **new**
- `docs/DEVELOPMENT.md`, `README.md`, `docs/architecture/SERVICE_CATALOG.md`
- `docs/quality/TESTING_STRATEGY.md`, `docs/quality/QUALITY_GATES.md`
- `docs/ai/PROJECT_STATE.md`, `docs/ai/CURSOR_TO_CHATGPT.md`

## ADR

- `ADR-0007`: Accepted — discord.js 14.25.1, Gateway, guild-only commands, Guilds intent, strict isolation, signed components, no live Discord in CI.

## Odstępstwa, ryzyka i dług techniczny

- Autoryzacja operatorów to tymczasowa allowlist — nie docelowy RBAC.
- Rotacja signing secret unieważnia istniejące custom IDs paneli.
- `doctor` nie usuwa automatycznie starych global commands w aplikacji Discord.
- Live test i PR wymagają działania właściciela z lokalnymi sekretami.

## Proponowany następny krok

1. Właściciel: lokalny setup według `TEST_BOT_SETUP.md`, `doctor`, `register`, `start`, manualny live test.
2. Po zielonym `pnpm validate` i CI na finalnym HEAD: PR do `main`, uzupełnienie tego raportu wynikami live testu, status `READY_FOR_REVIEW`.

Tylko propozycja. Nie implementuj następnego etapu bez `APPROVED`.
