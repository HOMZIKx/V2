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

## 6. Continuous deploy (Git push → Zeabur)

Serwisy w project `untitled-1` są typu **OCI upload** (nie natywny Git trigger). Auto-update po pushu:

1. **GitHub Actions** — workflow [`.github/workflows/zeabur-deploy.yml`](../../.github/workflows/zeabur-deploy.yml) na każdy push do `main` / `cursor/**`.
2. Skrypt [`tools/scripts/zeabur-sync-and-deploy.mjs`](../../tools/scripts/zeabur-sync-and-deploy.mjs):
   - czyta `Dockerfile.*` z tipa gałęzi,
   - `updateDockerfile` (pełna treść — wymagane dla upload/OCI),
   - `npx zeabur deploy` per serwis (kolejność z rejestru).
3. Sekret repo: **`ZEABUR_TOKEN`** (Zeabur → Developer → API Tokens). `ZEABUR_ENV_ID=6a720a3e5f062718bc7b3421` jest w workflow.

Lokalnie (po `zeabur auth login`):

```text
pnpm zeabur:deploy
pnpm zeabur:smoke
```

**Nie używaj** suffixu `Dockerfile.discord-gateway` jako treści dockerfile na upload — Zeabur wtedy buduje string zamiast pliku. **`ZBPACK_DOCKERFILE_NAME`** = suffix (np. `discord-gateway`); sync skrypt wysyła pełny Dockerfile z repo.

Docelowo (gdy serwisy będą natywnym Git source): podłącz GitHub w UI → push sam triggeruje build bez upload API.

## 7. Redeploy i weryfikacja

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

## 8. Lokalne budowanie obrazów (opcjonalnie)

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

## 9. Macierz serwisów i Definition of Runtime Complete

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

Operability docs (no secret values):

- [HEALTH.md](./HEALTH.md)
- [PUBLIC_EXPOSURE.md](./PUBLIC_EXPOSURE.md)
- [ROLLBACK.md](./ROLLBACK.md)
- [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)
- [MIGRATION_SAFETY.md](./MIGRATION_SAFETY.md)
- [INCIDENT_RUNBOOK.md](../ops/INCIDENT_RUNBOOK.md)

Obecny project testowy może mieć **jeden** add-on Postgres z osobnymi migracjami per usługa. Docelowo ADR-0004 nadal wymaga osobnych baz/kont; wspólny connection string do cudzej bazy jest błędem.

## 10. Rejestr serwisów i operability

Źródło prawdy: [`tools/runtime/service-registry.json`](../../tools/runtime/service-registry.json).

Każdy nowy `Dockerfile.<service>` w root repo musi mieć wpis APP w rejestrze (CI: `pnpm architecture:check` + `pnpm runtime:doctor`). Nie dodawaj RabbitMQ ani serwisów produktowych spoza zatwierdzonego etapu.

### Runtime doctor

```text
pnpm runtime:doctor
```

Sprawdza rejestr, mapowanie Dockerfile, kontrakt bake frontend (brak pustego `ARG VAR=`). Zwraca `PASS` / `WARN` / `FAIL`. Opcjonalne publiczne URL-e (nie wymagane w PR CI):

```text
$env:V2_SMOKE_API_BASE='https://v2-api.zeabur.app'
$env:V2_SMOKE_ADMIN_BASE='https://v2-admin.zeabur.app'
$env:V2_SMOKE_WEB_BASE='https://v2-web.zeabur.app'
$env:V2_EXPECTED_SHA='<sha z gałęzi>'
pnpm runtime:doctor
```

Niedostępność sieci to `BLOCKED_EXTERNAL`, nie czerwone PR CI.

### Smoke wdrożenia (tylko odczyt)

```text
$env:V2_SMOKE_API_BASE='https://v2-api.zeabur.app'
$env:V2_SMOKE_ADMIN_BASE='https://v2-admin.zeabur.app'
$env:V2_SMOKE_WEB_BASE='https://v2-web.zeabur.app'
pnpm smoke:runtime
```

Bez mutacji danych produkcyjnych. `pnpm test:runtime-smoke` nadal dotyczy lokalnych artefaktów `dist`, nie Zeabur.

### Wersja działającego procesu

`GET /health/live` (Nest) oraz `GET /health` (WWW) zwracają `gitCommitSha` i `appVersion` z `GIT_COMMIT_SHA` / `APP_VERSION`. Ustaw te zmienne na **SHA obrazu**, nie na stary ręczny skrót. Porównanie: `V2_EXPECTED_SHA` vs running → `MATCH` / `MISMATCH` / `UNKNOWN`.
