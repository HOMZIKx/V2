# Zeabur — wdrożenie stosu V2

Osobny project Zeabur dla V2. **Nie łącz** ze starym `dobry-temat`.

Źródło: `github.com/HOMZIKx/V2.git`  
Decyzja: [ADR-0008](../architecture/decisions/ADR-0008-zeabur-full-stack-deploy.md)

## 1. Project

1. Utwórz / użyj projectu **niezależnego** od legacy (możesz nazwać np. `v2` zamiast `untitled-1`).
2. Region: dowolny (np. Hetzner Helsinki).
3. Podłącz repo `HOMZIKx/V2` — **pre-merge test branch:** `cursor/p4-1-activity-domain` (nie `main` do czasu APPROVED).

## 2. Add-ony (najpierw)

Dodaj **wyłącznie nowe** add-ony w tym projekcie:

| Add-on (sugerowana nazwa serwisu) | Cel                                                    |
| --------------------------------- | ------------------------------------------------------ |
| `postgres-activity`               | baza + user dla `activity-service` (P4) — **wymagany** |
| `postgres-identity`               | baza + user dla `identity-service`                     |
| `postgres-authorization`          | baza + user dla `authorization-service`                |
| `redis`                           | Identity + Activity JTI gdy `ACTIVITY_ENABLED=true`    |

**Bez RabbitMQ** w deployu P4.1–P4.4 (P4.5 out of scope).

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
| `activity-service`      | `Dockerfile.activity-service`      | `GET /health/live`                      |

**P4 Centrum (Discord 24/7):** wymagane co najmniej `activity-service` +
`discord-gateway` + Postgres activity + Redis (+ Authorization/Identity gdy
`ACTIVITY_ENABLED=true`). Nie wystarczy sam stary harness P1.

Dla każdego serwisu:

- Root Directory: `/` (repo root)
- Builder: Dockerfile — ustaw `ZBPACK_DOCKERFILE_NAME=<suffix>` (np. `discord-gateway`, **nie** `Dockerfile.discord-gateway`)
- Runtime: production `node dist/main.js` (obrazy Nest **nie** używają `pnpm run dev` / tsx)
- Restart: domyślny restart Zeabur (always / on-failure)
- Public networking: włącz dla `web`, `admin`, `api-gateway` (oraz opcjonalnie health `discord-gateway`)
- `discord-gateway` musi mieć stały proces (WebSocket outbound do Discord) — nie używaj scale-to-zero

## 4. Zależności startu (kolejność)

1. Add-ony healthy
2. `identity-service`, `authorization-service`
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
docker build -f Dockerfile.activity-service -t v2-activity-service .
docker build -f Dockerfile.api-gateway -t v2-api-gateway .
docker build -f Dockerfile.identity-service -t v2-identity-service .
docker build -f Dockerfile.authorization-service -t v2-authorization-service .
docker build -f Dockerfile.web -t v2-web .
docker build -f Dockerfile.admin -t v2-admin .
```
