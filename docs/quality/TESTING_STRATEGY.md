# Strategia testowania

## Poziomy testów

- **Vitest:** testy jednostkowe i integracyjne aktualnych aplikacji, usług,
  pakietów oraz endpointów health.
- **Playwright:** minimalne smoke testy aplikacji `web` i `admin`.
- **Kontrole architektury:** testy wykrywające naruszenia granic importów i
  zależności między usługami.
- **Konfiguracja:** testy walidacji konfiguracji, w tym odrzucania
  nieprawidłowych wartości środowiskowych.

Testy powinny sprawdzać zachowanie możliwe do zaobserwowania. W Promptcie 0 nie
testujemy OAuth, autoryzacji, ORM, zdarzeń RabbitMQ ani funkcji biznesowych,
ponieważ nie są zaimplementowane.

## Discord test harness (P1)

`apps/discord-gateway` ma testy Vitest bez połączenia z live Discordem: walidacja
konfiguracji, redakcja sekretów, izolacja guild, signed custom IDs, renderer
panelu, health/readiness i router interakcji na mockowanym adapterze. CI nie
używa tokenu Discorda. Manualny live test na guild testowym jest obowiązkowy
przed audytem — instrukcja: [TEST_BOT_SETUP.md](../discord/TEST_BOT_SETUP.md).
Skrypty: `pnpm discord:test:doctor`, `register`, `start`, `generate-secret`.

## Uruchamianie

```text
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm architecture:check
pnpm test:infra
pnpm test:runtime-smoke
```

`pnpm test` jest zbiorczym targetem Nx dla testów Vitest. Smoke Playwright
wymaga uruchamialnych aplikacji zgodnie z konfiguracją projektów E2E.
`pnpm test:coverage` włącza raportowanie V8 oraz minimalne progi: 60% linii,
funkcji i instrukcji oraz 50% gałęzi. Wspólne progi są skonfigurowane dla
aplikacji, usług i testów narzędziowych; pliki konfiguracji, entrypointy,
moduły frameworka i katalogi wynikowe są wykluczone.

`pnpm test:infra` domyślnie pomija test izolacji PostgreSQL. Ustawienie
`RUN_INFRA_TESTS=true` wymusza połączenie z lokalnym Compose i powoduje błąd,
jeżeli baza jest niedostępna lub konto usługi może użyć cudzej bazy.
`pnpm test:runtime-smoke` wymaga wcześniej zbudowanych aplikacji i sprawdza
health endpointy sześciu procesów.

## Rozwój strategii

Nowa funkcja powinna dodać test na poziomie adekwatnym do ryzyka: reguły
domenowe jako unit, adaptery i konfiguracja jako integracyjne, a kluczowe
przepływy interfejsu jako E2E. Testy nie zastępują runtime validation ani
kontroli granic architektury.
