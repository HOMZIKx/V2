# Zeabur — wartości do ręcznego wklejenia (właściciel)

Wklej w Zeabur → każdy serwis → **Variable**.  
Nie commituj tych wartości. Nie wklejaj sekretów do czatu.

Odwołania typu `${POSTGRES_IDENTITY_URI}` oznaczają: użyj **Reference / połączenia z add-onu** w UI Zeabur (wklej connection string wygenerowany przez add-on).

---

## Wspólne (wszystkie serwisy app, jeśli ustawiasz globalnie)

| Klucz                          | Wartość      |
| ------------------------------ | ------------ |
| `NODE_ENV`                     | `production` |
| `ALLOW_PRODUCTION_CONNECTIONS` | `true`       |

---

## Add-on → zapisz sobie lokalnie (nie do Gita)

Z UI add-onów skopiuj:

1. URI `postgres-identity` → użyjesz jako `IDENTITY_DATABASE_URL`
2. URI `postgres-authorization` → użyjesz jako `AUTHORIZATION_DATABASE_URL`
3. URI `redis` → `REDIS_URL`
4. URI/host+user+pass `rabbitmq` → `RABBITMQ_URL` (format `amqp://USER:PASS@HOST:5672`)

---

## Serwis `identity-service`

| Klucz                          | Wartość                             |
| ------------------------------ | ----------------------------------- |
| `NODE_ENV`                     | `production`                        |
| `HOST`                         | `0.0.0.0`                           |
| `IDENTITY_SERVICE_HOST`        | `0.0.0.0`                           |
| `IDENTITY_DATABASE_URL`        | _(URI z add-onu postgres-identity)_ |
| `ALLOW_PRODUCTION_CONNECTIONS` | `true`                              |

---

## Serwis `authorization-service`

| Klucz                          | Wartość                                  |
| ------------------------------ | ---------------------------------------- |
| `NODE_ENV`                     | `production`                             |
| `HOST`                         | `0.0.0.0`                                |
| `AUTHORIZATION_SERVICE_HOST`   | `0.0.0.0`                                |
| `AUTHORIZATION_DATABASE_URL`   | _(URI z add-onu postgres-authorization)_ |
| `ALLOW_PRODUCTION_CONNECTIONS` | `true`                                   |

---

## Serwis `api-gateway`

| Klucz                          | Wartość                              |
| ------------------------------ | ------------------------------------ |
| `NODE_ENV`                     | `production`                         |
| `HOST`                         | `0.0.0.0`                            |
| `API_GATEWAY_HOST`             | `0.0.0.0`                            |
| `ALLOW_PRODUCTION_CONNECTIONS` | `true`                               |
| `REDIS_URL`                    | _(URI z add-onu redis — rezerwa)_    |
| `RABBITMQ_URL`                 | _(URI z add-onu rabbitmq — rezerwa)_ |

---

## Serwis `web`

| Klucz      | Wartość      |
| ---------- | ------------ |
| `NODE_ENV` | `production` |
| `HOST`     | `0.0.0.0`    |

---

## Serwis `admin`

| Klucz      | Wartość      |
| ---------- | ------------ |
| `NODE_ENV` | `production` |
| `HOST`     | `0.0.0.0`    |

---

## Serwis `discord-gateway` (bot 24/7)

| Klucz                                  | Wartość                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`                             | `production`                                                       |
| `HOST`                                 | `0.0.0.0`                                                          |
| `DISCORD_GATEWAY_HOST`                 | `0.0.0.0`                                                          |
| `DISCORD_ENABLED`                      | `true`                                                             |
| `DISCORD_APPLICATION_ID`               | _(Application ID z Discord Developer Portal)_                      |
| `DISCORD_TOKEN`                        | _(Bot token — tylko Zeabur Variables, Secret)_                     |
| `DISCORD_TEST_GUILD_ID`                | `1534228693017432124`                                              |
| `DISCORD_TEST_OPERATOR_IDS`            | _(Twoje Discord User ID, snowflake)_                               |
| `DISCORD_COMPONENT_SIGNING_SECRET`     | _(wynik lokalnego `pnpm discord:test:generate-secret`, ≥32 bajty)_ |
| `DISCORD_AUTO_REGISTER_GUILD_COMMANDS` | `true`                                                             |
| `DISCORD_STRICT_GUILD_ISOLATION`       | `true`                                                             |
| `APP_VERSION`                          | `0.1.0-zeabur`                                                     |
| `GIT_COMMIT_SHA`                       | _(opcjonalnie SHA deployu)_                                        |

Opcjonalnie:

| Klucz                     | Wartość                             |
| ------------------------- | ----------------------------------- |
| `DISCORD_TEST_CHANNEL_ID` | _(snowflake kanału do diagnostyki)_ |

---

## Serwis `activity-service` (P4 Centrum — wymagany razem z discord-gateway)

| Klucz                          | Wartość                                      |
| ------------------------------ | -------------------------------------------- |
| `NODE_ENV`                     | `production`                                 |
| `HOST`                         | `0.0.0.0`                                    |
| `ACTIVITY_SERVICE_HOST`        | `0.0.0.0`                                    |
| `ACTIVITY_SERVICE_PORT`        | `4400`                                       |
| `ACTIVITY_DATABASE_URL`        | _(URI z add-onu postgres-activity)_          |
| `ACTIVITY_REDIS_URL`           | _(URI z add-onu redis)_                      |
| `ALLOW_PRODUCTION_CONNECTIONS` | `true`                                       |
| `ACTIVITY_ENABLED`             | `true` (gdy pełny authz+JWT skonfigurowane)  |
| `ACTIVITY_TRUST_ACTOR_HEADERS` | `false` (**zawsze** w production)            |

Dodatkowe klucze przy `ACTIVITY_ENABLED=true` (JWT / Authz / projection):
skopiuj lokalny działający zestaw z `.env` (bez wklejania PEM/tokenów do czatu)
— m.in. `ACTIVITY_AUTHORIZATION_BASE_URL`, `ACTIVITY_INBOUND_CLIENTS_JSON`,
`ACTIVITY_PROJECTION_SHARED_SECRET`, `ACTIVITY_DISCORD_PROJECTION_BASE_URL`,
klucze `ACTIVITY_TO_*_PRIVATE_KEY_PEM`. Na `discord-gateway` ustaw odpowiadające
`DISCORD_ACTIVITY_ENABLED=true` + ten sam projection secret +
`ACTIVITY_SERVICE_BASE_URL` wskazujący na wewnętrzny URL `activity-service`.

---

## Po wklejeniu

1. **Redeploy** wszystkich serwisów.
2. Napisz w czacie Cursor **bez sekretów**: że Variables są ustawione + publiczne URL `web` / `api-gateway` / `discord-gateway` (jeśli wystawione).
3. Agent zweryfikuje health i poprowadzi checklistę live testu Discord.
