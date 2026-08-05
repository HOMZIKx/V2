# ADR-0001: Fundamentalna architektura platformy

- **Status:** Accepted
- **Data:** 2026-08-04

## Kontekst

Platforma ma od początku zapewniać bardzo solidny fundament pod wiele przyszłych modułów, interfejs Discord, pełną platformę WWW, wiele powiązanych serwerów Discord i rozbudowany system uprawnień.

## Decyzja

Przyjmujemy:

- mikrousługi dzielone według domen biznesowych;
- TypeScript jako główny język;
- Node.js 24 LTS, NestJS 11 i Fastify;
- monorepo z niezależnym budowaniem i wdrażaniem usług;
- osobną własność danych usług na wspólnej infrastrukturze PostgreSQL;
- REST + OpenAPI dla komunikacji synchronicznej;
- RabbitMQ quorum queues oraz selektywne Streams dla komunikacji asynchronicznej;
- Transactional Outbox, idempotencję, retry, DLQ i correlation IDs;
- aplikację Web w Next.js App Router;
- aplikację Admin w React + Vite + React Router;
- multi-provider Identity (Discord + Google w P2; V2 User UUID) — ADR-0010; Better Auth za portami Identity — ADR-0012; opaque sesje cookie + Redis oraz internal JWT — ADR-0011; MFA administracji obowiązkowe na etapie produkcyjnego Admin (D-018).

## Konsekwencje pozytywne

- wyraźna izolacja odpowiedzialności;
- niezależne wdrażanie i skalowanie;
- możliwość dalszej rozbudowy bez przepisywania rdzenia;
- spójne reguły dla Discorda i WWW;
- mocne podstawy bezpieczeństwa, audytu i niezawodności.

## Konsekwencje negatywne

- większa złożoność operacyjna od pierwszego dnia;
- brak prostych transakcji obejmujących wiele usług;
- konieczność utrzymywania kontraktów, obserwowalności i testów integracyjnych;
- wolniejszy początkowy rozwój niż w prostym monolicie.

## Zabezpieczenia

- nowe usługi tylko dla rzeczywistych granic domenowych;
- zakaz współdzielonej logiki biznesowej i cudzych baz;
- automatyczne testy granic architektury;
- obowiązkowe ADR-y dla zmian fundamentalnych;
- lokalne uruchomienie całego środowiska jednym poleceniem;
- rozwój etapami z audytem po każdym większym kroku.

## Zastąpienie decyzji

Zmiana któregokolwiek fundamentalnego elementu wymaga nowego ADR-u, który jawnie zastępuje ten dokument w odpowiednim zakresie.
