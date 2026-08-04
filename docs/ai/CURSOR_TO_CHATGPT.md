# Cursor → ChatGPT

## Status zadania

`READY_FOR_REVIEW`

## Task ID

`P0-BOOTSTRAP-001`

## Branch, commit i PR

- **Branch:** `cursor/p0-foundation-bootstrap`
- **Commit SHA:** `c567e42721aa46afbb7fb204c8099a691c48e767` (audit-fix implementation)
- **PR tip:** track latest commit on PR #3 after docs SHA pin
- **PR:** [#3](https://github.com/HOMZIKx/V2/pull/3)

## Audyt follow-up (CHANGES REQUIRED → poprawki)

Naprawiono wszystkie blokery z review „Audyt P0-BOOTSTRAP-001 — CHANGES REQUIRED”.

### Blokery zamknięte

1. Prettier / format:check — wyczyszczone; CI musi przejść od formatu dalej.
2. Playwright E2E — w CI (`pnpm exec playwright install --with-deps chromium` +
   `pnpm test:e2e`); obowiązkowy job Quality gates.
3. Docker healthy — job `Infrastructure integration`: `up -d --wait`, weryfikacja
   health Postgres/Redis/RabbitMQ, test izolacji baz, `down -v` w `always()`.
4. Test izolacji baz — `tools/infra/db-isolation.test.ts` (`RUN_INFRA_TESTS=true`).
5. Porty Compose i hosty aplikacji — wyłącznie `127.0.0.1`; obrazy przypięte
   (`postgres:16.9`, `redis:7.4.5`, `rabbitmq:3.13.7-management`).
6. Generator usług — pełny Nest/Fastify szkielet + `generate-service.test.mjs`.
7. Granice Nx — usunięto bypass `scope:shared`; reguły po `type:*` + test
   `isDependencyAllowed`.
8. Coverage — progi 60/60/50/60 z `@vitest/coverage-v8`, `pnpm test:coverage`.
9. Runtime smoke — `pnpm test:runtime-smoke` startuje wszystkie 6 po `build`.
10. `pnpm validate` — w CI (Docker dostępny na runnerze).

Dodatkowo: `pnpm.onlyBuiltDependencies`, layout Next.js, pin Next `15.5.22`
(Next 16 padał na `_global-error` / `useContext` w monorepo).

## Wyniki lokalne (Windows host, bez Docker CLI)

```text
pnpm format:check     → EXIT 0
pnpm lint             → EXIT 0
pnpm typecheck        → EXIT 0
pnpm test:coverage    → EXIT 0
pnpm architecture:check → EXIT 0 (4 tests)
pnpm build            → EXIT 0
pnpm test:runtime-smoke → EXIT 0 (all 6 apps/services)
pnpm test:infra       → skipped locally (RUN_INFRA_TESTS unset)
docker compose ...    → wymaga Docker Desktop / CI
```

Pełne `pnpm validate` + E2E + infra healthy są w GitHub Actions PR #3.

## Odstępstwa / założenia

- Next.js **15.5.22** zamiast 16.x z powodu błędu builda monorepo; nadal App Router.
- Runtime smoke Nest startuje skompilowany `dist/**/main.js` z `--import tsx`
  (workspace packages eksportują TypeScript).
- Host implementacji bez Dockera — dowód healthy/izolacji w CI.

## ADR-y

Bez zmian statusu ADR-0002..0005; poprawki mieszczą się w zaakceptowanym zakresie Prompt 0.

## Proponowany następny krok

Ponowny audyt ChatGPT PR #3. Nie zaczynać Promptu 1 bez `APPROVED`.
