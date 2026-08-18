# Cursor → ChatGPT handoff

## 1. Status

`SECURITY_HARDENING_COMPLETE_FOR_CURRENT_P4` — task
`P4-ADVERSARIAL-SECURITY-AND-RESILIENCE-001`

ROLLING AUDIT MODE: **ACTIVE**

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 / #21 / #22 / #23 / #24 **NOT IMPLEMENTED**

SECURITY_START_SHA: `467cd5cf13ae39d26d6d17d1421c6f96d5ddb6e1`  
SECURITY_CHECKPOINT_SHA: *filled in the follow-up docs commit after git SHA is known*

KNOWN_HEAD at task creation (`9a3e922`) was stale. Actual start tip was
`467cd5c`.

## 2. Threat matrix (current exploitable paths only)

| Asset | Entry | Authz decision | Trust boundary | Failure if broken | Control | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Actor identity | `X-Actor-*` / assertion | Guard → `verifiedActor` | Browser ↛ activity-service | Spoof any user | Production never trusts headers; assertion actor claims only; gateway strips/forward-false | `inbound-assertion.guard.spec.ts`, `forward-actor-headers.spec.ts`, `activity-proxy.controller.spec.ts` |
| Guild config / Discord metadata | Admin `/activity/v1/admin/...` | `CONFIG_MANAGE` via AuthorizePort | Member of guild A ↛ guild B | Cross-guild read/edit | Fail-closed authorize; list filtered; get/channels/roles/audit 403 | `activity-admin.use-cases.spec.ts` |
| Activities / RSVP | Member API | `READ` / `JOIN` on activity.guildId | Cross-guild ID | RSVP/read leak | Permission before present; RSVP after lock | `activity.use-cases.spec.ts` |
| Privileged ops | Any mutation | AuthorizePort | Authz down | Implicit allow | `authorizeOrFailClosed`; production DenyAll if activity disabled | `authorize-fail-closed.spec.ts`, `authorization-client.spec.ts` |
| S2S assertion | `Activity-Client-Assertion` | jose EdDSA + JTI | Stolen/replayed JWT | Replay as gateway | aud/iss/sub/jti UUID; prod Redis JTI; duplicate headers rejected | `verify-inbound-assertion.spec.ts`, guard spec |
| Discord components | `custom_id` | HMAC + Discord user | Forged button | Act as other guild/user | Signed custom_id; actor from Discord user | `activity-signed-custom-id.spec.ts` |
| Projection | `/internal/activity/v1/projections/deliver` | shared secret | Public Discord write proxy | Spam/wrong guild | Secret required, timing-safe; typed hub/event only | `activity-projection.controller.spec.ts` |
| Admin DEV session | `VITE_ADMIN_DEV_*` | frontend mode | Accidental prod bake | Browser sends actor header | `import.meta.env.DEV` required | `apps/admin/src/auth/session.spec.ts` |

## 3. Findings

### CRITICAL

None remaining in current code after this checkpoint.

### HIGH

1. **Production AllowAll when `ACTIVITY_ENABLED=false`**
   - Attack: authenticated ordinary user hits Admin/API guilds/config.
   - Expected: 403 until real authorization allows `CONFIG_MANAGE`.
   - Actual (before): AllowAll; any logged-in actor passed.
   - Fix: `DenyAllAuthorizationClient` in production when activity is disabled.
   - Tests: `authorization-client.spec.ts`, `tools/security/p4-current-controls.test.ts`.
   - Remaining: live Zeabur still on previous image until redeploy; then Admin
     mutations 403 until owner sets `ACTIVITY_ENABLED=true` with real authz.

2. **Assertion replay if inbound clients configured without Redis**
   - Attack: replay `Activity-Client-Assertion` against activity-service.
   - Expected: JTI one-use.
   - Actual (before): `ASSERTION_JTI_STORE` null when Redis URL missing.
   - Fix: production + inbound clients requires `ACTIVITY_REDIS_URL`; guard
     fails closed if JTI store missing in production.
   - Tests: `activity-env.spec.ts`, `inbound-assertion.guard.spec.ts`.

### MEDIUM

3. **`API_GATEWAY_FORWARD_ACTOR_HEADERS=true` baked unsigned browser actor into JWT**
   - Fix: `resolveForwardActorHeaders` forces false in production; duplicate
     actor header arrays are dropped; unsigned actor is not put in assertion
     when forward is false.
   - Tests: `forward-actor-headers.spec.ts`, `activity-proxy.controller.spec.ts`.

4. **Inbound JWT did not require `sub === iss`, UUID `jti`, or reject `aud` arrays**
   - Fix: `verifyInboundAssertion` now matches those fail-closed rules; actor
     claims from verified payload only.
   - Tests: `verify-inbound-assertion.spec.ts`.

5. **Duplicate assertion headers accepted first value**
   - Fix: reject arrays.
   - Tests: `inbound-assertion.guard.spec.ts`.

6. **Projection secret compared with `!==`**
   - Fix: SHA-256 + `timingSafeEqual`.
   - Tests: `timing-safe-equal.spec.ts`, projection controller spec.

7. **Admin `VITE_ADMIN_DEV_*` could enable `dev-actor` if present at build**
   - Fix: production builds (`import.meta.env.DEV === false`) always
     identity-cookie mode.
   - Tests: `apps/admin/src/auth/session.spec.ts`.

8. **Malformed projection payload leaked Zod issue JSON**
   - Fix: generic `Invalid projection payload.`
   - Tests: projection controller spec.

### LOW

9. **Identity session lookup could hang** — timeout 3s, fail to null.
10. **Fastify default 1MiB bodies** — explicit 256KiB on api-gateway,
    activity-service, discord-gateway.
11. **`getActivity` UUID** — missing → 404, other-guild existing → 403
    (existence leak of unguessable UUIDs). Accepted.
12. **CORS still allowlists `X-Actor-Discord-User-Id`** for local Admin DEV.
    Production gateway does not honor the header as identity.

### INFO

13. Health `gitCommitSha` is an env value, not image digest. Operability.
14. `pnpm audit --audit-level=high`: 1 moderate, 0 high/critical. No broad upgrade.
15. Leftover unused Zeabur service names / stale `GIT_COMMIT_SHA` on live apps.

## 4. NOT TESTABLE LIVE

- Hitting internal activity/authorization/identity/discord-gateway HTTP
  without a public domain (registry marks them `public: false`).
- Real Discord component replay / copied-button as unauthorized user (needs
  signed interaction from Discord).
- Parallel outbox workers on production Postgres after process crash.
- OAuth-authenticated Admin/WWW as two guilds (owner session required).
- Confirming Zeabur has no accidental public domain on internal apps from
  this environment after the previous bring-up (no Zeabur token in this turn).

## 5. OWNER_ACTION_REQUIRED

1. Redeploy this checkpoint to Zeabur.
2. Keep `ACTIVITY_TRUST_ACTOR_HEADERS=false`,
   `API_GATEWAY_FORWARD_ACTOR_HEADERS=false`,
   `ACTIVITY_ALLOW_TEST_SEED=false`.
3. To restore Admin/WWW privileged writes: `ACTIVITY_ENABLED=true` with
   authorization-service, inbound clients, and Redis JTI.
4. Do not bake `VITE_ADMIN_DEV_*` into the Admin production image.
5. Set `GIT_COMMIT_SHA` to the deployed image SHA (doctor VERSION_DRIFT).
6. Walk logged-in Admin + Discord Hub after redeploy.

## 6. KNOWN SECURITY DEBT

- Projection duplicate map is in-memory (lost on discord-gateway restart;
  bounded duplicate Discord writes). RabbitMQ still out of scope (P4.5).
- Idempotency first-wins on same actor/scope/key; different body is not hashed
  (Postgres unique on actor+key). Cross-actor keys are isolated.
- No product-level anti-bot / elaborate rate limiter; 256KiB body limit only.
- Shared Zeabur Postgres addon vs ADR-0004 per-service DB (pre-existing).
- Issue #25 IP/security baseline is not a new product module; remaining
  items are deploy/secrets hygiene, not P4.5 scope.

## 7. Validation

```
pnpm format:check          # pass
pnpm validate              # pass (CI-equivalent; V2_SMOKE_* unset)
pnpm audit --audit-level=high   # pass (0 high/critical)
```

STOP. Do not merge. Do not start P4.5 / #20–#24.
