# System Architecture — V2

## Model systemu
Platforma jest zestawem niezależnych usług domenowych. Discord Gateway, Web i Admin są adapterami do wspólnego backendu, a nie osobnymi źródłami logiki.

## Wstępny katalog usług
Nazwy są robocze i wymagają potwierdzenia przed implementacją:
- API Gateway
- Discord Gateway
- Identity Service
- Authorization Service
- Community Service
- Automation Service
- Notification Service
- Audit Service

Nowa usługa powstaje tylko dla wyraźnej domeny biznesowej lub niezależnej potrzeby skalowania, bezpieczeństwa albo cyklu życia. Zakaz tworzenia usługi dla każdej tabeli lub małej funkcji.

## Granice
Każda usługa:
- posiada własną logikę, kontrakty, migracje i dane;
- nie odczytuje bazy innej usługi;
- publikuje wersjonowane zdarzenia;
- udostępnia wersjonowane API;
- posiada health checks, testy, logi, metryki i tracing;
- może być budowana i wdrażana niezależnie.

## Dane
Na początku jeden klaster PostgreSQL hostuje osobne bazy usług. Każda usługa ma osobne dane dostępowe i wyłączną własność swojej bazy. Redis służy do sesji, cache i uzasadnionych mechanizmów koordynacji, ale nie jest źródłem prawdy dla trwałych danych biznesowych.

## Komunikacja
- REST + OpenAPI dla operacji wymagających natychmiastowej odpowiedzi.
- RabbitMQ quorum queues dla zadań, komend, powiadomień i automatyzacji.
- RabbitMQ Streams tylko dla zdarzeń wymagających replay.
- Transactional Outbox dla niezawodnej publikacji zdarzeń.
- Idempotentni konsumenci, kontrolowany retry, DLQ i correlation ID.
- Brak długich synchronicznych łańcuchów wywołań usług.

## Warstwy usługi
1. Domain — encje, value objects, reguły i zdarzenia domenowe.
2. Application — przypadki użycia, komendy, zapytania i porty.
3. Infrastructure — PostgreSQL, RabbitMQ, Redis, Discord i zewnętrzne API.
4. Interface — HTTP, worker, CLI lub handler zdarzeń.

Domain i Application nie importują frameworków ani adapterów infrastrukturalnych.

## Stos
- TypeScript strict
- Node.js 24 LTS
- NestJS 11
- Fastify
- PostgreSQL
- Redis
- RabbitMQ
- Web: Next.js App Router
- Admin: React + Vite + React Router

## Zasada ewolucji
Wydzielenie repozytorium, zmiana języka, dodanie brokera, zmiana własności danych albo utworzenie nowej krytycznej usługi wymaga ADR-u.
