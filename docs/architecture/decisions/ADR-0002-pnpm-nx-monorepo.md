# ADR-0002: pnpm i Nx dla monorepo

- **Status:** Accepted
- **Data:** 2026-08-04

## Kontekst

V2 zawiera niezależne aplikacje, usługi i pakiety techniczne, które wymagają
spójnego zarządzania zależnościami, targetami jakości oraz grafem zależności.

## Decyzja

Używamy pnpm 10.14.0 przez Corepack jako menedżera pakietów oraz Nx 23.1.1 do
zarządzania workspace, targetami, grafem zależności i kontrolami granic.

## Konsekwencje

- jedna przypięta wersja pnpm i lockfile zapewniają powtarzalne instalacje;
- wspólne targety `lint`, `typecheck`, `test` i `build` mogą obejmować projekty
  Nx;
- konfiguracja Nx egzekwuje granice między aplikacjami, usługami i pakietami;
- każdy współtwórca musi aktywować Corepack przed instalacją zależności.
