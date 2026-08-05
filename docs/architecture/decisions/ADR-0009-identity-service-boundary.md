# ADR-0009: Identity Service boundary and core entities

- **Status:** Accepted
- **Data:** 2026-08-05
- **Task:** `P2-IDENTITY-FOUNDATION-001` (planning)
- **Owner decisions:** DEC-003, DEC-004, DEC-006, DEC-007

## Kontekst

`identity-service` i `authorization-service` istnieją jako szkielety Nest bez domeny.
P2 buduje fundament tożsamości platformy bez implementacji RBAC.
Konstytucja wymaga własności danych per usługa oraz rozdzielenia Identity od Authorization.

## Decyzja

1. **`identity-service` jest jedynym właścicielem** tabel i danych: `user`, `account` /
   `ExternalIdentity`, `session`, `verification` (oraz powiązany audit bezpieczeństwa
   tożsamości i podstawowy profil). Nazwy tabel biblioteki (Better Auth) mapują się
   na te encje domenowe za adapterami — inne usługi **nie** czytają tych tabel.
2. Inne usługi **nie** łączą się z bazą `identity`, nie wykonują joinów do niej i nie
   manipulują sesjami w Redis poza kontraktem Identity. Jeśli Redis jest session
   store, dostęp ma wyłącznie `identity-service` (ACL restrykcyjny).
3. **API Gateway, Web, Admin i Discord Gateway** korzystają wyłącznie z kontraktów
   Identity (REST/OpenAPI / signed internal context) — nigdy z bezpośredniego dostępu
   do bazy Identity.
4. **`authorization-service` nie jest rozwijany funkcjonalnie w P2** (brak RBAC).
   Konsumuje w przyszłości wyłącznie stabilne `userId` V2 i zdarzenia Identity.
5. Encje obowiązkowe w modelu P2:
   - **User** — centralny podmiot V2 ze stabilnym UUID niezależnym od Discord ID i e-maila;
   - **ExternalIdentity / Account** — powiązanie z providerem (`provider` + `providerAccountId`);
   - **Session** — sesja logowania z revoke one / revoke all / revoke by admin|system;
   - **Verification** — jednorazowe tokeny flow (OAuth state/PKCE, link intents) pod kontrolą Identity.
6. Warstwy Domain / Application **nie** zależą od NestJS, Fastify, ORM, Discord SDK,
   RabbitMQ ani Better Auth (Better Auth wyłącznie w Infrastructure za portami — ADR-0012).
7. Komunikacja synchroniczna: REST + OpenAPI. Zdarzenia tożsamości: wersjonowane,
   idempotentne, z correlation id.

## Zakres P2 vs poza

**P2:** Discord login, Google login, jawne link/unlink, `me`, logout/revoke, bezpieczne
sesje, wewnętrzny kontekst JWT.

**Poza P2:** RBAC, guild membership policy, produkcyjny deploy Identity, funkcje
biznesowe bota, passkey/TOTP/MFA (wymaganie przyszłe — nie blokuje minimalnego P2,
o ile Admin nie jest produkcyjny).

## Konsekwencje

- Jasna granica pod P3 Authorization.
- Discord User ID nie może być PK użytkownika platformy.
- Implementacja P2 skupia się w `services/identity-service` (+ cienkie integracje w
  `web`/`admin`); start dopiero po merge zatwierdzonego planu PR #10, w osobnym PR
  (DEC-007).

## Zastąpienie

Doprecyzowuje ADR-0001 w zakresie „co należy do Identity”, bez zastępowania całego
ADR-0001.
