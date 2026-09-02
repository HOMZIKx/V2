# Non-Negotiables — V2

Poniższe zasady są nadrzędne. Agent nie może ich samodzielnie zmieniać ani obchodzić.

## Produkt i organizacja

- Jedna organizacja może obsługiwać wiele powiązanych serwerów Discord.
- Użytkownik ma wspólny profil organizacyjny oraz osobne członkostwa, role, ustawienia i dane lokalne dla serwerów.
- WWW jest pełnoprawną platformą równoległą do Discorda.
- Discord i WWW korzystają z tego samego backendu, danych i reguł biznesowych.
- Każda funkcja może być ograniczana według serwera, roli, użytkownika, uprawnienia, zakresu, czasu i interfejsu.

## Autoryzacja

- Model uprawnień: hybrydowy RBAC + szczegółowe uprawnienia, zakresy, warunki, wyjątki i jawne blokady.
- Backend zawsze podejmuje ostateczną decyzję o dostępie.
- System musi wyjaśniać, dlaczego dostęp został przyznany albo odrzucony.
- Wszystkie zmiany uprawnień podlegają audytowi.

## Architektura

- Mikrousługi od początku, dzielone według domen biznesowych, nie ekranów ani tabel.
- TypeScript jest głównym językiem. Inny język wymaga ADR-u i konkretnego uzasadnienia.
- Monorepo na początku, z możliwością późniejszego wydzielenia usług.
- Usługi nie importują swojej logiki biznesowej wzajemnie.
- Każda usługa jest właścicielem swoich danych.
- Jedna infrastruktura PostgreSQL może hostować wiele odseparowanych baz, ale usługa nie ma dostępu do bazy innej usługi.
- Komunikacja synchroniczna: REST + OpenAPI.
- Komunikacja asynchroniczna: RabbitMQ.
- Quorum queues służą do zadań, komend, automatyzacji i powiadomień.
- RabbitMQ Streams tylko tam, gdzie potrzebne jest odtwarzanie historii.
- Transactional Outbox, idempotencja, retry, DLQ, correlation ID i wersjonowanie zdarzeń są obowiązkowe dla krytycznych procesów.

## Backend

- Node.js 24 LTS.
- NestJS 11 jako standard organizacji usług.
- Fastify jako adapter HTTP.
- Własny adapter RabbitMQ zapewniający kontrolę nad topologią, confirms, retry, DLQ i przeciążeniem.
- Domena i warstwa aplikacyjna nie importują NestJS, Fastify, ORM, Discord SDK ani RabbitMQ.
- `strict: true`, zakaz `any`, runtime validation każdego wejścia zewnętrznego.

## Frontend

- Dwie niezależnie wdrażane aplikacje w monorepo.
- `web`: Next.js App Router — część publiczna i panel użytkownika.
- `admin`: React + Vite + React Router — panel administracyjny.
- Wspólny design system, klient API, walidacja, autoryzacja, kontrakty i telemetryka.
- **D-050:** produkcyjny member WWW projektuje i tworzy Owner + ChatGPT; Cursor integruje zaakceptowany frontend z backendem — bez konkurencyjnego redesignu (`docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md`).
- Istniejący kod `apps/web` / `apps/admin` jest materiałem technicznym do czasu akceptacji slice’ów z frontend tracku; nie wolno go usuwać tylko dlatego, że kierunek wizualny się zmienia.

## Tożsamość i bezpieczeństwo

- Główna tożsamość platformy to **V2 User** ze stabilnym UUID niezależnym od Discord ID i e-maila.
- Discord i Google są zewnętrznymi providerami (`ExternalIdentity`); architektura musi pozwalać na kolejnych providerów. Discord pozostaje kluczowym kanałem produktu, ale nie jest technicznym kluczem głównym użytkownika.
- E-mail nie jest kluczem tożsamości i nie uruchamia automatycznego łączenia kont.
- Account linking jest wyłącznie jawne (`disableImplicitLinking`); unikalność `(provider, providerAccountId)`; nie wolno odłączyć ostatniego providera bez innej metody dostępu.
- Discord login musi działać także gdy provider nie zwróci e-maila (subject = provider account ID).
- Identity Service jest jedynym właścicielem tabel user / account / session / verification; inne usługi korzystają wyłącznie z kontraktów Identity.
- Identity Service opiera się na Better Auth zamkniętym za portami/adapters (oficjalny handler Fastify); inne usługi nie importują Better Auth ani nie czytają jego tabel.
- Dostęp guild-scoped (które serwery/role Discord uprawniają) oraz natychmiastowa blokada po utracie członkostwa/roli należą do Authorization / synchronizacji Discord (P3+). P2 dostarcza mechanizm revoke sesji. Utrata Discorda nie kasuje automatycznie V2 User ani konta Google.
- Administracja ma obowiązkowe passkey albo TOTP oraz kody odzyskiwania (etap po minimalnym P2, jeśli Admin nie jest jeszcze produkcyjny).
- Krytyczne operacje wymagają ponownego potwierdzenia MFA.
- Przeglądarka: opaque sesja serwerowa w cookie `HttpOnly` + `Secure` (poza localhost) + host-only; zakaz JWT jako sesji przeglądarkowej; zakaz tokenów w `localStorage` / `sessionStorage`. Osobne cookies Web vs Admin.
- Redis (restrykcyjny ACL) jest źródłem szybkiej walidacji/unieważniania sesji; cookie cache/stateless Better Auth wyłączone na start, aby revoke był natychmiastowy.
- Wewnętrzna komunikacja: krótko żyjący JWT (TTL ≤ 5 min) z `iss`/`aud`/`sub`/`jti`/`iat`/`exp`/`kid`, asymetrycznie podpisany przez Identity; bez pełnego RBAC w tokenie.

## Jakość i kontrola zmian

- Każda decyzja architektoniczna wymaga ADR-u.
- Zatwierdzonych ADR-ów nie edytuje się po cichu; zmiana wymaga nowego ADR-u zastępującego poprzedni.
- Cursor nie może samodzielnie rozstrzygać decyzji wpływających na architekturę, bezpieczeństwo, dane, UX, koszty lub zakres produktu.
- Nie wolno usuwać testów ani zabezpieczeń, aby przepchnąć zmianę.
- Każda usługa ma testy, health checks, logi, metryki i tracing.
- Całość musi uruchamiać się lokalnie jednym udokumentowanym poleceniem.
- Kod starego projektu jest wyłącznie referencją. Zakaz kopiowania całego starego monorepo.
