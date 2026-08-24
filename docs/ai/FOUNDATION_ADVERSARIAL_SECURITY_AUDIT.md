# Foundation Adversarial Security Audit

Task: `V2-FOUNDATION-ADVERSARIAL-SECURITY-AUDIT-002`  
Base: `09be1dd6996e31575c677847ed79545239967c36` (PR #19)  
Checkpoint: **`FOUNDATION_ADVERSARIAL_SECURITY_AUDIT_SHA`** — `29f6934cc82399cd6a6ee825d1f03bb5d03c2bff`

Scope: api-gateway, identity-service, authorization-service, activity-service, discord-gateway, web, admin, shared contracts, notification pipeline, LFG.

**Mode:** adversarial review + safe remediation only — no new product behavior.

---

## Executive summary

| Severity | Found | Fixed | Open |
| -------- | ----- | ----- | ---- |
| CRITICAL | 0     | 0     | 0    |
| HIGH     | 4     | 4     | 0    |
| MEDIUM   | 3     | 0     | 3    |
| LOW      | 4     | 0     | 4    |

**Prior checkpoint (`29f6934…`) incorrectly claimed H-SEC-01 / H-SEC-02 were fully closed.**  
ChatGPT integrated review (`1623d71…` audit base) found residual HIGH items; remediated in **`CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA`** (this pass).

**LOCAL_VALIDATE:** pending re-run after remediation  
**pnpm audit --audit-level high:** 0 high/critical (1 moderate transitive)  
**Tracked secrets scan:** no live tokens/PEMs in committed tree

---

## HIGH — fixed

### H-SEC-01 — Cross-organization IDOR via client `organizationId`

| Field                    | Detail                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root cause               | Guild-scoped authz checked `guildId` but accepted client/path `organizationId` without binding to `guild_activity_settings.org_id`                                                                              |
| Exploit scenario         | Attacker with `config.manage` on guild G1 (org O1) calls admin LFG composition or member publish/LFG with `organizationId=O2` → read/write org-scoped data for foreign org while using own guild permission     |
| Impact                   | Multi-tenant data integrity break; polluted LFG/activity tuples; cross-org template leakage                                                                                                                     |
| Fix                      | `resolveGuildOrganizationId` / `requireGuildOrganizationMatch` in `guild-organization-scope.ts`; applied to publish/series, ensure-defaults, panel upsert, LFG search/intent/watch, admin composition templates |
| Proof/test               | `guild-organization-scope.spec.ts`, `lfg.use-cases.spec.ts` org mismatch case; in-memory activity spec aligned                                                                                                  |
| Residual (ChatGPT)       | `searchSimilarGroupsBeforeCreate` still passed client `organizationId` to `listOpenActivitiesForLfg`; `resolveGuildOrganizationId` returned client org when guild settings absent (bootstrap bleed)             |
| Remediation              | Fail-closed runtime resolve; `resolveGuildOrganizationIdForBootstrap` only for ensure-defaults / initial publish; similar-groups + marketplace offer bind to authoritative org                                  |
| Proof/test (remediation) | `guild-organization-scope.spec.ts` fail-closed case; `lfg.use-cases.spec.ts` similar-groups foreign org → `FORBIDDEN`                                                                                           |

### H-SEC-02 — Missing application-layer rate limits on abuse-prone routes

| Field                    | Detail                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root cause               | api-gateway proxied OAuth/LFG/identity mutations without per-client throttling                                                                             |
| Exploit scenario         | Valid-session/automation flood on `/identity/oauth/*`, `POST /activity/v1/lfg/join                                                                         | search | intents` → DB/notification amplification, OAuth pressure |
| Impact                   | DoS-ish abuse, cost/noise; partial idempotency mitigates duplicates but not volume                                                                         |
| Fix                      | In-memory sliding-window limits at api-gateway `onRequest` (`rate-limit.ts`) for OAuth starts, link POST, LFG join/search/intent create                    |
| Proof/test               | `apps/api-gateway/src/rate-limit.spec.ts`                                                                                                                  |
| Residual (ChatGPT)       | `clientKeyFromRequest` trusted raw client `X-Forwarded-For`; bucket `Map` never evicted expired keys (memory DoS)                                          |
| Remediation              | Fastify `trustProxy` on Zeabur (`API_GATEWAY_TRUST_PROXY` / production default); client key = `request.ip` only; lazy sweep + `RATE_LIMIT_MAX_BUCKETS` cap |
| Proof/test (remediation) | Spoofed XFF ignored; stress test — many identities → expire → store bounded                                                                                |
| SHA                      | `CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA`                                                                                                                |
| Residual                 | Per-process store — multi-instance deploys need shared Redis limiter (MEDIUM M-SEC-03)                                                                     |

### H-SEC-03 — Rate limit trust boundary (X-Forwarded-For)

| Field            | Detail                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Root cause       | Gateway parsed client-supplied `X-Forwarded-For` as rate-limit identity                                  |
| Exploit scenario | Attacker rotates spoofed XFF values → fresh buckets → bypass per-IP limits                               |
| Fix              | `trustProxy` + `request.ip` only; documented Zeabur single-hop assumption in `docs/deploy/ZEABUR.md` §11 |
| Proof/test       | `rate-limit.spec.ts` — spoofed header ignored; limit tied to server `ip`                                 |

### H-SEC-04 — Rate limit store memory growth

| Field            | Detail                                                              |
| ---------------- | ------------------------------------------------------------------- |
| Root cause       | Module-level `Map` retained expired bucket keys indefinitely        |
| Exploit scenario | High-cardinality client keys → unbounded process memory             |
| Fix              | Periodic lazy sweep + `RATE_LIMIT_MAX_BUCKETS` hard cap             |
| Proof/test       | `rate-limit.spec.ts` stress — many identities, expire, bounded size |

---

## Activity org-scope audit (remediation pass)

| Path                                   | Client `organizationId` | Authoritative binding                                            | Status                          |
| -------------------------------------- | ----------------------- | ---------------------------------------------------------------- | ------------------------------- |
| LFG search / intent / full-group watch | body                    | `resolveGuildOrganizationId`                                     | OK (prior + insert fix)         |
| Similar groups pre-create              | body                    | **was missing** → fixed                                          | OK                              |
| Publish / series publish               | body                    | `resolveGuildOrganizationIdForBootstrap` + `ensureGuildDefaults` | OK (bootstrap separated)        |
| Panel upsert                           | body                    | `resolveGuildOrganizationId` (fail-closed)                       | OK                              |
| Admin composition templates            | path/body               | `requireGuildOrganizationMatch`                                  | OK                              |
| ensure-defaults                        | body                    | `resolveGuildOrganizationIdForBootstrap`                         | OK                              |
| Reservations create                    | body                    | spot scope from DB (`getReservationSpotScope`)                   | OK — client org must match spot |
| Marketplace offer create               | body                    | **was missing** → `resolveGuildOrganizationId`                   | OK (prototype, scope only)      |

No remaining guild-scoped **read** path audited that accepts foreign org when guild settings bind to another org.

---

None found in current foundation code paths when production posture is configured (`NODE_ENV=production`, inbound client assertions + JTI replay store, `AUTHORIZATION_ENABLED=true`, projection shared secret).

Prior deploy misconfig risks (missing assertion bundle, missing Redis JTI) remain **operational** — documented in Zeabur readiness audit; activity/identity fail closed when enabled flags require those components.

---

## MEDIUM — open (non-blocking)

### M-SEC-01 — Discord signed custom IDs have no TTL/replay nonce

Signed HMAC IDs are bound to **clicking** `interaction.user.id` at handler time; tampering fails closed. Hub buttons intentionally long-lived. Residual: stale UI state until server revalidation rejects — acceptable for v1.

### M-SEC-02 — Admin dev-actor mode when misconfigured

`VITE_ADMIN_DEV_ACTOR_DISCORD_ID` + non-production build allows fixed actor without Identity session. Production builds must not set this env; gateway strips browser `X-Actor-*` in production.

### M-SEC-03 — Rate limit not distributed

Gateway limiter is process-local. Horizontal scale needs Redis-backed buckets (follow-up infra).

---

## LOW — open

| ID       | Item                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| L-SEC-01 | `pnpm audit`: 1 **moderate** transitive dependency — no safe major bump applied                |
| L-SEC-02 | Untracked local `.tmp-zeabur-*.mjs` scripts can read CLI tokens — keep out of git              |
| L-SEC-03 | CI billing blocker prevents GitHub secret-scan / workflow enforcement                          |
| L-SEC-04 | Reservations prototype API callable without member UX guardrails (scope gate, not auth bypass) |

---

## Section reviews (no CRITICAL/HIGH exploit found)

### 1. Authentication

- Production api-gateway: `forward-actor-headers.ts` hard-false in production; actor from Identity cookie + minted client assertion only.
- activity-service / authorization-service: `InboundAssertionGuard` requires JWT client assertion when registry enabled; `ACTIVITY_TRUST_ACTOR_HEADERS` rejected in production.
- Identity internal character resolve: S2S assertion + aud/kid/TTL + JTI replay store when configured.
- Dev/test header fallbacks gated off production.

### 2. Authorization / tenant isolation

- LFG intent/watch: owner `recipientDiscordUserId` enforced.
- Character authority: Identity S2S only; no trusted Discord/WWW class/spec input.
- Activity privacy + JOIN permission on notify/search paths.
- **Fixed:** org IDOR (H-SEC-01). Guild-scoped permission checks otherwise consistent on audited endpoints.

### 3. Discord interactions

- HMAC + `timingSafeEqual` on custom IDs; length cap 100.
- Handlers revalidate activity/intent/watch state and bind to `interaction.user.id`.
- `allowedMentions` safe defaults — no @everyone/@here from untrusted text paths.

### 4. API gateway

- Allowlisted forward headers; no Authorization/client assertion from browser.
- CORS origin allowlist; duplicate actor headers dropped.
- Session→actor resolution server-side.
- **Fixed:** rate-limit identity via Fastify `trustProxy` + `request.ip` (H-SEC-03); bucket eviction cap (H-SEC-04).

### 5. SSRF / URL config

- Proxies use fixed service base URLs only; OAuth `callbackURL` allowlisted server-side.
- No user-controlled fetch destinations found.

### 6. Input / output security

- Zod on controllers; admin ping role forbids @everyone/@here in config.
- No `dangerouslySetInnerHTML` in web/admin.
- WWW login `next` param restricted to same-origin relative paths.

### 7. Rate limit / abuse

- **Fixed** gateway baseline (H-SEC-02). Service-level limits still optional.

### 8. Secrets

- `.env.example` placeholders only; test PEMs in specs are dummy values.
- Logs use structured observability without secret fields in audited paths.

### 9. Frontend

- Session via httpOnly cookie path; guild selection in sessionStorage only (non-secret).
- Backend remains authoritative for all mutations.

### 10. Dependencies

- `pnpm audit --audit-level high`: PASS (0 high/critical).

### 11. Tests added

- Org scope regression (unit) + similar-groups foreign org negative.
- Gateway rate limit regression (unit) + XFF spoof + memory stress.
- Bootstrap vs runtime org resolver split (unit).

---

## Owner decisions required

None for fixes applied. Future distributed rate-limit backend is an infra choice, not product behavior.

---

## Recommendation

Foundation code path: **CRITICAL=0, HIGH=0** after **`CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA`** validation pass. Prior `29f6934…` HIGH closure was incomplete — do not merge on that basis alone.

Proceed with separate runtime verification (`TEST_DISCORD_LIVE_RUNTIME_REPORT.md`); restore CI billing for automated enforcement.

**Do not** treat Reservations/Marketplace prototype endpoints as Accepted product surfaces.

---

## Validation

```
corepack pnpm validate — run after remediation commit
pnpm audit --audit-level high — 0 high/critical
targeted: api-gateway rate-limit.spec.ts, guild-organization-scope.spec.ts, lfg.use-cases.spec.ts
```
