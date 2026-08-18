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
- Runtime: production `node dist/<package-path>/src/main.js` (same as package `start`; obrazy Nest **nie** używają `pnpm run dev` / tsx)
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

`admin` (`VITE_*`) i `web` (`NEXT_PUBLIC_*`) wymagają **publicznego origin api-gateway w czasie buildu obrazu**. Nie ustawiaj w Dockerfile `ARG VAR=` z pustym defaultem — nadpisuje to zmienne Zeabur pustym stringiem i w przeglądarce zostaje relative URL albo localhost.

Produkcja:

- `ACTIVITY_TRUST_ACTOR_HEADERS=false`
- `API_GATEWAY_FORWARD_ACTOR_HEADERS=false`
- bez `VITE_ADMIN_DEV_ACTOR_*` na serwisie `admin`

## 6. Redeploy i weryfikacja

**Jeśli `discord-gateway` ma status Crashed:** najpierw upewnij się, że deploy idzie z
**najnowszego** commita na `cursor/p4-1-activity-domain` (SHA ≥ `e53b1a4` — poprawka
`CMD` → `dist/apps/discord-gateway/src/main.js`). Stary obraz szukał `dist/main.js` i
padał w pętli restartów.

1. Variables → **Redeploy** każdego serwisu (kolejność: add-ony → migrate → apps).
2. `discord-gateway` — wymagane przy `DISCORD_ACTIVITY_ENABLED=true`:
   `ACTIVITY_ORGANIZATION_ID`, `ACTIVITY_PROJECTION_SHARED_SECRET`, `ACTIVITY_SERVICE_BASE_URL`.
3. Sprawdź Logs (brak tokenów w logach).
4. `GET /health/live` → 200; `GET /health/discord` → `state: ready` gdy bot online.
5. Discord: bot online na `1534228693017432124`, Centrum hub z accent #D48632 (DZIAŁAJ/TWOJE).

## 7. Lokalne budowanie obrazów (opcjonalnie)

```text
docker build -f Dockerfile.discord-gateway -t v2-discord-gateway .
docker build -f Dockerfile.activity-service -t v2-activity-service .
docker build -f Dockerfile.api-gateway -t v2-api-gateway .
docker build -f Dockerfile.identity-service -t v2-identity-service .
docker build -f Dockerfile.authorization-service -t v2-authorization-service .
```

`web` i `admin` muszą dostać publiczny API origin w środowisku buildera (nie przez puste `ARG`):

```text
# PowerShell
$env:NEXT_PUBLIC_API_BASE_URL='https://v2-api.zeabur.app'
$env:NEXT_PUBLIC_IDENTITY_URL='https://v2-api.zeabur.app'
$env:NEXT_PUBLIC_WEB_ORIGIN='https://v2-web.zeabur.app'
docker build -f Dockerfile.web -t v2-web .

$env:VITE_API_BASE_URL='https://v2-api.zeabur.app'
docker build -f Dockerfile.admin -t v2-admin .
```

## 8. Macierz serwisów i Definition of Runtime Complete

Każdy **nowy serwis aplikacyjny** utworzony w **zatwierdzonym** etapie musi od razu trafić do tej macierzy (i do [ZEABUR_OWNER_VARIABLES.md](./ZEABUR_OWNER_VARIABLES.md)). Nie twórz serwisów produktowych na zapas (watch/room/search/marketplace/reservation/music).

Aktualna macierz P4:

| Serwis                  | Dockerfile                         | Public |
| ----------------------- | ---------------------------------- | ------ |
| `authorization-service` | `Dockerfile.authorization-service` | NO     |
| `identity-service`      | `Dockerfile.identity-service`      | NO     |
| `activity-service`      | `Dockerfile.activity-service`      | NO     |
| `api-gateway`           | `Dockerfile.api-gateway`           | YES    |
| `discord-gateway`       | `Dockerfile.discord-gateway`       | NO\*   |
| `admin`                 | `Dockerfile.admin`                 | YES    |
| `web`                   | `Dockerfile.web`                   | YES    |
| `postgres-*` / `redis`  | add-on                             | NO     |

\* Opcjonalny publiczny health `discord-gateway`.

**Definition of Runtime Complete** (każdy serwis z macierzy):

1. branch (`cursor/p4-1-activity-domain` do APPROVED)
2. Dockerfile / `ZBPACK_DOCKERFILE_NAME`
3. zmienne (nazwy + typ PUBLIC / SECRET / REFERENCE)
4. zależności (add-on / internal URL)
5. build
6. deploy
7. health / ready
8. running revision (SHA)
9. logi (bez wycieku sekretów)
10. integration smoke
11. restart / reconcile gdzie dotyczy

Lokalny `pnpm validate` **nie** zastępuje tego checklistu.

Obecny project testowy może mieć **jeden** add-on Postgres z osobnymi migracjami per usługa. Docelowo ADR-0004 nadal wymaga osobnych baz/kont; wspólny connection string do cudzej bazy jest błędem.
