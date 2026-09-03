# Zeabur — wdrożenie stosu V2

Osobny project Zeabur dla V2. **Nie łącz** ze starym `dobry-temat`.

Źródło: `github.com/HOMZIKx/V2.git`  
Decyzja: [ADR-0008](../architecture/decisions/ADR-0008-zeabur-full-stack-deploy.md)

## 1. Project

1. Utwórz / użyj projectu **niezależnego** od legacy (możesz nazwać np. `v2` zamiast `untitled-1`).
2. Region: dowolny (np. Hetzner Helsinki).
3. Podłącz repo `HOMZIKx/V2` (branch roboczy `cursor/p1-discord-test-harness` albo `main` po merge).

## 2. Add-ony (najpierw)

Dodaj **wyłącznie nowe** add-ony w tym projekcie:

| Add-on (sugerowana nazwa serwisu) | Cel                                     |
| --------------------------------- | --------------------------------------- |
| `postgres-identity`               | baza + user dla `identity-service`      |
| `postgres-authorization`          | baza + user dla `authorization-service` |
| `postgres-player-team`            | baza + user dla `player-team-service`   |
| `redis`                           | współdzielona infrastruktura            |
| `rabbitmq`                        | współdzielona infrastruktura            |

Nie używaj connection stringów ze starego projektu.

## 3. Serwisy aplikacji

Usuń / nie używaj jednego serwisu `v2` na całe monorepo. Utwórz **osobny serwis Git** dla każdej nazwy poniżej (nazwa musi pasować do `Dockerfile.<nazwa>`):

| Nazwa serwisu Zeabur    | Dockerfile                         | Health                                  |
| ----------------------- | ---------------------------------- | --------------------------------------- |
| `web`                   | `Dockerfile.web`                   | `GET /health`                           |
| `admin`                 | `Dockerfile.admin`                 | `GET /`                                 |
| `api-gateway`           | `Dockerfile.api-gateway`           | `GET /health/live`                      |
| `discord-gateway`       | `Dockerfile.discord-gateway`       | `GET /health/live` oraz `/health/ready` |
| `identity-service`      | `Dockerfile.identity-service`      | `GET /health/live`                      |
| `authorization-service` | `Dockerfile.authorization-service` | `GET /health/live`                      |
| `player-team-service`   | `Dockerfile.player-team-service`   | `GET /health/live`, `GET /health/ready` |

Dla każdego serwisu:

- Root Directory: `/` (repo root)
- Builder: Dockerfile (auto po nazwie albo `ZBPACK_DOCKERFILE_NAME=<nazwa>`)
- Restart: domyślny restart Zeabur (always / on-failure)
- Public networking: włącz dla `web`, `admin`, `api-gateway`, `player-team-service` (lokalny web musi móc bić w API)
- `discord-gateway` musi mieć stały proces (WebSocket outbound do Discord) — nie używaj scale-to-zero

## 4. Zależności startu (kolejność)

1. Add-ony healthy
2. `identity-service`, `authorization-service`, `player-team-service`
3. `api-gateway`
4. `web`, `admin`
5. `discord-gateway` (po ustawieniu sekretów Discord)

## 5. Zmienne

Pełna lista wartości do ręcznego wklejenia: [ZEABUR_OWNER_VARIABLES.md](./ZEABUR_OWNER_VARIABLES.md).

**Nigdy** nie commituj sekretów ani nie wklejaj tokenów do czatu / PR.

## 6. Redeploy i weryfikacja

1. Wklej Variables → **Redeploy** każdego serwisu.
2. Sprawdź Logs (brak tokenów w logach).
3. HTTP health publiczny / wewnętrzny.
4. Discord: bot online na `1534228693017432124`, `/status`, `/panel-test`.

## 7. Lokalne budowanie obrazów (opcjonalnie)

```text
docker build -f Dockerfile.discord-gateway -t v2-discord-gateway .
docker build -f Dockerfile.api-gateway -t v2-api-gateway .
docker build -f Dockerfile.player-team-service -t v2-player-team-service .
docker build -f Dockerfile.authorization-service -t v2-authorization-service .
docker build -f Dockerfile.web -t v2-web .
docker build -f Dockerfile.admin -t v2-admin .
```
