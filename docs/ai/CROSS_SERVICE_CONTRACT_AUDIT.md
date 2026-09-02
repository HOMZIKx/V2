# Cross-Service Contract Drift Audit

Task: `V2-CROSS-SERVICE-CONTRACT-DRIFT-AUDIT-001`  
Branch: `cursor/p4-1-activity-domain`  
Mode: architecture / contract safety — **no new product behavior**.

Product status unchanged: **`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`**.  
LFG status unchanged: **`READY_FOR_CHATGPT_REAUDIT`**.

---

## Summary

| Severity | Found | Fixed | Deferred |
| -------- | ----- | ----- | -------- |
| CRITICAL | 3     | 3     | 0        |
| HIGH     | 4     | 4     | 0        |
| MEDIUM   | 6     | 1     | 5        |
| LOW      | 5     | 0     | 5        |

Shared transport schemas landed in `@v2/contracts` (`activity/lfg-transport`, `activity/admin-transport`). Contract tests fail when consumers regress to the pre-`characterId` LFG body.

---

## Contract map

| Consumer → Producer            | Method / path                                      | Auth                                                | Shared schema                                                                   |
| ------------------------------ | -------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Web → API Gateway → Activity   | `POST /activity/v1/lfg/search\|join\|watches`      | Session cookie → `x-actor-*` (+ optional assertion) | `LfgSearchRequestSchema`, `LfgJoinRequestSchema`, `LfgWatchCreateRequestSchema` |
| Discord → Activity             | same LFG paths                                     | Headers or client assertion                         | same                                                                            |
| Admin → API Gateway → Activity | `GET .../admin/guilds/:id/audit`                   | Actor headers                                       | `AdminAuditListQuerySchema` / `AdminAuditListResponseSchema`                    |
| Activity → Identity            | `POST /identity/v1/internal/character/resolve`     | Client assertion                                    | local (S2S)                                                                     |
| Activity → Authorization       | authorize / identity-links                         | Client assertion                                    | local                                                                           |
| Activity outbox → Discord      | `POST /internal/activity/v1/notifications/deliver` | Projection shared secret                            | `@v2/notification-core` delivery actions                                        |
| Activity → Discord             | `POST .../projections/deliver`                     | Projection shared secret                            | local                                                                           |
| Web / Discord → Identity       | `GET /identity/v1/profile`                         | Session                                             | local DTOs                                                                      |
| Web → API Gateway              | `GET /session/me`                                  | Cookie                                              | local                                                                           |
| Notifications prefs            | `GET/PUT /activity/v1/notifications/preferences`   | Actor                                               | `@v2/notification-core` preference view (server)                                |

API Gateway remains a transparent proxy for `/activity/v1/*` and `/identity/*` (no business DTOs).

---

## CRITICAL (fixed)

### C-01 — LFG search: consumers sent class-spec fields; server required `characterId`

|            |                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cause**  | Web (`lfg-api.ts` / `LfgPage.tsx`) and Discord (`activity-http-client.ts` / `lfg-hub-ephemeral.ts`) posted `characterClassSpecKey` + `characterSupportedRoles`. Controller Zod required `characterId`. |
| **Impact** | Search always `VALIDATION_FAILED` — broken WWW + Discord LFG.                                                                                                                                          |
| **Fix**    | Consumers send `characterId`. Server uses shared `LfgSearchRequestSchema`.                                                                                                                             |
| **Proof**  | `packages/contracts/src/activity/lfg-transport.contract.test.ts`; activity `lfg-transport.contract.spec.ts`; consumer unit specs updated.                                                              |

### C-02 — Discord LFG match response: `occupancy` typed as string

|            |                                                                                       |
| ---------- | ------------------------------------------------------------------------------------- |
| **Cause**  | `lfgMatchSchema.occupancy: z.string()` while server returns `{ occupied, capacity }`. |
| **Impact** | Successful search would fail client Zod parse (`ActivityHttpError('VALIDATION')`).    |
| **Fix**    | Discord client validates via `LfgSearchResponseSchema` from `@v2/contracts`.          |
| **Proof**  | Contract test rejects string occupancy; accepts object.                               |

### C-03 — LFG join: consumers sent non-authoritative class/role fields

|            |                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause**  | Web/Discord sent `characterClassSpecKey` / `characterSupportedRoles` / `sessionRoles` on join; server accepts `characterId?` (authoritative via Identity). |
| **Impact** | Join without `characterId`/`intentId` failed use-case; client-supplied class/roles were a security smell.                                                  |
| **Fix**    | Join body is `LfgJoinRequestSchema`; consumers pass `characterId` from wizard/profile.                                                                     |
| **Proof**  | Discord interaction handler spec expects `characterId: 'char-1'`.                                                                                          |

---

## HIGH (fixed)

### H-01 — Admin audit pagination: `cursor` vs `offset`

|           |                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------ |
| **Cause** | Admin client sent `cursor` / expected `nextCursor`; server uses `offset` / returns `{ items, total }`. |
| **Fix**   | `listAudit` + `AuditPage` use offset; shared `AdminAuditList*Schema`.                                  |
| **Proof** | `admin-transport.contract.test.ts`; e2e mock returns `total`.                                          |

### H-02 — Dead `POST .../types/reorder` client with no server route

|           |                                                                        |
| --------- | ---------------------------------------------------------------------- |
| **Cause** | `reorderTypes` in admin API; no controller handler.                    |
| **Fix**   | Removed unused client function (proven unused outside its definition). |
| **Proof** | Grep: no remaining callers.                                            |

### H-03 — Full-group watch cancel missing `guildId` query

|           |                                                              |
| --------- | ------------------------------------------------------------ |
| **Cause** | Discord `cancelFullGroupWatch` omitted required `?guildId=`. |
| **Fix**   | Client requires `guildId` and appends query param.           |
| **Proof** | Method signature + URL in `activity-http-client.ts`.         |

### H-04 — No shared transport package for high-churn LFG DTOs

|           |                                                                                  |
| --------- | -------------------------------------------------------------------------------- |
| **Cause** | `@v2/contracts` only had health; every app hand-wrote LFG shapes.                |
| **Fix**   | Shared Zod transport schemas + contract tests; activity controller imports them. |
| **Proof** | `@v2/contracts` exports; Docker builds `contracts` to dist.                      |

---

## MEDIUM

| ID   | Item                                                           | Status                                       |
| ---- | -------------------------------------------------------------- | -------------------------------------------- |
| M-01 | OpenAPI `activity-v1.yaml` missing LFG / notification prefs    | Deferred — document only this audit          |
| M-02 | Admin readiness `status` vs client `state` aliasing            | Defensive mapping works                      |
| M-03 | Hub GET flattening (`hubChannelId` → `channelId`)              | Defensive; document                          |
| M-04 | Inbox top-level title/body vs payload-only web UI              | Works via payload                            |
| M-05 | Admin default API port 4400 vs web 4000                        | Config only                                  |
| M-06 | Docker images missing hub-core / notification-core / contracts | **Fixed** for activity + discord Dockerfiles |

---

## LOW (deferred)

- Web RSVP omits optional `partyRoleKey` (OK for non-LFG).
- Suppress match extra fields from Discord ignored by Zod.
- `similarGroupsWarning` expected by clients but not returned by server.
- Profile `level` / `interestKeys` optionality differs web vs Discord.
- OpenAPI not imported by any client.

---

## Duplicates found → strategy

| Area                           | Before                      | After                                |
| ------------------------------ | --------------------------- | ------------------------------------ |
| LFG search/join/watch/suppress | 3 hand-written shapes       | `@v2/contracts` Zod + inferred types |
| Admin audit list               | Admin-only wrong pagination | Shared query/response schemas        |
| Notification DM actions        | Already shared              | Unchanged (`@v2/notification-core`)  |
| RSVP / drafts / hub modules    | Local + server Zod          | No change (aligned enough)           |
| Reservations / Marketplace     | Prototype local             | **No expansion**                     |

Domain logic stays in services / `@v2/hub-core`. Contracts package holds **transport only**.

---

## Tests added

| Suite                                                                    | What it guards                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `packages/contracts/src/activity/lfg-transport.contract.test.ts`         | Canonical search accepts; legacy class-spec body rejects; occupancy object vs string |
| `packages/contracts/src/activity/admin-transport.contract.test.ts`       | Audit uses `offset`/`total`, not `cursor`/`nextCursor`                               |
| `services/activity-service/src/interface/lfg-transport.contract.spec.ts` | Controller-aligned shared schemas stay in sync with consumer fixtures                |

A regression that restores `characterClassSpecKey`-only search bodies fails these suites under `pnpm validate`.

---

## Remaining risks

1. **OpenAPI drift** — YAML not authoritative for LFG; extend in a follow-up.
2. **hub-core / notification-core Docker** — still source packages (no dist emit); Node 24 image relies on workspace source copies. Prefer same dist pattern as contracts later.
3. **API Gateway → Activity assertion optional** — deploy config (see Zeabur audit C-04); not a DTO drift.
4. **Reservations / Marketplace** — prototype contracts only; do not productize without Owner Discovery.
5. **Web Identity direct URL** — profile bypasses gateway host; env must stay aligned.

---

## Validation

| Check                    | Result                                                |
| ------------------------ | ----------------------------------------------------- |
| `corepack pnpm validate` | **PASS** — `b7cf78fa258ac6e431a0510e21c13651271acb1b` |
| Contract suites          | Included in validate                                  |

---

## Checkpoint

| Marker                             | SHA                                        |
| ---------------------------------- | ------------------------------------------ |
| `CROSS_SERVICE_CONTRACT_AUDIT_SHA` | `b7cf78fa258ac6e431a0510e21c13651271acb1b` |

No Reservations/Marketplace product work. LFG ChatGPT re-audit status unchanged.
