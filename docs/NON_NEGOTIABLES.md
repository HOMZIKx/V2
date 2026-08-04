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

## Tożsamość i bezpieczeństwo

- Użytkownik loguje się wyłącznie przez Discord OAuth.
- Platforma przechowuje wewnętrzny techniczny identyfikator użytkownika, ale konto jest jednoznacznie związane z Discord User ID.
- Administrator wybiera, które serwery i role Discord pozwalają na logowanie.
- Utrata członkostwa lub wymaganej roli natychmiast unieważnia dostęp i aktywne sesje, bez kasowania danych.
- Identity Service opiera się na Better Auth.
- Zwykły użytkownik korzysta z Discord OAuth.
- Administracja ma obowiązkowe passkey albo TOTP oraz kody odzyskiwania.
- Krytyczne operacje wymagają ponownego potwierdzenia MFA.
- Przeglądarka korzysta z sesji serwerowej w bezpiecznym cookie. Zakaz tokenów dostępowych w `localStorage`.
- Redis przechowuje sesje.
- Wewnętrzna komunikacja używa krótkotrwałego, podpisanego kontekstu tożsamości.

## Jakość i kontrola zmian

- Każda decyzja architektoniczna wymaga ADR-u.
- Zatwierdzonych ADR-ów nie edytuje się po cichu; zmiana wymaga nowego ADR-u zastępującego poprzedni.
- Cursor nie może samodzielnie rozstrzygać decyzji wpływających na architekturę, bezpieczeństwo, dane, UX, koszty lub zakres produktu.
- Nie wolno usuwać testów ani zabezpieczeń, aby przepchnąć zmianę.
- Każda usługa ma testy, health checks, logi, metryki i tracing.
- Całość musi uruchamiać się lokalnie jednym udokumentowanym poleceniem.
- Kod starego projektu jest wyłącznie referencją. Zakaz kopiowania całego starego monorepo.
