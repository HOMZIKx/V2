# Development — V2

## Wymagania lokalne

Wspierane są Windows z Docker Desktop, WSL2, macOS i Linux. Wymagane są Node.js
24, Corepack oraz Docker Compose. Na Windows zalecane jest uruchamianie poleceń
z PowerShell; w WSL2, macOS i Linux można użyć zwykłego terminala.

```text
node --version
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm --version
pnpm install
```

`package.json` przypina pnpm do wersji 10.14.0. Nie instaluj globalnego pnpm
zamiast Corepack.

## Lokalna infrastruktura

```text
pnpm infra:up
pnpm infra:status
```

Compose uruchamia PostgreSQL 16.9 (`5432`), Redis 7.4.5 (`6379`) i RabbitMQ
3.13.7 z management UI dostępnym lokalnie pod `http://127.0.0.1:15672`.
Wszystkie porty infrastruktury są przypięte do `127.0.0.1`. Sprawdź status health
kontenerów przez `pnpm infra:status`.

```text
pnpm infra:down
pnpm infra:reset
```

> **UWAGA:** `pnpm infra:reset` wykonuje `docker compose down -v` i trwale
> usuwa lokalne wolumeny PostgreSQL, Redis i RabbitMQ. Nie uruchamiaj go, jeśli
> chcesz zachować lokalne dane developerskie.

## Uruchamianie aplikacji

Po `pnpm infra:up` uruchom wszystkie aktualne projekty:

```text
pnpm dev
```

Lub uruchom infrastrukturę i projekty w jednej komendzie:

```text
pnpm dev:all
```

Aktualne porty:

| Projekt                      | Port | Kontrola techniczna                     |
| ---------------------------- | ---: | --------------------------------------- |
| web (Next.js App Router)     | 3000 | `GET /health`                           |
| admin (Vite + React Router)  | 3001 | ekran techniczny                        |
| api-gateway (Nest + Fastify) | 4000 | `GET /health/live`, `GET /health/ready` |
| discord-gateway (Nest)       | 4100 | `GET /health/live`                      |
| identity-service (Nest)      | 4200 | `GET /health/live`                      |
| authorization-service (Nest) | 4300 | `GET /health/live`                      |

API Gateway udostępnia dokumentację OpenAPI pod `/openapi` wyłącznie poza
produkcją. Discord Gateway startuje bez tokenu Discorda; integracja z Discordem
nie jest jeszcze zaimplementowana. Backendowe aplikacje i usługi domyślnie
nasłuchują wyłącznie na `127.0.0.1`; ustawienie hosta `0.0.0.0` jest dozwolone
wyłącznie w kontenerze lub wdrożeniu, które wymaga zewnętrznego bindowania.

## Kontrole jakości

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:infra
pnpm test:runtime-smoke
pnpm test:e2e
pnpm architecture:check
pnpm build
pnpm validate
```

`pnpm validate` uruchamia pełny zestaw: formatowanie, lint, typecheck,
coverage, kontrolę architektury, build, E2E Playwright, runtime smoke oraz
`docker compose config`. Lżejszy wariant: `pnpm validate:quick`.

## Generator usługi

```text
pnpm generate:service <nazwa-service> --port <unique-port> --data-ownership <none|database>
```

Nazwa musi być kebab-case i kończyć się na `-service`, na przykład
`pnpm generate:service community-service --port 4401 --data-ownership database`.
Port musi być unikalny wśród usług. Własność danych jest jawna (`database` albo
`none`) — generator jej nie zgaduje. Tworzony jest szkielet Domain, Application,
Infrastructure i Interface oraz wspólna konfiguracja coverage/lint/typecheck
testów. Przed dodaniem nowej usługi potwierdź jej granicę domenową zgodnie z
konstytucją i ADR-ami.

## Rozwiązywanie problemów

### Docker nie jest dostępny

`pnpm infra:*` wymaga polecenia `docker`. Zainstaluj i uruchom Docker Desktop,
włącz backend WSL2, jeśli używasz WSL2, a następnie sprawdź:

```text
docker --version
docker compose version
```

Jeżeli port 5432, 6379, 5672, 15672 albo port aplikacji jest zajęty, zwolnij go
lub zatrzymaj kolidującą usługę przed ponownym uruchomieniem.

### Corepack lub pnpm ma złą wersję

Ponownie wykonaj:

```text
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm --version
```

### Kontenery nie są healthy

Sprawdź `pnpm infra:status`, a następnie logi odpowiedniego kontenera:

```text
docker compose -f infrastructure/docker/docker-compose.yml logs
```
