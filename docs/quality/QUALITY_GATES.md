# Bramki jakości

## Lokalnie

`pnpm validate` uruchamia kolejno:

1. `pnpm format:check`;
2. `pnpm lint`;
3. `pnpm typecheck`;
4. `pnpm test`;
5. `pnpm architecture:check`;
6. `pnpm build`;
7. `docker compose -f infrastructure/docker/docker-compose.yml config`.

Playwright smoke (`pnpm test:e2e`) jest osobnym poleceniem i nie jest obecnie
wywoływany przez `validate`.

## CI

Workflow `CI` dla pull requestów i pushy do `main` wykonuje instalację przez
Corepack i `pnpm install --frozen-lockfile`, następnie te same kontrole
formatowania, lint, typecheck, testów, granic architektury, build oraz
walidację konfiguracji Compose. Dodatkowo uruchamia `pnpm audit
--audit-level=high`. Osobne zadanie wykonuje skan sekretów Gitleaks.

Workflow `PR Title` sprawdza zgodność tytułu pull requesta z Conventional
Commits.

## Coverage

`pnpm test:coverage` oraz krok CI `Test` egzekwiają V8 coverage na poziomie
co najmniej 60% linii, funkcji i instrukcji oraz 50% gałęzi. Wymagania dotyczą
kodów załadowanych przez test projektu; konfiguracje, entrypointy, moduły
frameworka i artefakty builda są wykluczone.

Fundament ma mieć sensowne testy zachowania i granic, nie sztuczne linie kodu
dla podniesienia procentu coverage. Obniżenie progu dla przyszłego projektu
wymaga uzasadnienia w `TESTING_STRATEGY.md`; brak testu nie może być maskowany
atrapą.

## Izolacja infrastruktury

Osobny job CI uruchamia Compose i `RUN_INFRA_TESTS=true pnpm test:infra`.
Test weryfikuje dostęp każdego konta PostgreSQL do własnej bazy oraz odmowę
dostępu do bazy drugiej usługi. Runtime smoke uruchamia po buildzie wszystkie
sześć procesów i oczekuje na ich endpointy health.
