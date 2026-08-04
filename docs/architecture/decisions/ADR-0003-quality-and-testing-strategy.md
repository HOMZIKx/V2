# ADR-0003: Strategia jakości i testów

- **Status:** Accepted
- **Data:** 2026-08-04

## Kontekst

Fundament ma wykrywać błędy funkcjonalne, regresje konfiguracji i naruszenia
granic zanim trafią do `main`, bez tworzenia sztucznego kodu wyłącznie dla
coverage.

## Decyzja

Przyjmujemy Vitest dla testów jednostkowych i integracyjnych, Playwright dla
smoke E2E, automatyczną kontrolę granic architektury oraz testy konfiguracji.
CI wykonuje formatowanie kontrolne, lint, typecheck, testy, kontrolę
architektury, build, walidację Compose, audyt zależności i skan sekretów.

## Konsekwencje

- podstawowe błędy są wykrywane lokalnie przez `pnpm validate` i w CI;
- smoke E2E pozostaje osobnym targetem, a nie częścią aktualnego `validate`;
- coverage ma odzwierciedlać ryzyko i zachowanie, nie być celem samym w sobie;
- kolejne moduły muszą dodawać testy adekwatne do wprowadzanego ryzyka.
