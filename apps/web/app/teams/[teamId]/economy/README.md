# Ekonomia zespołu

Katalog startowy jest budowany z istniejącego `apps/web/src/data/dobry-temat-item-catalog.json` przez `gameItemCatalog` i synchronizowany do trwałej tabeli `player_team_economy_items` przy pierwszym wejściu do modułu. Import jest idempotentny po nazwie kanonicznej. Nowe przedmioty rozpoznane przez AI mogą zostać dopisane do tej samej bazy.

Zasada podziału:
- pieniądze: procentowo,
- przedmioty: wyłącznie pełne sztuki (`totalQuantity` / `ourQuantity`).
