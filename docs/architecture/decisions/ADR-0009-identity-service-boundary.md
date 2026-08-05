# ADR-0009: Identity Service boundary and core entities

- **Status:** Proposed
- **Data:** 2026-08-05
- **Task:** `P2-IDENTITY-FOUNDATION-001` (planning)

## Kontekst

`identity-service` i `authorization-service` istnieją jako szkielety Nest bez domeny.
P2 ma zbudować fundament tożsamości platformy bez implementacji RBAC.
Konstytucja wymaga własności danych per usługa oraz rozdzielenia Identity od Authorization.

## Decyzja (proponowana)

1. **`identity-service` jest jedynym właścicielem** danych: `User`, `ExternalIdentity`, `Session` (oraz powiązany audit bezpieczeństwa tożsamości i podstawowy profil).
2. Inne usługi **nie** łączą się z bazą `identity` i nie manipulują sesjami bezpośrednio w Redis poza kontraktem Identity (jeśli Redis jest użyty jako store sesji, dostęp ma wyłącznie identity-service).
3. **`authorization-service` nie jest rozwijany funkcjonalnie w P2** (brak RBAC). Konsumuje w przyszłości wyłącznie stabilne `userId` V2 i zdarzenia Identity.
4. Encje obowiązkowe w modelu P2:
   - **User** — centralny podmiot V2 ze stabilnym ID niezależnym od providera;
   - **ExternalIdentity** — powiązanie z providerem (`provider` + `providerSubject`);
   - **Session** — sesja logowania z możliwością revoke one / revoke all.
5. Warstwy Domain / Application **nie** zależą od NestJS, Fastify, ORM, Discord SDK ani RabbitMQ (zgodnie z konstytucją).
6. Komunikacja synchroniczna: REST + OpenAPI. Zdarzenia tożsamości: wersjonowane, idempotentne, z correlation id.

## Poza decyzją

- Wybór biblioteki auth (Better Auth vs inne) — **DEC-004**.
- Multi-provider vs Discord-only — **DEC-003** / ADR-0010.
- Format kontekstu wewnętrznego — **DEC-009** / ADR-0011.

## Konsekwencje

- Jasna granica pod P3 Authorization.
- Discord User ID nie może być PK użytkownika platformy.
- Implementacja P2 skupia się w `services/identity-service` (+ cienkie integracje w `web`/`admin`).

## Zastąpienie

Po akceptacji: doprecyzowuje ADR-0001 w zakresie „co należy do Identity”, bez zastępowania całego ADR-0001.
