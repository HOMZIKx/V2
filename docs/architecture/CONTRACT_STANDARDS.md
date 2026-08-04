# Standardy kontraktów

## Kontrakty synchroniczne

Operacje wymagające natychmiastowej odpowiedzi będą dokumentowane w OpenAPI.
W fundamencie API Gateway ma bazową konfigurację OpenAPI pod `/openapi`, dostępną
wyłącznie poza środowiskiem produkcyjnym. Nie istnieją jeszcze endpointy
biznesowe ani opublikowany kontrakt domenowy.

Nowe API powinno mieć jawnie wersjonowany kontrakt, runtime validation wejść i
nie może ujawniać modeli wewnętrznych usługi jako kontraktów transportowych.

## Kontrakty asynchroniczne

Miejscem przygotowanym na kontrakty zdarzeń jest
`packages/contracts/src/events`. Katalog zawiera obecnie wyłącznie placeholder
i nie definiuje zdarzeń biznesowych. Gdy pojawią się zdarzenia, ich schematy
AsyncAPI lub JSON Schema będą wersjonowane przez usługę publikującą i
udostępniane jako kontrakty transportowe.

## Intencja wersjonowania

- zmiany niekompatybilne wymagają nowej wersji kontraktu;
- zmiany kompatybilne powinny być addytywne;
- konsument nie zakłada nieudokumentowanych pól;
- właściciel kontraktu dokumentuje semantykę, producenta i kompatybilność przed
  jego użyciem między usługami.

Transport RabbitMQ, Outbox, retry, DLQ oraz rzeczywiste zdarzenia nie są
zaimplementowane w Promptcie 0.
