# Bramki jakości

## Lokalnie

`pnpm validate` uruchamia pełny zestaw:

1. `pnpm format:check`;
2. `pnpm lint`;
3. `pnpm typecheck`;
4. `pnpm test:coverage`;
5. `pnpm architecture:check`;
6. `pnpm build`;
7. `pnpm test:e2e`;
8. build frontendu + `pnpm test:runtime-smoke`;
9. `docker compose -f infrastructure/docker/docker-compose.yml config`.

`pnpm validate:quick` pomija coverage, E2E i runtime smoke (zostawia zwykłe
`pnpm test` oraz compose config).

## CI

Workflow `CI` dla pull requestów i pushy do `main` instaluje zależności przez
Corepack, instaluje Chromium Playwright i uruchamia `pnpm validate`, a następnie
`pnpm audit --audit-level=high`. Osobny job podnosi Compose, sprawdza healthy
kontenerów i izolację baz. Dodatkowo działa skan sekretów Gitleaks.

CI **nie** łączy się z Discordem — harness P1 w `discord-gateway` musi przechodzić
testy z `DISCORD_ENABLED=false`. Manualny live test po lokalnym setupie
([TEST_BOT_SETUP.md](../discord/TEST_BOT_SETUP.md)) jest osobną bramką przed
`READY_FOR_REVIEW`.

Workflow `PR Title` sprawdza zgodność tytułu pull requesta z Conventional
Commits.

## Coverage

`pnpm test:coverage` egzekwuje V8 coverage z `all: true` i jawnym `include`
dla kodu źródłowego projektu (również pliki niezaimportowane przez testy).
Progi: co najmniej 60% linii, funkcji i instrukcji oraz 50% gałęzi. Wykluczenia
obejmują konfiguracje, entrypointy, moduły frameworka, baryłki `index.ts` oraz
artefakty builda.

Fundament ma mieć sensowne testy zachowania i granic, nie sztuczne linie kodu
dla podniesienia procentu coverage. Obniżenie progu dla przyszłego projektu
wymaga uzasadnienia w `TESTING_STRATEGY.md`; brak testu nie może być maskowany
atrapą.

## Izolacja infrastruktury

Osobny job CI uruchamia Compose i `RUN_INFRA_TESTS=true pnpm test:infra`.
Test weryfikuje dostęp każdego konta PostgreSQL do własnej bazy oraz odmowę
dostępu do bazy drugiej usługi. Runtime smoke alokuje wolne porty ephemeral,
nie zabija obcych procesów i oczekuje health endpointów wszystkich sześciu
procesów po buildzie.
