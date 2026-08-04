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

## Uruchamianie

```text
pnpm test
pnpm test:e2e
pnpm architecture:check
```

`pnpm test` jest zbiorczym targetem Nx dla testów Vitest. Smoke Playwright
wymaga uruchamialnych aplikacji zgodnie z konfiguracją projektów E2E.

## Rozwój strategii

Nowa funkcja powinna dodać test na poziomie adekwatnym do ryzyka: reguły
domenowe jako unit, adaptery i konfiguracja jako integracyjne, a kluczowe
przepływy interfejsu jako E2E. Testy nie zastępują runtime validation ani
kontroli granic architektury.
