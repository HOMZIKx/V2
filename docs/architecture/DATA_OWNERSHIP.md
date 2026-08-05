# Własność danych

## Zasada

Usługa jest jedynym właścicielem danych swojej domeny. Inna usługa nie odczytuje
jej bazy, nie wykonuje w niej zapisów i nie używa jej konta PostgreSQL.

## Aktualny fundament

- `identity-service` jest właścicielem bazy `identity` i ma własne konto
  PostgreSQL.
- `authorization-service` jest właścicielem bazy `authorization` i ma własne
  konto PostgreSQL.
- Jedna lokalna instancja PostgreSQL może hostować obie bazy, ale izolacja baz i
  uprawnień pozostaje obowiązkowa.

W Promptcie 0 nie istnieją jeszcze modele biznesowe ani ORM. Izolacja jest
przygotowana przez lokalne skrypty inicjalizacyjne PostgreSQL, a nie przez
udostępniony model danych.

## Encje Identity (P2 — plan Accepted; implementacja osobnym PR)

### Ownership logiczny

Wyłącznie `identity-service` jest właścicielem tożsamości i sesji. Inne usługi
**nie** mają dostępu do bazy `identity`, nie wykonują joinów do niej i nie
czytają Redis sesji Identity (ACL restrykcyjny — tylko Identity).

### PostgreSQL (`identity`)

- `User` — stabilny UUID V2;
- `ExternalIdentity` / `Account` — provider + providerAccountId (UNIQUE);
- `Verification` — one-time flow tokens (state/PKCE);
- opcjonalnie **bezpieczne metadane / audyt sesji** (np. session id, userId,
  created/revoked/expires, clientKind) — **bez** duplikowania używalnego tokenu
  sesji, chyba że przyszły ADR uzasadni inaczej.

### Redis (P2 session source of truth)

- Aktywna sesja / token sesji (opaque) jako **SoT** szybkiej walidacji i
  natychmiastowego revoke — wyłącznie pod kontrolą `identity-service`.
- Cookie cache / stateless mode Better Auth: wyłączone na start (ADR-0011 /
  ADR-0012).

Szczegóły: [IDENTITY_FOUNDATION.md](IDENTITY_FOUNDATION.md),
[ADR-0009](decisions/ADR-0009-identity-service-boundary.md),
[ADR-0011](decisions/ADR-0011-session-and-auth-transport.md),
[ADR-0012](decisions/ADR-0012-better-auth-engine.md).

## Wspólna infrastruktura

Redis i RabbitMQ są współdzieloną infrastrukturą techniczną. Nie zastępują
własności domenowej usług. Wyjątek P2: **aktywny token sesji** żyje w Redis jako
SoT operacyjny, ale **logicznym właścicielem** pozostaje wyłącznie
`identity-service` (żadna inna usługa nie czyta tych kluczy).

RabbitMQ transportuje zdarzenia i zadania; nie zmienia własności danych.

Wymiana danych między usługami wymaga wersjonowanego kontraktu synchronicznego
lub zdarzenia; nie może być zastępowana cross-readem bazy.
