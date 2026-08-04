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

## Wspólna infrastruktura nie jest źródłem prawdy

Redis i RabbitMQ są współdzieloną infrastrukturą techniczną. Nie są źródłem
prawdy dla danych biznesowych. Redis może później obsługiwać sesje, cache lub
koordynację, a RabbitMQ transport zdarzeń i zadań, lecz nie zmienia to
własności danych przez usługi.

Wymiana danych między usługami wymaga wersjonowanego kontraktu synchronicznego
lub zdarzenia; nie może być zastępowana cross-readem bazy.
