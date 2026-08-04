# V2

V2 to nowa, budowana od zera platforma społecznościowo-gamingowa. Fundament
Promptu 0 udostępnia monorepo z aplikacjami technicznymi, szkieletami usług,
lokalną infrastrukturą i kontrolami jakości — bez logowania, modułów
biznesowych ani produkcyjnego hostingu.

## Wymagania

- Node.js 24 (sprawdź `node --version`);
- pnpm 10.14.0 aktywowany przez Corepack;
- Docker Desktop z działającym Docker Compose (dla PostgreSQL, Redis i
  RabbitMQ);
- Chromium dla testów Playwright — instalowane poleceniem
  `pnpm exec playwright install chromium` po instalacji zależności.

## Szybki start

```text
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install
pnpm exec playwright install chromium
pnpm infra:up
pnpm dev
```

`pnpm dev` uruchamia aktualne projekty Nx. Aby najpierw podnieść
infrastrukturę, a potem aplikacje jednym poleceniem, użyj `pnpm dev:all`.

Punkty techniczne fundamentu:

- web: http://localhost:3000
- admin: http://localhost:3001
- API Gateway: http://localhost:4000/health/live
- Discord Gateway: http://localhost:4100/health/live
- Identity Service: http://localhost:4200/health/live
- Authorization Service: http://localhost:4300/health/live

## Najważniejsze polecenia

```text
pnpm infra:status       # status PostgreSQL, Redis i RabbitMQ
pnpm infra:down         # zatrzymanie infrastruktury
pnpm infra:reset        # UWAGA: usuwa lokalne wolumeny danych
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm architecture:check
pnpm build
pnpm validate           # pełny zestaw lokalnych quality gates
pnpm validate:quick     # lżejsza walidacja bez E2E i runtime smoke
pnpm generate:service <nazwa-service> --port <unikalny-port> --data-ownership <none|database>
```

Przykład:

```text
pnpm generate:service community-service --port 4401 --data-ownership database
```

Pełne instrukcje lokalne i rozwiązywanie problemów opisuje
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Granice systemu, własność danych,
kontrakty oraz bramki jakości znajdują się odpowiednio w
[docs/architecture](docs/architecture) i [docs/quality](docs/quality).
Status bieżącego etapu jest zapisany w
[docs/ai/PROJECT_STATE.md](docs/ai/PROJECT_STATE.md).
