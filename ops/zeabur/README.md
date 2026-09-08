# Zeabur operations bridge

Stały kanał administracyjny ChatGPT/Codex/Cursor → GitHub Actions → Zeabur.

## Branch sterujący

Wszystkie operacje wykonuj na branchu:

`ops/zeabur-control`

Nie używaj do tego `preview/destiled-web`, ponieważ push na branch wdrożeniowy może uruchomić produkcyjny deployment.

## Sekret

Workflow używa GitHub Actions secret:

`zebur`

Nigdy nie zapisuj wartości tokenu w repo ani w logach.

## Uruchamianie operacji

Zmień `ops/zeabur/command.json` na branchu `ops/zeabur-control`. Push uruchamia `.github/workflows/zeabur-ops.yml`.

Wynik jest zapisywany jako artefakt `zeabur-result-<run_id>` i w GitHub Actions summary. Runner sanitizuje typowe sekrety i connection strings.

## Tryby

### `auth`
Sprawdza token przez `me`.

### `schema`
Pobiera listę dostępnych pól Query i Mutation z aktualnego GraphQL API. Używaj tego przed zgadywaniem nazw operacji Zeabura.

### `graphql_read`
Dowolne zapytanie GraphQL typu query. Mutacje i subskrypcje są blokowane.

```json
{
  "requestId": "inventory-1",
  "mode": "graphql_read",
  "query": "query Inventory { projects { edges { node { _id name } } } }",
  "variables": {}
}
```

### `graphql_write`
Kontrolowana mutacja GraphQL. Wymaga:

`"confirm": "ZEABUR_WRITE_APPROVED"`

Operacje destrukcyjne (`delete`, `remove`, `destroy`, `purge`, `drop`, `terminate`, `suspend`, `executeCommand`, `deployTemplate`) są dodatkowo blokowane i wymagają jawnej zgody właściciela oraz:

`"confirmDestructive": "DESTILED_DESTRUCTIVE_APPROVED"`

Nie używaj tego pola bez wyraźnego polecenia właściciela dotyczącego destrukcyjnej operacji.

### `service_restart`
Kontrolowany restart usługi przez Zeabur GraphQL `restartService`. Wymaga `serviceId`, `environmentId` i:

`"confirm": "ZEABUR_WRITE_APPROVED"`

```json
{
  "requestId": "restart-example-1",
  "mode": "service_restart",
  "serviceId": "<zeabur-service-id>",
  "environmentId": "<zeabur-environment-id>",
  "confirm": "ZEABUR_WRITE_APPROVED"
}
```

Restart nie korzysta z Zeabur CLI, ponieważ jego składnia zmieniała się między wersjami i wcześniej złamała automatyzację przez usuniętą flagę `--service-name`.

### `cli`
Dozwolone akcje odczytowe:

- `workspace:list`
- `workspace:current`
- `project:list`
- `service:list`
- `deployment:get`
- `logs:runtime`
- `logs:build`

## Zasady operacyjne

1. Najpierw odczyt/inwentaryzacja, dopiero później zmiana.
2. Nie zgaduj nazw mutacji — użyj `schema`.
3. Nie zapisuj sekretów w `command.json`.
4. Zmiany konfiguracji po wykonaniu weryfikuj ponownym odczytem.
5. Restart/redeploy nie jest dowodem działania funkcji; po nim wykonaj runtime/E2E.
6. Każdą naprawę wynikającą z pracy na Zeaburze wpisz do `docs/ai/FIX_LOG.md` na branchu wdrożeniowym.
