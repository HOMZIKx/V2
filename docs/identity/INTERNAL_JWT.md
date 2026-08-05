# Internal service-to-service JWT (P2)

Identity issues short-lived internal JWTs for trusted backend callers (first consumer: `api-gateway`). Browsers never receive internal JWTs or client assertions.

## Flow

```text
api-gateway (server)
  1. Holds user HttpOnly session cookie
  2. Signs client assertion (EdDSA, TTL ≤ 60s, own private key)
  3. POST /identity/internal-token
       Header: Identity-Client-Assertion
       Body: { "audience": "v2.api-gateway" }
       Cookie: user session
  4. Receives internal JWT (memory only)
  5. Forwards Bearer token to backend consumers

identity-service
  - Verifies assertion (service-auth keyring)
  - Validates user session
  - Records assertion jti in Redis (single-use)
  - Signs internal JWT (internal JWT keyring)

consumer
  - Verifies internal JWT via GET /identity/.well-known/jwks.json
```

## Separate keyrings

| Keyring                  | Private key location           | Public material                          |
| ------------------------ | ------------------------------ | ---------------------------------------- |
| **Service-auth**         | Caller only (e.g. api-gateway) | Identity `IDENTITY_SERVICE_CLIENTS_JSON` |
| **Internal JWT signing** | Identity only                  | `GET /identity/.well-known/jwks.json`    |

Never reuse key material between keyrings.

## Identity configuration

```env
IDENTITY_INTERNAL_JWT_ENABLED=false
IDENTITY_INTERNAL_JWT_ISSUER=http://127.0.0.1:4200
IDENTITY_INTERNAL_JWT_TTL_SECONDS=300
IDENTITY_INTERNAL_JWT_ISSUE_URL=http://127.0.0.1:4200/identity/internal-token
IDENTITY_SYSTEM_REVOKE_URL=http://127.0.0.1:4200/identity/v1/system/revoke-sessions
IDENTITY_INTERNAL_JWT_ACTIVE_KID=internal-active
IDENTITY_INTERNAL_JWT_KEYRING_JSON=[{"kid":"...","status":"active","private_key_pem":"...","public_key_pem":"..."},{"kid":"...","status":"retiring","public_key_pem":"..."}]
IDENTITY_SERVICE_CLIENTS_JSON=[{"client_id":"v2.api-gateway","allowed_audiences":["v2.api-gateway"],"keys":[{"kid":"...","status":"active","public_key_pem":"..."}]},{"client_id":"v2.authorization-service","allowed_audiences":["http://127.0.0.1:4200/identity/v1/system/revoke-sessions"],"keys":[{"kid":"...","status":"active","public_key_pem":"..."}]}]
IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS=60
IDENTITY_CLIENT_ASSERTION_CLOCK_SKEW_SECONDS=60
IDENTITY_CLIENT_ASSERTION_REDIS_PREFIX=v2:identity:client-assertion:jti:
```

Requirements when `IDENTITY_INTERNAL_JWT_ENABLED=true`:

- `IDENTITY_AUTH_ENABLED=true`
- Exactly one **active** internal JWT signing key (only status that may hold `private_key_pem`)
- `retiring` / `retired` records are **public-only**; `private_key_pem` on those statuses is rejected
- Runtime signing `CryptoKey` is imported **non-extractable** (temporary extractable import is used only to verify private/public match, then discarded)
- JWKS publishes `active` + `retiring` public keys (`retired` never published, never used to sign)
- Unique `kid` values; fail-fast on mismatch, duplicate kid, empty JWKS
- Redis required (fail-closed for assertion replay)
- Client assertion `kid` must belong to the claimed `iss` (`keyEntry.clientId === iss` and `iss === sub`)
- Assertion / internal JWT `aud` must be a single string (arrays rejected)

## api-gateway configuration

```env
INTERNAL_JWT_CLIENT_ENABLED=false
INTERNAL_JWT_CLIENT_ID=v2.api-gateway
INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM=
INTERNAL_JWT_CLIENT_ACTIVE_KID=
INTERNAL_JWT_ASSERTION_AUD=http://127.0.0.1:4200/identity/internal-token
INTERNAL_JWT_IDENTITY_BASE_URL=http://127.0.0.1:4200
INTERNAL_JWT_JWKS_URL=http://127.0.0.1:4200/identity/.well-known/jwks.json
INTERNAL_JWT_ISSUER=http://127.0.0.1:4200
INTERNAL_JWT_DEFAULT_AUDIENCE=v2.api-gateway
```

Private service key stays in api-gateway only. No browser route returns tokens.

## Rotation

### Internal JWT (Identity)

1. Add new key as `retiring` in keyring JSON with **public_key_pem only** (publish in JWKS)
2. Promote new key to `active` (add `private_key_pem`), demote previous active to `retiring` (drop private key from config), update `IDENTITY_INTERNAL_JWT_ACTIVE_KID`
3. Overlap ≥ TTL + skew (300 + 60 seconds)
4. Retire old key (`retired` — public only, removed from JWKS)

### Service-auth (per client)

1. Add new public key as `retiring` in `IDENTITY_SERVICE_CLIENTS_JSON`
2. Caller switches active signer + `INTERNAL_JWT_CLIENT_ACTIVE_KID`
3. Overlap ≥ assertion max TTL + skew (60 + 60 seconds)
4. Mark old key `retired`

## Assertion replay protection

- Redis prefix: `v2:identity:client-assertion:jti:`
- `SET key NX EX ttl` where `ttl = assertion_max_ttl + clock_skew`
- Replay → `CLIENT_ASSERTION_REPLAY`
- Redis down while feature enabled → fail-closed

## Threat model

| Threat              | Control                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| Browser mint        | No service private key in browser; assertion required                      |
| Assertion replay    | Redis jti NX + TTL                                                         |
| Wrong assertion aud | Exact match to caller-supplied expected audience (issue URL or revoke URL) |
| Wrong internal aud  | Per-client `allowed_audiences`                                             |
| Alg confusion       | EdDSA only                                                                 |
| Key mixup           | Separate keyrings                                                          |
| Session-only mint   | Forbidden                                                                  |
| Session-only revoke | Forbidden — assertion required                                             |
| Cross-client forge  | `kid` bound to `iss` (`keyEntry.clientId === iss`)                         |
| Multi-audience JWT  | Exact single-string `aud` required                                         |

## Consumer verification

Use `@v2/internal-jwt`:

```ts
import { verifyInternalJwt } from '@v2/internal-jwt';

const verified = await verifyInternalJwt({
  token,
  expectedIssuer: 'http://127.0.0.1:4200',
  expectedAudience: 'v2.api-gateway',
  jwks: await fetchJwks(),
});
// { sub, jti, exp, kid } — kid from header only
```

## System client assertion vs user Internal JWT

| Mechanism                                          | Who presents it                  | Proves                                                     | Typical use                                            |
| -------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| **Client assertion** (`Identity-Client-Assertion`) | Backend service (gateway, Authz) | The calling _service_ identity (`iss`/`sub` = `client_id`) | Mint internal JWT; system revoke sessions              |
| **User Internal JWT** (`Authorization: Bearer`)    | Backend after Identity issue     | Short-lived _user_ context (`sub` = V2 user id)            | Downstream service calls on behalf of a logged-in user |

Rules:

- Client assertions never carry a user `sub`; user context comes from the session cookie (issue flow) or request body (system revoke `v2_user_id`).
- System revoke (`POST /identity/v1/system/revoke-sessions`) accepts **only** a client assertion whose `aud` exactly equals `IDENTITY_SYSTEM_REVOKE_URL`. A user cookie / Internal JWT alone is rejected.
- Issue flow assertions must use `aud === IDENTITY_INTERNAL_JWT_ISSUE_URL`.
- Register Authz in `IDENTITY_SERVICE_CLIENTS_JSON` with `allowed_audiences` including the revoke URL (e.g. `v2.authorization-service`).

## Testing

Unit tests (default CI):

```bash
pnpm --filter @v2/internal-jwt test
pnpm --filter @v2/identity-service test
pnpm --filter @v2/api-gateway test
```

Integration (Postgres + Redis):

```bash
RUN_INFRA_TESTS=true pnpm --filter @v2/identity-service test internal-jwt.integration
```

Test Ed25519 key material is generated **ephemerally at runtime** in
`test-fixtures.ts` helpers (never commit static PKCS#8 private-key PEMs).

## References

- GitHub Issue #13 (`P2-IDENTITY-INTERNAL-JWT-001`)
- ADR-0011, DEC-009 A
