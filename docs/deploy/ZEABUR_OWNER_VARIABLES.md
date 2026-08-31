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

| Klucz                          | Tag          | Wartość                                                         |
| ------------------------------ | ------------ | --------------------------------------------------------------- |
| `NODE_ENV`                     | PUBLIC VALUE | `production`                                                    |
| `ALLOW_PRODUCTION_CONNECTIONS` | PUBLIC VALUE | `true`                                                          |
| `HOST`                         | PUBLIC VALUE | `0.0.0.0`                                                       |
| `APP_VERSION`                  | PUBLIC VALUE | np. `0.1.0-zeabur` (label; opcjonalnie)                         |
| `GIT_COMMIT_SHA`               | PUBLIC VALUE | **opcjonalnie** — nadpisuje tylko gdy brak bake; preferuj obraz |

> **Revision / Discord `/status`:** obrazy Nest/WWW/Admin wypiekają
> `V2_IMAGE_GIT_COMMIT_SHA` z Zeabur `ZEABUR_GIT_COMMIT_SHA` w czasie buildu.
> Health i Discord biorą **najpierw** bake z obrazu, potem ręczne `GIT_COMMIT_SHA`.
> Po redeployu z tipu brancha **nie** musisz ręcznie aktualizować `GIT_COMMIT_SHA`
> (stary skrót w Variables nie kłamie już o wersji). Opcjonalnie usuń przestarzałe
> `GIT_COMMIT_SHA` z Variables albo ustaw je na tip przy każdym redeployu.
>
> Agent / CI: `ZEABUR_TOKEN` + `ZEABUR_ENV_ID` →
> `node ./tools/scripts/zeabur-redeploy.mjs`

---

## `discord-gateway`

| Klucz                                   | Tag                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `ZBPACK_DOCKERFILE_NAME`                | PUBLIC VALUE = `discord-gateway`                                                  |
| `DISCORD_GATEWAY_HOST`                  | PUBLIC VALUE = `0.0.0.0`                                                          |
| `DISCORD_ENABLED`                       | PUBLIC VALUE = `true`                                                             |
| `DISCORD_APPLICATION_ID`                | PUBLIC VALUE                                                                      |
| `DISCORD_TOKEN`                         | SECRET                                                                            |
| `DISCORD_TEST_GUILD_ID`                 | PUBLIC VALUE = `1534228693017432124`                                              |
| `DISCORD_TEST_OPERATOR_IDS`             | PUBLIC VALUE (Twoje Discord snowflake)                                            |
| `DISCORD_COMPONENT_SIGNING_SECRET`      | SECRET (≥32)                                                                      |
| `DISCORD_AUTO_REGISTER_GUILD_COMMANDS`  | PUBLIC VALUE = `true`                                                             |
| `DISCORD_AUTO_RECONCILE_HUB_ON_STARTUP` | PUBLIC VALUE = `true` (domyślnie — hub odświeża się po każdym redeploy gateway)   |
| `DISCORD_STRICT_GUILD_ISOLATION`        | PUBLIC VALUE = `true`                                                             |
| `DISCORD_ACTIVITY_ENABLED`              | PUBLIC VALUE = `true`                                                             |
| `ACTIVITY_ORGANIZATION_ID`              | PUBLIC VALUE (wymagane gdy `DISCORD_ACTIVITY_ENABLED=true`)                       |
| `ACTIVITY_PROJECTION_SHARED_SECRET`     | SECRET (ten sam co activity)                                                      |
| `ACTIVITY_SERVICE_BASE_URL`             | INTERNAL → `http://activity-service:4400` (dostosuj do DNS Zeabur)                |
| `DISCORD_TEST_CHANNEL_ID`               | PUBLIC VALUE (opcjonalnie)                                                        |
| `DISCORD_ACTIVITY_ALLOWED_GUILD_IDS`    | PUBLIC VALUE (P4.5; comma-separated extra guilds; home = `DISCORD_TEST_GUILD_ID`) |
| `DISCORD_ACTIVITY_RABBITMQ_URL`         | SECRET/INTERNAL (P4.5; empty = HTTP-only consumer idle)                           |

---

## `activity-service`

| Klucz                                  | Tag                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `ZBPACK_DOCKERFILE_NAME`               | PUBLIC VALUE = `activity-service`                                                   |
| `ACTIVITY_SERVICE_HOST`                | PUBLIC VALUE = `0.0.0.0`                                                            |
| `ACTIVITY_SERVICE_PORT`                | PUBLIC VALUE = `4400`                                                               |
| `ACTIVITY_DATABASE_URL`                | REFERENCE (`postgres-activity`)                                                     |
| `ACTIVITY_REDIS_URL`                   | REFERENCE (`redis`) — **wymagane gdy `ACTIVITY_ENABLED=true`**                      |
| `ACTIVITY_OUTBOX_WORKER_ENABLED`       | PUBLIC VALUE = `true`                                                               |
| `ACTIVITY_DISCORD_PROJECTION_BASE_URL` | INTERNAL → `http://discord-gateway.zeabur.internal:8080` (dostosuj DNS/port Zeabur) |
| `ACTIVITY_PROJECTION_SHARED_SECRET`    | SECRET (ten sam co discord-gateway)                                                 |
| `ACTIVITY_OUTBOX_TRANSPORT`            | PUBLIC VALUE = `http` \| `rabbitmq` \| `dual` (P4.5; default `http`)                |
| `ACTIVITY_RABBITMQ_URL`                | SECRET/INTERNAL (wymagane gdy transport ≠ `http`)                                   |
| `ACTIVITY_MULTI_GUILD_ENABLED`         | PUBLIC VALUE = `true` gdy multi-guild publish włączony                              |
| `ACTIVITY_TRUST_ACTOR_HEADERS`         | PUBLIC VALUE = `false` (**zawsze** na production)                                   |
| `ACTIVITY_ALLOW_TEST_SEED`             | PUBLIC VALUE = `false`                                                              |
| `ACTIVITY_ORGANIZATION_ID`             | PUBLIC VALUE                                                                        |
| `ACTIVITY_ENABLED`                     | PUBLIC VALUE = `false` **albo** `true` tylko z pełnym zestawem poniżej              |

### Gdy `ACTIVITY_ENABLED=true` (wymagane nazwy)

| Klucz                                  | Tag                                       |
| -------------------------------------- | ----------------------------------------- |
| `ACTIVITY_AUTHORIZATION_BASE_URL`      | INTERNAL                                  |
| `ACTIVITY_AUTHORIZATION_ASSERTION_AUD` | PUBLIC VALUE                              |
| `ACTIVITY_TO_AUTHZ_CLIENT_ID`          | PUBLIC VALUE                              |
| `ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM`    | SECRET                                    |
| `ACTIVITY_TO_AUTHZ_ACTIVE_KID`         | PUBLIC VALUE                              |
| `ACTIVITY_INBOUND_CLIENTS_JSON`        | SECRET (JSON kluczy publicznych klientów) |
| `ACTIVITY_ASSERTION_AUD`               | PUBLIC VALUE                              |

**Inbound `allowed_operations` (discord-gateway):** include at least
`activity_hub_projection` (narrow Hub shell reconcile — **no** product AllowAll),
plus `activity_read` / `activity_mutate` / `activity_outbox` as needed.

**Security:** Production must **never** use `AllowAllAuthorizationClient` or
`PassThroughCharacterVerifyClient`. Hub paint uses `activity_hub_projection` or
Discord-local direct paint. Product/LFG require real Authorization + Identity S2S
(`ACTIVITY_ENABLED=true` + `ACTIVITY_IDENTITY_*` keys).

| Klucz                                       | Tag                |
| ------------------------------------------- | ------------------ |
| `ACTIVITY_TO_DISCORD_CLIENT_ID`             | PUBLIC VALUE       |
| `ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM`       | SECRET             |
| `ACTIVITY_TO_DISCORD_ACTIVE_KID`            | PUBLIC VALUE       |
| `ACTIVITY_DISCORD_ASSERTION_AUD`            | PUBLIC VALUE       |
| `ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS` | PUBLIC VALUE (≤60) |

Nie kopiuj „lokalnego .env” w ciemno — użyj **tych nazw**.

---

## `web` / `admin` (frontend)

Te serwisy budują się przez Dockerfile (`Dockerfile.web`, `Dockerfile.admin`). Build **musi** przejść przed startem kontenera.

| Klucz                               | Tag          | Kiedy                                                                  |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `ZBPACK_DOCKERFILE_NAME`            | PUBLIC VALUE | `web` lub `admin`                                                      |
| `VITE_API_BASE_URL`                 | PUBLIC VALUE | **admin**, build-time, public api-gateway                              |
| `NEXT_PUBLIC_API_BASE_URL`          | PUBLIC VALUE | **web**, build-time, public api-gateway                                |
| `NEXT_PUBLIC_IDENTITY_URL`          | PUBLIC VALUE | **web**, ten sam publiczny api-gateway                                 |
| `NEXT_PUBLIC_WEB_ORIGIN`            | PUBLIC VALUE | **web**, publiczny origin WWW                                          |
| `NEXT_PUBLIC_WEB_GUILDS`            | PUBLIC VALUE | **web**, build-time — JSON `[{"id":"…","name":"…"}]`                   |
| `NEXT_PUBLIC_DISCORD_TEST_GUILD_ID` | PUBLIC VALUE | **web**, build-time fallback gdy brak JSON (np. `1534228693017432124`) |

Bez `NEXT_PUBLIC_WEB_GUILDS` ani `NEXT_PUBLIC_DISCORD_TEST_GUILD_ID` w **buildu** WWW
pokazuje „Nie udało się ustalić serwera” — to nie jest UI dodawania serwera; lista
guildów jest konfiguracja deployu (P4.4).

Nie używaj `VITE_ADMIN_DEV_ACTOR_*` na production. Local/dev only.

Puste `ARG VAR=` w Dockerfile **nadpisuje** zmienne Zeabur i piecze pusty origin (relative `/activity/...` albo localhost). Obrazy `admin`/`web` muszą widzieć te zmienne w środowisku **buildu**.

Bez publicznego API origin Admin/WWW wołają zły host.

**Typowy błąd buildu (naprawiony w repo):** `Cannot find module '../../tools/vitest.shared.js'` — wynikał z typechecku `vitest.config.ts` w obrazie Docker bez folderu `tools/`. Po redeploy z najnowszego SHA build powinien przejść.

---

## `api-gateway`

| Klucz                               | Tag                                                                |
| ----------------------------------- | ------------------------------------------------------------------ |
| `ZBPACK_DOCKERFILE_NAME`            | PUBLIC VALUE = `api-gateway`                                       |
| `API_GATEWAY_HOST`                  | PUBLIC VALUE = `0.0.0.0`                                           |
| `ACTIVITY_SERVICE_BASE_URL`         | INTERNAL                                                           |
| `IDENTITY_SERVICE_BASE_URL`         | INTERNAL (WWW session)                                             |
| `API_GATEWAY_CORS_ORIGINS`          | PUBLIC VALUE (domeny `web` + `admin`)                              |
| `API_GATEWAY_FORWARD_ACTOR_HEADERS` | PUBLIC VALUE = `false` na production WWW (session→actor)           |
| `DISCORD_GATEWAY_BASE_URL`          | INTERNAL (discord-gateway origin for operator Discord diagnostics) |

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

Obrazy wypiekają `V2_IMAGE_GIT_COMMIT_SHA` z `ZEABUR_GIT_COMMIT_SHA` (build Git).
Health `GET /health/live` oraz Discord `/status` preferują bake z obrazu nad ręcznym
`GIT_COMMIT_SHA` Variable — żeby stary skrót w panelu Zeabur nie udawał starego builda.

Po redeployu Owner potwierdza:

- BRANCH: `cursor/p4-1-activity-domain`
- SHA z `https://v2-api.zeabur.app/health/live` = tip brancha
- Discord `/status` → to samo SHA

Redeploy wszystkich APP (wymaga tokenu API):

```text
pnpm zeabur:deploy
# lub: ZEABUR_TOKEN=... ZEABUR_ENV_ID=... node ./tools/scripts/zeabur-sync-and-deploy.mjs
```

Po każdym pushu do `cursor/**` / `main` workflow `zeabur-deploy.yml` robi to samo (sekret `ZEABUR_TOKEN` w GitHub).

„Deployment successful” bez zgodnego SHA w health **nie wystarczy**.

`identity-service` `IDENTITY_TRUSTED_ORIGINS` musi zawierać publiczne originy WWW i Admin, np. `https://v2-web.zeabur.app,https://v2-admin.zeabur.app` (oraz origin `IDENTITY_AUTH_BASE_URL`). Discord Developer Portal redirect:

`https://v2-api.zeabur.app/api/auth/callback/discord`

### Control Center: `callbackURL is not an allowed origin`

Ten JSON z `/identity/oauth/discord` oznacza, że `callbackURL` (origin Admin/WWW)
**nie** jest na liście `IDENTITY_TRUSTED_ORIGINS` Identity.

Naprawa właściciela (Zeabur → `identity-service` → Variables):

1. Ustaw `IDENTITY_TRUSTED_ORIGINS=https://v2-web.zeabur.app,https://v2-admin.zeabur.app`
2. Redeploy `identity-service` (i `api-gateway` jeśli CORS nie zawiera Admin)
3. Otwórz panel wyłącznie z `https://v2-admin.zeabur.app` (nie `localhost` + prod API)
4. Kliknij ponownie „Zaloguj przez Discord”

Cookie sesji jest host-only na `v2-api.zeabur.app`. WWW/Admin na innych hostach
Zeabur są cross-site: Identity ustawia `SameSite=None; Secure`. `API_GATEWAY_CORS_ORIGINS`
musi zawierać te same originy WWW i Admin. Po OAuth nie oczekuj cookie na
`v2-web.zeabur.app` — sesję sprawdza `GET /session/me` z `credentials: include`.

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
