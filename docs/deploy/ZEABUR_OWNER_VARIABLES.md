# Zeabur — wartości i mapping (właściciel)

Wklej Variables w Zeabur UI. **Nie commituj sekretów. Nie wklejaj tokenów do czatu.**

**PRE-MERGE TEST BRANCH:** `cursor/p4-1-activity-domain` (nie `main`).

---

## Service mapping (monorepo)

| SERVICE                 | DOCKERFILE                         | `ZBPACK_DOCKERFILE_NAME` | BRANCH                        | REQUIRED ADD-ONS                 | HEALTH             | PUBLIC DOMAIN   |
| ----------------------- | ---------------------------------- | ------------------------ | ----------------------------- | -------------------------------- | ------------------ | --------------- |
| `discord-gateway`       | `Dockerfile.discord-gateway`       | `discord-gateway`        | `cursor/p4-1-activity-domain` | — (token Discord)                | `GET /health/live` | NO\*            |
| `activity-service`      | `Dockerfile.activity-service`      | `activity-service`       | `cursor/p4-1-activity-domain` | `postgres-activity`, `redis`\*\* | `GET /health/live` | NO              |
| `api-gateway`           | `Dockerfile.api-gateway`           | `api-gateway`            | `cursor/p4-1-activity-domain` | —                                | `GET /health/live` | YES (Admin/WWW) |
| `identity-service`      | `Dockerfile.identity-service`      | `identity-service`       | `cursor/p4-1-activity-domain` | `postgres-identity`, `redis`     | `GET /health/live` | NO              |
| `authorization-service` | `Dockerfile.authorization-service` | `authorization-service`  | `cursor/p4-1-activity-domain` | `postgres-authorization`         | `GET /health/live` | NO              |
| `web`                   | `Dockerfile.web`                   | `web`                    | `cursor/p4-1-activity-domain` | —                                | `GET /health`      | YES             |
| `admin`                 | `Dockerfile.admin`                 | `admin`                  | `cursor/p4-1-activity-domain` | —                                | `GET /`            | YES             |

\* Opcjonalnie wystaw health `discord-gateway` publicznie do diagnostyki.  
\*\* `redis` jest wymagany gdy `ACTIVITY_ENABLED=true` (JTI replay). Przy samym outbox worker + projection secret wystarczy Postgres; pełne Centrum z authz wymaga Redis.

**UWAGA `ZBPACK_DOCKERFILE_NAME`:** podajesz **suffix** (np. `discord-gateway`), **nie** pełną nazwę `Dockerfile.discord-gateway`.

Root Directory każdego serwisu Git: `/` (repo root).  
Builder: Dockerfile.  
**Nie używaj** jednego serwisu `v2` na całe monorepo.

---

## Add-ony (główna lista)

| Add-on (sugerowana nazwa) | Cel                                   | Typ wartości |
| ------------------------- | ------------------------------------- | ------------ |
| `postgres-activity`       | baza `activity-service`               | REFERENCE    |
| `postgres-identity`       | baza `identity-service`               | REFERENCE    |
| `postgres-authorization`  | baza `authorization-service`          | REFERENCE    |
| `redis`                   | Identity + Activity JTI (gdy enabled) | REFERENCE    |

**Bez RabbitMQ** w tym deployu (P4.5 out of scope).

---

## Minimalny test Centrum (Discord 24/7)

Wymagane:

1. `postgres-activity`
2. `activity-service`
3. `discord-gateway`
4. wspólny `ACTIVITY_PROJECTION_SHARED_SECRET` (SECRET) na obu usługach
5. `ACTIVITY_DISCORD_PROJECTION_BASE_URL` → internal URL `discord-gateway`
6. Migrations activity (patrz niżej)

Gdy `ACTIVITY_ENABLED=true` (pełny authz + JWT inbound):

- dodatkowo `authorization-service`, `identity-service`, `redis`
- pełna lista JWT/PEM poniżej — **bez** `ACTIVITY_TRUST_ACTOR_HEADERS=true` na production

---

## Legend wartości

| Tag          | Znaczenie                                   |
| ------------ | ------------------------------------------- |
| SECRET       | sekret — tylko Zeabur Variables (Secret)    |
| REFERENCE    | connection string / URL z add-onu Zeabur    |
| PUBLIC VALUE | bezpieczne do checklisty (nie sekret)       |
| INTERNAL     | URL wewnętrzny serwisu Zeabur (preferowane) |

---

## Wspólne (wszystkie app services)

| Klucz                          | Tag          | Wartość                  |
| ------------------------------ | ------------ | ------------------------ |
| `NODE_ENV`                     | PUBLIC VALUE | `production`             |
| `ALLOW_PRODUCTION_CONNECTIONS` | PUBLIC VALUE | `true`                   |
| `HOST`                         | PUBLIC VALUE | `0.0.0.0`                |
| `APP_VERSION`                  | PUBLIC VALUE | np. `0.1.0-zeabur`       |
| `GIT_COMMIT_SHA`               | PUBLIC VALUE | SHA deployu (branch tip) |

---

## `discord-gateway`

| Klucz                                  | Tag                                                                |
| -------------------------------------- | ------------------------------------------------------------------ |
| `ZBPACK_DOCKERFILE_NAME`               | PUBLIC VALUE = `discord-gateway`                                   |
| `DISCORD_GATEWAY_HOST`                 | PUBLIC VALUE = `0.0.0.0`                                           |
| `DISCORD_ENABLED`                      | PUBLIC VALUE = `true`                                              |
| `DISCORD_APPLICATION_ID`               | PUBLIC VALUE                                                       |
| `DISCORD_TOKEN`                        | SECRET                                                             |
| `DISCORD_TEST_GUILD_ID`                | PUBLIC VALUE = `1534228693017432124`                               |
| `DISCORD_TEST_OPERATOR_IDS`            | PUBLIC VALUE (Twoje Discord snowflake)                             |
| `DISCORD_COMPONENT_SIGNING_SECRET`     | SECRET (≥32)                                                       |
| `DISCORD_AUTO_REGISTER_GUILD_COMMANDS` | PUBLIC VALUE = `true`                                              |
| `DISCORD_STRICT_GUILD_ISOLATION`       | PUBLIC VALUE = `true`                                              |
| `DISCORD_ACTIVITY_ENABLED`             | PUBLIC VALUE = `true`                                              |
| `ACTIVITY_PROJECTION_SHARED_SECRET`    | SECRET (ten sam co activity)                                       |
| `ACTIVITY_SERVICE_BASE_URL`            | INTERNAL → `http://activity-service:4400` (dostosuj do DNS Zeabur) |
| `DISCORD_TEST_CHANNEL_ID`              | PUBLIC VALUE (opcjonalnie)                                         |

---

## `activity-service`

| Klucz                                  | Tag                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `ZBPACK_DOCKERFILE_NAME`               | PUBLIC VALUE = `activity-service`                                      |
| `ACTIVITY_SERVICE_HOST`                | PUBLIC VALUE = `0.0.0.0`                                               |
| `ACTIVITY_SERVICE_PORT`                | PUBLIC VALUE = `4400`                                                  |
| `ACTIVITY_DATABASE_URL`                | REFERENCE (`postgres-activity`)                                        |
| `ACTIVITY_REDIS_URL`                   | REFERENCE (`redis`) — **wymagane gdy `ACTIVITY_ENABLED=true`**         |
| `ACTIVITY_OUTBOX_WORKER_ENABLED`       | PUBLIC VALUE = `true`                                                  |
| `ACTIVITY_DISCORD_PROJECTION_BASE_URL` | INTERNAL → `http://discord-gateway:4100`                               |
| `ACTIVITY_PROJECTION_SHARED_SECRET`    | SECRET (ten sam co discord-gateway)                                    |
| `ACTIVITY_TRUST_ACTOR_HEADERS`         | PUBLIC VALUE = `false` (**zawsze** na production)                      |
| `ACTIVITY_ALLOW_TEST_SEED`             | PUBLIC VALUE = `false`                                                 |
| `ACTIVITY_ORGANIZATION_ID`             | PUBLIC VALUE                                                           |
| `ACTIVITY_ENABLED`                     | PUBLIC VALUE = `false` **albo** `true` tylko z pełnym zestawem poniżej |

### Gdy `ACTIVITY_ENABLED=true` (wymagane nazwy)

| Klucz                                       | Tag                                       |
| ------------------------------------------- | ----------------------------------------- |
| `ACTIVITY_AUTHORIZATION_BASE_URL`           | INTERNAL                                  |
| `ACTIVITY_AUTHORIZATION_ASSERTION_AUD`      | PUBLIC VALUE                              |
| `ACTIVITY_TO_AUTHZ_CLIENT_ID`               | PUBLIC VALUE                              |
| `ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM`         | SECRET                                    |
| `ACTIVITY_TO_AUTHZ_ACTIVE_KID`              | PUBLIC VALUE                              |
| `ACTIVITY_INBOUND_CLIENTS_JSON`             | SECRET (JSON kluczy publicznych klientów) |
| `ACTIVITY_ASSERTION_AUD`                    | PUBLIC VALUE                              |
| `ACTIVITY_TO_DISCORD_CLIENT_ID`             | PUBLIC VALUE                              |
| `ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM`       | SECRET                                    |
| `ACTIVITY_TO_DISCORD_ACTIVE_KID`            | PUBLIC VALUE                              |
| `ACTIVITY_DISCORD_ASSERTION_AUD`            | PUBLIC VALUE                              |
| `ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS` | PUBLIC VALUE (≤60)                        |

Nie kopiuj „lokalnego .env” w ciemno — użyj **tych nazw**.

---

## `api-gateway`

| Klucz                               | Tag                                                      |
| ----------------------------------- | -------------------------------------------------------- |
| `ZBPACK_DOCKERFILE_NAME`            | PUBLIC VALUE = `api-gateway`                             |
| `API_GATEWAY_HOST`                  | PUBLIC VALUE = `0.0.0.0`                                 |
| `ACTIVITY_SERVICE_BASE_URL`         | INTERNAL                                                 |
| `IDENTITY_SERVICE_BASE_URL`         | INTERNAL (WWW session)                                   |
| `API_GATEWAY_CORS_ORIGINS`          | PUBLIC VALUE (domeny `web` + `admin`)                    |
| `API_GATEWAY_FORWARD_ACTOR_HEADERS` | PUBLIC VALUE = `false` na production WWW (session→actor) |

---

## `identity-service` / `authorization-service`

| Serwis                  | Klucze (nazwy)                                                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity-service`      | `ZBPACK_DOCKERFILE_NAME=identity-service`, `IDENTITY_SERVICE_HOST=0.0.0.0`, `IDENTITY_DATABASE_URL` (REFERENCE), `IDENTITY_REDIS_URL` (REFERENCE), OAuth Discord client id/secret (SECRET), `IDENTITY_BETTER_AUTH_SECRET` (SECRET), `IDENTITY_AUTH_BASE_URL`, `IDENTITY_TRUSTED_ORIGINS` |
| `authorization-service` | `ZBPACK_DOCKERFILE_NAME=authorization-service`, `AUTHORIZATION_SERVICE_HOST=0.0.0.0`, `AUTHORIZATION_DATABASE_URL` (REFERENCE), `AUTHORIZATION_ENABLED`                                                                                                                                  |

---

## Migrations (bezpieczne, repeatable)

Nie rób destrukcyjnego resetu DB.

### Activity

```text
# z maszyny z dostępem do ACTIVITY_DATABASE_URL (URI Zeabur)
pnpm --dir services/activity-service migrate
```

Skrypty SQL w `services/activity-service/migrations/` są idempotentne (`IF NOT EXISTS` gdzie możliwe).

### Identity

```text
pnpm --dir services/identity-service migrate
```

(lub komenda migrate z package.json Identity — uruchom tylko gdy serwis Identity jest w zakresie deployu)

### Authorization

```text
pnpm --dir services/authorization-service migrate
```

Kolejność przy pełnym stosie: add-ony healthy → migrate identity/authz/activity → start app services.

---

## Weryfikacja wersji po deployu

Na każdym serwisie ustaw:

- `APP_VERSION`
- `GIT_COMMIT_SHA` = tip brancha `cursor/p4-1-activity-domain`

Owner potwierdza w logach startu / health metadata:

- BRANCH: `cursor/p4-1-activity-domain`
- SHA: `<FINAL HEAD>`

„Deployment successful” bez SHA **nie wystarczy**.

---

## Po wklejeniu Variables

1. Redeploy: `activity-service` → `discord-gateway` (potem gateway/web/admin jeśli w zakresie).
2. Sprawdź Logs (bez tokenów w output).
3. Discord: bot online na test guild → `/centrum-reconcile` (update in place, zero duplicate panel).
4. Napisz w czacie Cursor **bez sekretów**: Variables OK + Status serwisów + SHA.

---

## Explicit non-goals tego deployu

- NO merge do `main`
- NO P4.5 / RabbitMQ
- NO P4.6
- Issue #20 NOT implemented
