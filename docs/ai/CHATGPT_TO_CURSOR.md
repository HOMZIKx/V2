# ChatGPT → Cursor

## Status

`READY_FOR_REVIEW`

## Task ID

`P0-BOOTSTRAP-001`

## Nazwa

Prompt 0 — solidny bootstrap monorepo i fundamentu technicznego V2.

## Cel

Zbuduj produkcyjnej jakości, uruchamialny lokalnie fundament techniczny platformy V2. Ten etap ma przygotować repozytorium, aplikacje bazowe, standardy jakości, kontrolę granic architektury, lokalną infrastrukturę developerską i CI. Nie implementuj jeszcze funkcji biznesowych bota ani platformy.

## Kontekst

Projekt jest budowany od zera. Stary projekt jest wyłącznie opcjonalną referencją wizualną i funkcjonalną; nie wolno kopiować jego architektury ani przenosić monorepo. Obowiązuje konstytucja projektu i wszystkie zaakceptowane ADR-y.

Priorytety w kolejności:

1. bezpieczeństwo i poprawność;
2. czytelne granice mikrousług;
3. utrzymywalność i testowalność;
4. lokalne uruchomienie jednym poleceniem;
5. szybkość implementacji dopiero po spełnieniu powyższych punktów.

## Protokół rozpoczęcia

1. Zaktualizuj lokalne `main` z `origin/main`.
2. Utwórz osobną gałąź `cursor/p0-foundation-bootstrap`.
3. Przeczytaj wszystkie dokumenty obowiązkowe.
4. Przed zmianami przedstaw właścicielowi krótki plan wykonania, wykryte ryzyka i ewentualne konflikty.
5. Jeżeli nie ma konfliktu z konstytucją, wykonaj zadanie bez zadawania pytań o drobne szczegóły techniczne.
6. Gdy decyzja wpływa na fundament, bezpieczeństwo, dane lub zakres i nie wynika z dokumentów, wpisz ją do `docs/ai/PENDING_DECISIONS.md` i zatrzymaj wyłącznie blokującą część pracy.

## Dokumenty obowiązkowe

Przeczytaj w tej kolejności:

1. `AGENTS.md`
2. `.cursor/rules/00-project-constitution.mdc`
3. `docs/NON_NEGOTIABLES.md`
4. `docs/PROJECT_CHARTER.md`
5. `docs/DECISION_LOG.md`
6. `docs/architecture/SYSTEM_ARCHITECTURE.md`
7. wszystkie ADR-y w `docs/architecture/decisions/`
8. `docs/ai/WORKFLOW.md`
9. `docs/ai/PROJECT_STATE.md`
10. `docs/ai/PENDING_DECISIONS.md`

## Zatwierdzone wybory dla Promptu 0

- Node.js 24 LTS.
- TypeScript w pełnym trybie strict.
- `pnpm` przez Corepack jako menedżer pakietów; wersję przypnij w `packageManager` i lockfile.
- Nx jako narzędzie monorepo, grafu zależności, affected builds i egzekwowania granic.
- NestJS 11 + Fastify dla aplikacji backendowych.
- Next.js App Router dla `web`.
- React + Vite + React Router dla `admin`.
- PostgreSQL, Redis i RabbitMQ jako lokalna infrastruktura bazowa.
- GitHub Actions jako CI.
- Vitest dla testów jednostkowych i integracyjnych na poziomie kodu.
- Playwright jako fundament E2E dla aplikacji WWW.
- OpenAPI dla kontraktów synchronicznych oraz przygotowanie miejsca pod AsyncAPI/JSON Schema dla zdarzeń.
- ESM-first. CommonJS jest dopuszczalny wyłącznie, gdy konkretna zależność tego wymaga; udokumentuj wyjątek.
- Używaj wyłącznie stabilnych wydań, bez `canary`, `beta`, `rc` i eksperymentalnych funkcji jako fundamentu. Rozwiązane wersje zapisz w dokumentacji i przypnij lockfilem.

## Zakres

### 1. Monorepo i struktura

Utwórz spójne monorepo Nx z co najmniej następującą strukturą:

```text
apps/
  web/
  admin/
  api-gateway/
  discord-gateway/
services/
  identity-service/
  authorization-service/
packages/
  contracts/
  configuration/
  observability/
  testing/
  design-system/
  typescript-config/
  eslint-config/
infrastructure/
  docker/
  postgres/
  rabbitmq/
  redis/
docs/
```

Dopuszczalne jest dopasowanie nazw do ograniczeń Nx, ale znaczenie i granice muszą pozostać czytelne. Nie twórz jeszcze pustych usług dla każdej przyszłej domeny. Dodaj generator albo udokumentowany szablon tworzenia kolejnej usługi zgodnej z architekturą.

### 2. Aplikacje bazowe

#### `web`

- Next.js App Router.
- Minimalna strona techniczna informująca, że aplikacja działa.
- Brak logowania, profili i funkcji biznesowych.
- Health/smoke route odpowiednia dla wdrożeń.

#### `admin`

- React + Vite + React Router.
- Minimalny ekran techniczny.
- Brak logowania i panelu konfiguracyjnego.
- Wykorzystanie wspólnego design systemu przynajmniej przez jeden minimalny komponent demonstracyjny.

#### `api-gateway`

- NestJS 11 z adapterem Fastify.
- Endpointy `GET /health/live` oraz `GET /health/ready`.
- Bazowa konfiguracja OpenAPI, dostępna wyłącznie w środowisku developerskim.
- Bez logiki biznesowej i bez połączeń do baz innych usług.

#### `discord-gateway`

- Samodzielna aplikacja NestJS przygotowana jako adapter Discorda.
- Nie łącz się jeszcze z Discordem i nie wymagaj prawdziwego tokenu.
- Brak komend oraz funkcji bota.
- Dodaj bezpieczny tryb startu bez sekretów i prosty health check lub równoważny mechanizm gotowości procesu.

#### `identity-service` i `authorization-service`

- Tylko szkielety usług zgodne z podziałem Domain / Application / Infrastructure / Interface.
- Health checks i minimalne testy uruchomienia.
- Bez Better Auth, OAuth, MFA, modeli użytkownika i reguł uprawnień na tym etapie.
- Warstwy Domain i Application nie mogą importować NestJS, Fastify, ORM, RabbitMQ ani Redis.

### 3. Granice architektury

- Zastosuj tagi Nx i reguły `enforce-module-boundaries`.
- Aplikacje mogą zależeć od dozwolonych pakietów technicznych, ale nie od kodu innych aplikacji/usług.
- Zakaz bezpośrednich importów między usługami.
- `packages/contracts` może zawierać wyłącznie kontrakty i schematy, bez logiki biznesowej.
- `packages/*` nie mogą stać się miejscem ukrytej współdzielonej domeny.
- Dodaj automatyczny test lub kontrolę architektury wykrywającą niedozwolone zależności.

### 4. TypeScript i jakość kodu

Wspólna konfiguracja ma wymuszać co najmniej:

- `strict: true`;
- `noUncheckedIndexedAccess`;
- `exactOptionalPropertyTypes`;
- `noImplicitOverride`;
- `useUnknownInCatchVariables`;
- zakaz jawnego i niejawnego `any`;
- brak ignorowania błędów TypeScript bez komentarza z uzasadnieniem i odnośnikiem do zadania;
- brak nieużywanych eksportów tam, gdzie narzędzia pozwalają to stabilnie sprawdzać.

Dodaj:

- ESLint z konfiguracją typu-aware;
- Prettier;
- spójne aliasy importów;
- sortowanie/import rules bez konfliktu z Prettierem;
- Conventional Commits i walidację tytułów PR lub commitów;
- `.editorconfig`;
- `.nvmrc` lub równoważny plik dla Node 24;
- dokładnie przypięty `packageManager`.

CI jest źródłem prawdy. Lokalne hooki mogą przyspieszać pracę, ale nie mogą być jedynym zabezpieczeniem.

### 5. Konfiguracja środowiska

- Każda aplikacja/usługa otrzymuje walidowaną konfigurację.
- Brak dostępu do `process.env` poza warstwą konfiguracji.
- Dodaj `.env.example` bez prawdziwych sekretów.
- Aplikacja ma fail-fast przy brakującej krytycznej konfiguracji w trybie produkcyjnym.
- Tryb developerski nie może przypadkowo łączyć się z produkcją.
- Nie zapisuj sekretów, tokenów ani prawdziwych danych dostępowych w repozytorium.

### 6. Lokalna infrastruktura Docker Compose

Przygotuj lokalne środowisko z:

- PostgreSQL;
- Redis;
- RabbitMQ z panelem management;
- health checks;
- nazwanymi wolumenami;
- kontrolowanym restartem;
- czytelnymi portami zapisanymi w dokumentacji.

PostgreSQL:

- jedna instancja;
- osobne bazy i osobni użytkownicy przynajmniej dla `identity-service` i `authorization-service`;
- użytkownik usługi nie może mieć dostępu do bazy drugiej usługi;
- skrypty inicjalizacyjne muszą być idempotentne dla czystego środowiska.

RabbitMQ:

- konfiguracja developerska przygotowana pod quorum queues;
- panel management tylko do lokalnego developmentu;
- bez implementowania jeszcze adaptera biznesowego, retry, DLQ ani Outbox.

Zapewnij udokumentowane polecenia:

- uruchomienie infrastruktury;
- zatrzymanie;
- wyczyszczenie wolumenów z wyraźnym ostrzeżeniem;
- sprawdzenie health status.

### 7. Skrypty developerskie

Zapewnij cross-platformowe polecenia, działające także na Windowsie:

- `pnpm install`;
- `pnpm dev` albo `pnpm dev:all` uruchamiające cały aktualny fundament;
- `pnpm infra:up`;
- `pnpm infra:down`;
- `pnpm format` i `pnpm format:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build`;
- `pnpm validate` uruchamiające pełny wymagany zestaw kontroli.

Nie opieraj podstawowego workflow na skryptach Bash, które nie działają natywnie na Windowsie. Dla złożonej orkiestracji użyj skryptów Node/TypeScript albo możliwości Nx.

### 8. Testy

- Co najmniej jeden sensowny test jednostkowy na każdą aplikację/usługę bazową.
- Testy health endpoints backendu.
- Test architektury/granic importów.
- Minimalny Playwright smoke test dla `web` i `admin`.
- Test konfiguracji odrzucający nieprawidłowe zmienne środowiskowe.
- Testy nie mogą być pustymi atrapami ani sprawdzać wyłącznie `true === true`.
- Ustaw rozsądne progi coverage dla nowego kodu fundamentu i udokumentuj wyjątki; nie generuj sztucznego kodu tylko po to, aby nabić coverage.

### 9. CI i bezpieczeństwo łańcucha dostaw

Utwórz GitHub Actions dla Pull Requestów i `main`:

- instalacja Node 24 i Corepack;
- `pnpm install --frozen-lockfile`;
- format check;
- lint;
- typecheck;
- testy;
- build;
- kontrola granic architektury;
- `docker compose config`;
- skan sekretów;
- analiza zależności oraz podstawowa analiza bezpieczeństwa kodu.

Wymagania:

- minimalne uprawnienia workflow;
- przypięte wersje akcji GitHub do pełnych commit SHA tam, gdzie jest to rozsądne i możliwe;
- concurrency z anulowaniem starych przebiegów tego samego PR;
- cache pnpm/Nx;
- brak deployu produkcyjnego w Prompt 0.

Dodaj konfigurację automatycznych aktualizacji zależności, preferencyjnie Renovate, z grupowaniem bezpiecznych aktualizacji i bez automatycznego scalania breaking changes.

### 10. Dokumentacja

Utwórz lub zaktualizuj:

- `README.md` — cel, wymagania, szybki start, najważniejsze komendy;
- `AGENTS.md` — zachowaj lokalne ścieżki referencyjne, ale dodaj obowiązkową kolejność czytania konstytucji i protokół pracy;
- `docs/DEVELOPMENT.md` — pełne uruchomienie na Windows/WSL2 i pozostałych systemach;
- `docs/architecture/SERVICE_CATALOG.md` — aktualne aplikacje/usługi, właściciel danych, status i odpowiedzialność;
- `docs/architecture/DATA_OWNERSHIP.md`;
- `docs/architecture/CONTRACT_STANDARDS.md`;
- `docs/quality/QUALITY_GATES.md`;
- `docs/quality/TESTING_STRATEGY.md`;
- `docs/quality/DEFINITION_OF_DONE.md`;
- ADR dla wyboru pnpm + Nx;
- ADR dla strategii jakości/testów;
- ADR dla lokalnej infrastruktury i izolacji baz;
- ADR dla standardu kontraktów OpenAPI/zdarzeń;
- `docs/DECISION_LOG.md`;
- `docs/ai/PROJECT_STATE.md`;
- `docs/ai/CURSOR_TO_CHATGPT.md`.

Dokumentacja musi odpowiadać rzeczywistemu kodowi. Nie opisuj funkcji, których nie ma.

## Poza zakresem

Nie implementuj teraz:

- Discord OAuth;
- Better Auth;
- passkeys, TOTP i sesji;
- właściwego modelu użytkownika;
- systemu uprawnień;
- integracji z Discord API;
- komend bota;
- ORM i modeli domenowych;
- RabbitMQ Outbox, retry, DLQ i Streams;
- modułów wydarzeń, moderacji, LFG, ticketów, automatyzacji ani analityki;
- produkcyjnego hostingu;
- Kubernetes;
- płatnych usług zewnętrznych;
- kopiowania kodu starego projektu.

## Operacje zabronione

- Bezpośredni commit do `main`.
- Zmiana `NON_NEGOTIABLES.md` albo zaakceptowanych ADR-ów bez nowego ADR-u i decyzji właściciela.
- Dodawanie `any`, `@ts-ignore`, wyłączanie lint rules lub pomijanie testów w celu przepchnięcia builda.
- Import logiki jednej usługi przez inną usługę.
- Wspólna baza lub konto PostgreSQL z prawami do baz wielu usług.
- Sekrety w repozytorium.
- Używanie niestabilnych wersji bibliotek jako fundamentu.
- Generowanie dużej ilości pustego boilerplate bez jasnej funkcji.
- Deklarowanie sukcesu bez uruchomienia i udokumentowania testów.

## Kryteria akceptacji

Zadanie jest gotowe wyłącznie wtedy, gdy:

1. Czysty clone repozytorium można przygotować według README bez wiedzy spoza repo.
2. `pnpm install --frozen-lockfile` działa.
3. `pnpm validate` kończy się sukcesem.
4. Wszystkie bazowe aplikacje i usługi budują się.
5. `docker compose config` kończy się sukcesem.
6. PostgreSQL, Redis i RabbitMQ osiągają healthy w lokalnym środowisku.
7. `web`, `admin`, `api-gateway`, `discord-gateway`, `identity-service` i `authorization-service` dają się uruchomić zgodnie z dokumentacją.
8. Testy smoke i health przechodzą.
9. Reguły Nx blokują niedozwolony import pomiędzy usługami.
10. Żaden sekret nie został zapisany w Git.
11. CI odtwarza lokalne quality gates.
12. Dokumentacja, ADR-y, Decision Log i Project State są aktualne.
13. Cursor tworzy Pull Request do `main`, ale go nie scala.

## Oczekiwany raport końcowy

W `docs/ai/CURSOR_TO_CHATGPT.md` wpisz:

- status `READY_FOR_REVIEW`;
- Task ID;
- nazwę branch i commit SHA;
- link/numer Pull Requesta;
- kompletną listę zmienionych plików pogrupowaną obszarami;
- dokładne wersje głównych narzędzi i bibliotek;
- wykonane i niewykonane elementy;
- odstępstwa od tego zadania wraz z uzasadnieniem;
- wszystkie podjęte założenia;
- dokładne komendy testowe i ich wyniki;
- wyniki buildów i Docker health checks;
- wyniki kontroli bezpieczeństwa;
- znane problemy, ryzyka i dług techniczny;
- listę utworzonych ADR-ów;
- proponowany następny etap, ale bez jego implementowania.

Po utworzeniu PR zatrzymaj się. Nie rozpoczynaj Promptu 1 bez audytu ChatGPT i statusu `APPROVED`.
