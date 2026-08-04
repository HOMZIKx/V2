# Cursor → ChatGPT

## Status

`NOT_STARTED`

Dozwolone statusy podczas zadania:

- `IN_PROGRESS`
- `READY_FOR_LIVE_TEST`
- `BLOCKED`
- `READY_FOR_REVIEW`

## Task ID

`P1-DISCORD-TEST-HARNESS-001`

## Branch, commit i PR

- **Branch:** `cursor/p1-discord-test-harness`
- **Finalny commit:**
- **PR:**

## Zakres wykonany

Do uzupełnienia przez Cursor.

## Architektura Discord Gateway

Do uzupełnienia:

- cykl życia klienta;
- router komend i komponentów;
- model signed custom IDs;
- izolacja guild;
- health/readiness;
- obsługa restartów i graceful shutdown.

## Wersje

- **discord.js:**
- **Discord API:** v10
- **Node.js:** 24 LTS

## Intents, scopes i permissions

### Intents

Do uzupełnienia.

### Scopes instalacji

Do uzupełnienia.

### Minimalne permissions

Do uzupełnienia.

## Komendy i komponenty

Do uzupełnienia:

- `/status`;
- `/panel-test`;
- select menu;
- modal;
- odświeżenie;
- bezpieczne usunięcie panelu.

## Wyniki automatyczne

```text
pnpm validate                    →
pnpm discord:test:generate-secret →
pnpm discord:test:doctor          →
pnpm discord:test:register        →
```

### GitHub Actions

- **Run:**
- **HEAD SHA:**
- **Quality gates:**
- **Infrastructure integration:**
- **Secret scan:**
- **PR Title:**

## Manualny live test

Nie wpisuj tokenu ani signing secret.

- **Application ID:**
- **Bot User ID:**
- **Guild ID:** `1534228693017432124`
- **Bot online:**
- **Brak działania na innych guild:**
- **`/status` ephemeral:**
- **Publikacja jednego `/panel-test`:**
- **Select menu:**
- **Modal:**
- **Odświeżenie tego samego panelu:**
- **Bezpieczne usunięcie:**
- **Działanie panelu po restarcie:**
- **Brak reakcji i publicznego spamu:**
- **Brak sekretów/treści modala w logach:**

## Global commands

- **Zarejestrowane global commands:**
- **Dowód użycia wyłącznie guild route:**

## Bezpieczeństwo

Do uzupełnienia:

- redakcja sekretów;
- strict guild isolation;
- operator allowlist/ManageGuild;
- signed custom IDs;
- minimalne intents i permissions;
- brak live Discorda w CI.

## Zmienione pliki i dokumenty

Do uzupełnienia.

## ADR

- `ADR-0007`:

## Odstępstwa, ryzyka i dług techniczny

Do uzupełnienia bez ukrywania problemów.

## Proponowany następny krok

Tylko propozycja. Nie implementuj następnego etapu bez `APPROVED`.
