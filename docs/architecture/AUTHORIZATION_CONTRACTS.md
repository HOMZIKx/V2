# Authorization contracts (P3 foundation)

Invisible foundation APIs. No browser UI. Clients authenticate with
**system service assertions** (`Authorization-Client-Assertion`) when
`AUTHORIZATION_ENABLED=true`. User-context Internal JWT is used by other
backends after WWW login (PR #14), not for Discord sync or system revoke.

## HTTP (authorization-service)

| Method | Path                                                  | Purpose                                       |
| ------ | ----------------------------------------------------- | --------------------------------------------- |
| POST   | `/authorization/v1/bootstrap/owner`                   | Idempotent owner bootstrap                    |
| POST   | `/authorization/v1/identity-links`                    | Upsert Discord↔V2 link                        |
| POST   | `/authorization/v1/authorize`                         | Allow/deny decision                           |
| POST   | `/authorization/v1/authorize/explain`                 | Full explanation                              |
| POST   | `/authorization/v1/discord/guilds/register`           | Auto-register `pending_sync`                  |
| POST   | `/authorization/v1/discord/events`                    | Idempotent membership/role events             |
| POST   | `/authorization/v1/discord/guilds/:guildId/reconcile` | Full snapshot apply                           |
| POST   | `/authorization/v1/discord/guilds/:guildId/activate`  | Explicit activate + optional `loginEntitling` |
| POST   | `/authorization/v1/grants`                            | Create allow/deny                             |
| POST   | `/authorization/v1/blocks`                            | Create V2 block                               |

## Identity system revoke

`POST /identity/v1/system/revoke-sessions` — assertion-only; body
`{ v2_user_id, reason, correlation_id }`. No user cookie / Internal JWT.

## Technical permission IDs

- `permission.platform.login.www`
- `permission.authorization.policy.read`
- `permission.authorization.policy.manage.org`
- `permission.authorization.policy.manage.guild`

## Out of scope here

RabbitMQ transport, outbox, Admin/Discord/WWW UI, product permission names.
