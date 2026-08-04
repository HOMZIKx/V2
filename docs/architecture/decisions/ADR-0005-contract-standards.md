# ADR-0005: Standardy kontraktów OpenAPI i zdarzeń

- **Status:** Accepted
- **Data:** 2026-08-04

## Kontekst

Niezależne usługi potrzebują stabilnych kontraktów transportowych bez
udostępniania modeli domenowych lub odczytu cudzych baz.

## Decyzja

Kontrakty synchroniczne dokumentujemy w OpenAPI; API Gateway udostępnia
deweloperskie `/openapi` poza produkcją. Miejsce na kontrakty asynchroniczne
stanowi `packages/contracts/src/events`, gdzie przyszłe zdarzenia będą
opisywane przez wersjonowane AsyncAPI lub JSON Schema.

## Konsekwencje

- bieżący katalog zdarzeń jest placeholderem, ponieważ Prompt 0 nie definiuje
  zdarzeń biznesowych;
- producent usługi będzie właścicielem semantyki i wersji publikowanego
  kontraktu;
- niekompatybilne zmiany kontraktu wymagają nowej wersji;
- transport RabbitMQ, Outbox, retry i DLQ pozostają poza zakresem fundamentu.
