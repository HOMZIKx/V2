# ADR-0004: Lokalna infrastruktura i izolacja baz

- **Status:** Accepted
- **Data:** 2026-08-04

## Kontekst

Usługi muszą od początku zachowywać własność danych, a jednocześnie środowisko
lokalne powinno być proste do uruchomienia na Windows, WSL2, macOS i Linux.

## Decyzja

Lokalny Docker Compose uruchamia PostgreSQL 16, Redis 7 i RabbitMQ
3-management z health checks oraz nazwanymi wolumenami. Jedna instancja
PostgreSQL ma oddzielne bazy i konta dla `identity-service` oraz
`authorization-service`; konto jednej usługi nie uzyskuje dostępu do bazy
drugiej.

## Konsekwencje

- `pnpm infra:up`, `infra:down`, `infra:status` i `infra:reset` zapewniają
  powtarzalne operacje Node-based na obsługiwanych systemach;
- `infra:reset` trwale usuwa dane lokalne i wymaga wyraźnego ostrzeżenia;
- Redis i RabbitMQ są współdzieloną infrastrukturą, nie biznesowym źródłem
  prawdy;
- host bez działającego Docker Desktop nie uruchomi lokalnej infrastruktury.
