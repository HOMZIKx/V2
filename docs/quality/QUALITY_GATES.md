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

Fundament ma mieć sensowne testy zachowania i granic, nie sztuczne linie kodu
dla podniesienia procentu coverage. Progi coverage, jeśli zostaną wprowadzone
dla modułów biznesowych, powinny odpowiadać ryzyku i być uzasadnione. Brak
testu nie może być maskowany atrapą ani obniżeniem wymagań bez decyzji.
