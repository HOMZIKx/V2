# Authorization contracts (P3 foundation)

Invisible foundation APIs. No browser UI. Clients authenticate with
**system service assertions** (`Authorization-Client-Assertion`) when
`AUTHORIZATION_ENABLED=true`. Each inbound client has an
`allowed_operations` allowlist (deny-by-default). Optional JWT claims
`actor_v2_user_id` / `actor_discord_user_id` identify the human actor for
policy mutations.

User-context Internal JWT is used by other backends after WWW login (PR #14),
not for Discord sync or system revoke.

## HTTP (authorization-service)

| Method | Path                                                        | Operation             | Purpose                                               |
| ------ | ----------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| POST   | `/authorization/v1/bootstrap/owner`                         | `bootstrap`           | Idempotent owner bootstrap (env Discord seed match)   |
| POST   | `/authorization/v1/identity-links`                          | `identity_link`       | Immutable Discord↔V2 link                             |
| POST   | `/authorization/v1/authorize`                               | `authorize`           | Allow/deny decision                                   |
| POST   | `/authorization/v1/authorize/explain`                       | `authorize`           | Full explanation                                      |
| POST   | `/authorization/v1/discord/guilds/register`                 | `discord_register`    | Auto-register `pending_sync`, `login_entitling=false` |
| POST   | `/authorization/v1/discord/events`                          | `discord_events`      | Idempotent membership/role/unavailable/detach events  |
| POST   | `/authorization/v1/discord/guilds/:guildId/reconcile`       | `discord_reconcile`   | Full snapshot → `sync_status=fresh`                   |
| POST   | `/authorization/v1/discord/guilds/:guildId/activate`        | `activate_guild`      | Activate only when fresh (no login flag here)         |
| POST   | `/authorization/v1/discord/guilds/:guildId/login-entitling` | `set_login_entitling` | Explicit login entitlement policy                     |
| POST   | `/authorization/v1/grants`                                  | `grants`              | Create allow/deny (actor + computed specificity)      |
| POST   | `/authorization/v1/blocks`                                  | `blocks`              | Create V2 block (triggers durable session revoke)     |
| POST   | `/authorization/v1/maintenance/expirations`                 | `process_expirations` | Reap expired grants/blocks + enqueue revokes          |

### Recommended client allowlists

| Client                | `allowed_operations`                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `v2.identity-service` | `identity_link`, `authorize`                                                                    |
| `v2.discord-gateway`  | `discord_register`, `discord_events`, `discord_reconcile`                                       |
| policy / operator     | `bootstrap`, `activate_guild`, `set_login_entitling`, `grants`, `blocks`, `process_expirations` |

## Identity system revoke

`POST /identity/v1/system/revoke-sessions` — assertion-only; body
`{ v2_user_id, reason, correlation_id }`. No user cookie / Internal JWT.

Authorization persists `pending_session_revoke` rows in the same DB transaction
as entitlement loss, then drains delivery with retry (no RabbitMQ required in v1).

## Technical permission IDs

- `permission.platform.login.www`
- `permission.authorization.policy.read`
- `permission.authorization.policy.manage.org`
- `permission.authorization.policy.manage.guild`

## Out of scope here

RabbitMQ transport, outbox streams, Admin/Discord/WWW UI, product permission names.
