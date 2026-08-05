# Cursor → ChatGPT

## 1. Status

`READY_FOR_REVIEW`

P3 Authorization foundation on branch `cursor/p3-authorization-foundation`.

## 2. Task ID

`P3-AUTHORIZATION-FOUNDATION-001`

## 3. Branch / commit

- Branch: `cursor/p3-authorization-foundation`
- Commit: `d32287648d38c34d328c0bcbe775ae32f69f528e`

## 4. Implemented scope

Authorization-service end-to-end foundation:

- Application ports + use-cases (bootstrap, identity-link, authorize/explain, guild
  register/events/reconcile/activate, grants/blocks, entitlement-loss revoke)
- `AuthorizationRepository` (raw `pg` SQL against migration `001`)
- `SystemRevokeClient` — EdDSA assertion + POST Identity system revoke body
  `{ v2_user_id, reason, correlation_id }` with header `Identity-Client-Assertion`
- Nest HTTP under `/authorization/v1/*` + inbound assertion guard
- Startup: parse env, pool, ensure single organization row
- Health ready: `SELECT 1` via store ping

### Auth note

When `AUTHORIZATION_ENABLED=false`, `InboundAssertionGuard` skips assertion verification
(local/unauthenticated tests). When `true`, requires `Authorization-Client-Assertion`
with `aud = AUTHORIZATION_ASSERTION_AUD` or full request URL; optional Redis jti store.

## 5. Routes

| Method | Path |
| ------ | ---- |
| POST | `/authorization/v1/bootstrap/owner` |
| POST | `/authorization/v1/identity-links` |
| POST | `/authorization/v1/authorize` |
| POST | `/authorization/v1/authorize/explain` |
| POST | `/authorization/v1/discord/guilds/register` |
| POST | `/authorization/v1/discord/events` |
| POST | `/authorization/v1/discord/guilds/:guildId/reconcile` |
| POST | `/authorization/v1/discord/guilds/:guildId/activate` |
| POST | `/authorization/v1/grants` |
| POST | `/authorization/v1/blocks` |
| GET | `/health/live` |
| GET | `/health/ready` |

## 6. Tests

```text
pnpm --dir services/authorization-service typecheck  # pass
pnpm --dir services/authorization-service lint       # pass
pnpm --dir services/authorization-service test       # 30 pass, 3 infra skipped (DB down)
pnpm --dir services/authorization-service build      # pass
```

Infra repository tests run when `RUN_INFRA_TESTS=true` and Postgres is reachable;
otherwise they skip without failing the unit job.

## 7. Assumptions / tech debt

- Identity system revoke HTTP (`POST /identity/v1/system/revoke-sessions`) is expected
  as the `AUTHORIZATION_IDENTITY_REVOKE_URL` target (parallel Identity work may land it).
- No PEM fixtures committed; ephemeral keys in unit tests.
- Domain remains free of Nest/`pg`.
- Repository integration not executed against live PG in this agent run (compose not up).

## 8. Questions

None blocking for foundation review.
