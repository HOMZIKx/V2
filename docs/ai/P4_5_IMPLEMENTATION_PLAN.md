# P4.5 Implementation Plan — Multi-guild Activity + RabbitMQ transport

Status: `PLAN_READY_FOR_AUDIT`  
Task: `P4.5-IMPLEMENTATION-PLAN-002`  
Branch: `cursor/p4-1-activity-domain` · PR #19  
Anchors: `P4_5_SCOPE_LOCK.md`, product §10, architecture §6–§9, ADR-0014,
`SYSTEM_ARCHITECTURE.md`, Issue #25, Issue #26  
Prerequisite checkpoint: `P4_0_FINAL_CHECKPOINT_SHA` (see `PROJECT_STATE.md`)

**This document is planning only. No production P4.5 code, migrations, or
Zeabur RabbitMQ provisioning from this task.**

---

## 0. Accepted scope (confirmed from SoT)

| Item                                                             | Classification   | Anchor                         |
| ---------------------------------------------------------------- | ---------------- | ------------------------------ |
| Multi-guild / multi-Discord publish                              | CURRENT_ACCEPTED | product §10, arch §6           |
| `permission.activity.event.publish.multi_guild` (org, sensitive) | CURRENT_ACCEPTED | arch §6, `permissions.ts`      |
| Ordinary member = one allowed Discord                            | CURRENT_ACCEPTED | product §10                    |
| Organizer/admin with permission = multi-Discord                  | CURRENT_ACCEPTED | product §10 + permission       |
| Activity DB = central SoT                                        | CURRENT_ACCEPTED | ADR-0014                       |
| Discord messages = projections                                   | CURRENT_ACCEPTED | ADR-0014                       |
| PG transactional outbox = durability boundary                    | CURRENT_ACCEPTED | P4-D5, ADR-0014                |
| RabbitMQ transport from P4.5                                     | CURRENT_ACCEPTED | P4-D5, arch §9                 |
| Domain/application broker-agnostic                               | CURRENT_ACCEPTED | NON_NEGOTIABLES, ADR-0014      |
| SHARED + SEPARATE participant modes (both)                       | CURRENT_ACCEPTED | product §10, `P4_5_SCOPE_LOCK` |
| Modes are **per-activity**, not global owner gate                | CURRENT_ACCEPTED | `P4_5_SCOPE_LOCK`              |
| No new community/watch/notification microservice                 | CURRENT_ACCEPTED | P4-D3 reject                   |

### Participant modes (not OWNER_DECISION_REQUIRED)

| Mode         | Participant pool             | Limit     | Waitlist       |
| ------------ | ---------------------------- | --------- | -------------- |
| **SHARED**   | one per activity             | one       | one FIFO       |
| **SEPARATE** | per Discord/guild projection | per guild | per guild FIFO |

### Explicit non-goals (P4.5)

- P4.6 (series / privacy / attendance / stats)
- Issues #20–#24 product implementation
- Hub redesign (compact Hub from P4.0 stays)
- WWW activity creator (product §14 / arch §8 — still Discord/Admin for create)
- Public RabbitMQ exposure
- Replacing PG outbox with broker-as-SoT
- Destructive DB reset / rewrite of existing events

### Unresolved product conflicts

**None** that block planning. Previously false `OD-P4.5-001` remains removed.

Issue #25 (security baseline) and #26 (one stage to completion; Owner UX review
deferred to CORE FOUNDATION INTEGRATED REVIEW) constrain **how** we ship, not
the Accepted P4.5 product shape.

---

## 1. Domain model — minimal extension

### 1.1 Current baseline (do not break)

From `services/activity-service/migrations/001_*` + P4.2:

- `activities` — single `guild_id`, `organization_id`, `participant_limit`, …
- `participations` — scoped by `activity_id` only (+ unique active user)
- `activity_projections` — **PK = `activity_id`** (one Discord message / activity)
- `outbox_messages` — claim/lease/retry already production-shaped
- HTTP outbox dispatcher → `discord-gateway` `/internal/activity/v1/projections/deliver`

### 1.2 New / extended concepts

| Concept                 | Meaning                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| **Home guild**          | Existing `activities.guild_id` — ownership, default config, single-guild path |
| **Publication target**  | One Discord guild+channel destination for a projection                        |
| **Projection identity** | Stable `(activity_id, guild_id)` (+ opaque id) mapping to Discord message     |
| **Participant mode**    | `shared` \| `separate` stored on the activity                                 |
| **Participation scope** | SHARED → activity-wide; SEPARATE → `(activity_id, scope_guild_id)`            |

### 1.3 Storage shape (design)

```text
activities
  + participant_mode TEXT NOT NULL DEFAULT 'shared'
      CHECK (participant_mode IN ('shared','separate'))
  # guild_id remains HOME guild (backward compatible)

activity_publication_targets  (new)
  id UUID PK
  activity_id UUID NOT NULL → activities
  organization_id TEXT NOT NULL
  guild_id TEXT NOT NULL
  channel_id TEXT NOT NULL
  sort_order INT NOT NULL DEFAULT 0
  created_at / updated_at
  UNIQUE (activity_id, guild_id)
  CHECK (organization_id consistency vs activities.organization_id in app txn)

activity_projections  (evolve)
  # DROP PK activity_id-only
  id UUID PK (new) OR composite UNIQUE (activity_id, guild_id)
  activity_id, guild_id, channel_id, message_id, opaque_id, status, updated_at
  UNIQUE (activity_id, guild_id)
  UNIQUE (opaque_id)  # keep

participations  (evolve)
  + scope_guild_id TEXT NULL
  # SHARED: NULL; SEPARATE: NOT NULL = target guild of the RSVP surface
```

### 1.4 Semantics

**SHARED**

- One `participant_limit` on `activities`.
- Occupancy = count of active participations with `occupiesSlot` where
  `scope_guild_id IS NULL`.
- Waitlist FIFO global: `waitlist_position` unique per `activity_id` (existing
  index pattern, still valid when `scope_guild_id IS NULL`).
- RSVP from any published guild mutates the **same** pool.
- Each guild still has its own projection message (fan-out).

**SEPARATE**

- Capacity is **per publication target**, not a single shared integer alone.
  Design storage: either
  - `activity_publication_targets.participant_limit` (nullable → inherit home),
    **preferred**, or
  - side table `activity_guild_capacities (activity_id, guild_id, limit)`.
- Occupancy / waitlist partitioned by `scope_guild_id = target.guild_id`.
- Unique waitlist: `(activity_id, scope_guild_id, waitlist_position)`.
- RSVP on guild A never consumes guild B capacity.

**Single-guild backward compatibility**

- Legacy rows: `participant_mode = 'shared'`, one target implied by
  `activities.guild_id` + existing projection.
- Migration backfills one `activity_publication_targets` row from home guild +
  `publication_channel_id` / projection channel.
- Existing APIs that take a single `guildId` keep working as “home-only publish”.

### 1.5 RSVP mutation routing

1. Resolve interaction / HTTP guild context → `requestGuildId`.
2. Load activity + mode + targets; fail-closed if `requestGuildId` ∉ targets
   (unless read-only list rules say otherwise).
3. Authorize with existing guild-scoped permissions for that guild.
4. If mode SHARED → mutate global pool (`scope_guild_id NULL`).
5. If mode SEPARATE → mutate pool for `scope_guild_id = requestGuildId`.
6. Same transaction: write participation + outbox events
   (`rsvp_changed` / `waitlist_promoted`) with **projection fan-out hints**
   listing all target guilds that must refresh (SHARED) or only the affected
   guild (SEPARATE).

### 1.6 Multi-guild authorization

| Actor               | Rule                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| Ordinary member     | One allowed Discord (Identity/Authz existing entitlement); cannot publish multi   |
| Publish multi       | Require `permission.activity.event.publish.multi_guild` at **organization** scope |
| Per-guild RSVP/read | Existing `event.join` / `event.read` on **that** guild                            |
| Manage              | `manage.self` / `manage.guild` evaluated in guild of the target being managed     |
| Cross-guild forgery | Reject body `guildId` not in session + not in publication targets                 |

### 1.7 No new microservice

Extend only:

- `activity-service` (domain, migrations, outbox publish adapter)
- `discord-gateway` (RMQ consumer + projection adapter; keep HTTP deliver as
  fallback / transition)
- `admin` (smallest multi-target + mode selector UX)
- `packages/*` for shared AMQP client helpers if needed
- `infrastructure/docker` + deploy docs for RabbitMQ

WWW: member surfaces remain guild-scoped reads/RSVP; **no creator** in P4.5.

---

## 2. Database / migrations (design only — do not execute in prod here)

### 2.1 Proposed migration files (names indicative)

1. `005_p45_participant_mode.sql` — enum/check + column default `shared`
2. `006_p45_publication_targets.sql` — table + backfill from home guild
3. `007_p45_projections_multi.sql` — widen projections uniqueness
4. `008_p45_participations_scope.sql` — `scope_guild_id` + new unique indexes
5. `009_p45_outbox_delivery_meta.sql` — optional columns for broker delivery
   tracking (see §3); keep existing claim columns intact

### 2.2 Compatibility rules

| Rule                               | How                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| No reset                           | Additive tables/columns only                                                           |
| No destructive rewrite             | Backfill; dual-read period in app if needed                                            |
| Existing single-guild events valid | Defaults + backfill one target                                                         |
| Existing outbox rows deliverable   | Do not change required payload keys; only additive envelope fields                     |
| Forward rollout                    | App understands missing mode as `shared` until column present                          |
| Concurrency                        | Keep occupancy checks inside activity DB transactions; unique indexes enforce waitlist |

### 2.3 Index / constraint sketch

```sql
-- SEPARATE waitlist uniqueness
CREATE UNIQUE INDEX participations_sep_waitlist_uidx
  ON participations (activity_id, scope_guild_id, waitlist_position)
  WHERE scope_guild_id IS NOT NULL
    AND waitlist_position IS NOT NULL
    AND resigned_at IS NULL AND removed_at IS NULL;

-- SHARED waitlist remains activity-scoped (existing index; optionally
-- restrict WHERE scope_guild_id IS NULL)

-- Active user uniqueness per scope
CREATE UNIQUE INDEX participations_sep_discord_uidx
  ON participations (activity_id, scope_guild_id, discord_user_id)
  WHERE scope_guild_id IS NOT NULL AND discord_user_id IS NOT NULL
    AND resigned_at IS NULL AND removed_at IS NULL;
```

### 2.4 Rollback limitations (document in migration notes)

- Cannot safely drop `scope_guild_id` after SEPARATE data exists without
  merging pools (product-unsafe).
- Projection PK widen: reverse requires collapsing multi rows (data loss risk).
- Rollback strategy: **forward-fix only**; feature flag
  `ACTIVITY_MULTI_GUILD_ENABLED=false` disables new publish paths while
  schema remains.

---

## 3. RabbitMQ topology

### 3.1 End-to-end path (Accepted)

```text
Postgres txn (activity mutation + INSERT outbox_messages)
  → outbox claim/lease (existing)
  → publisher adapter (new; replaces/ besides HTTP dispatcher)
  → RabbitMQ
  → consumer (discord-gateway worker)
  → Discord projection adapter (edit/publish in-place)
  → ACK
  → outbox complete
```

Durability SoT remains **outbox row**. Broker is transport only.
Domain never imports `amqplib`.

### 3.2 Topology (exact names)

| Resource       | Name                                    | Type / notes                           |
| -------------- | --------------------------------------- | -------------------------------------- |
| Exchange       | `v2.activity.events`                    | topic, durable                         |
| Main queue     | `v2.discord.activity.projections`       | **quorum**, durable                    |
| Retry exchange | `v2.activity.events.retry`              | topic, durable                         |
| Retry queue    | `v2.discord.activity.projections.retry` | quorum; TTL + dead-letter back to main |
| DLX            | `v2.activity.events.dlx`                | fanout/topic durable                   |
| DLQ            | `v2.discord.activity.projections.dlq`   | quorum; no auto-consume                |

**Routing key:** `activity.{aggregate}.{action}.v1`  
Examples (match existing catalog):

- `activity.activity.created.v1`
- `activity.activity.rsvp_changed.v1`
- `activity.activity.cancelled.v1`
- `activity.activity.schedule_changed.v1`
- `activity.activity.waitlist_promoted.v1`
- `activity.activity.reconfirm_required.v1`
- `activity.activity.finished.v1`
- `activity.activity.projection_requested.v1`
- `activity.panel.projection_repaired.v1`

Binding: main queue binds `activity.#` on `v2.activity.events`.

### 3.3 Message envelope (v1)

```json
{
  "envelopeVersion": 1,
  "messageId": "<uuid>",
  "outboxId": "<uuid>",
  "eventType": "activity.activity.rsvp_changed.v1",
  "occurredAt": "ISO-8601",
  "organizationId": "<org>",
  "aggregateType": "activity",
  "aggregateId": "<activity-uuid>",
  "aggregateVersion": 12,
  "correlationId": "<uuid>",
  "causationId": "<optional>",
  "projection": {
    "mode": "shared|separate|single",
    "targets": [{ "guildId": "...", "channelId": "...", "opaqueProjectionId": "..." }]
  },
  "payload": {}
}
```

Rules:

- `messageId` == deterministic function of `outboxId` (or equal to `outboxId`)
  for publisher idempotency.
- `payload` stays the domain event body already written to outbox JSONB.
- Consumer **must** validate `organizationId` + each `guildId` against
  gateway guild allow-list / bot membership before Discord write.

### 3.4 Publisher confirms

- Enable publisher confirms on channel.
- Mark outbox `completed` **only after** confirm ack for that `outboxId`.
- On confirm nack / timeout: release/retry via existing `attempt_count` +
  `available_at` backoff (do **not** complete outbox).
- Prefetch on publisher side N/A; claim limit stays (today `CLAIM_LIMIT=10`).

### 3.5 Consumer ACK / NACK / prefetch

| Setting            | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| Prefetch           | `10` (start; tune via env)                                                           |
| ACK                | After successful Discord projection write **and** local dedupe record                |
| NACK requeue=false | Poison / schema invalid → DLQ path                                                   |
| NACK requeue=true  | Transient Discord 429/5xx **only if** attempt budget remains; prefer retry queue TTL |

### 3.6 Retry / DLQ / poison

1. Transient failure → publish to retry exchange with `x-retry-count` + delay
   (TTL queue) → dead-letter back to main.
2. After max attempts (align with outbox `attempt_count` / e.g. 8): route to DLQ;
   outbox row `failed` with `last_error`; alert metric.
3. Poison (bad envelope, authz fail closed, unknown guild): **no** infinite
   requeue → DLQ immediately + audit log.

### 3.7 Dedupe

- Consumer table `projection_delivery_dedupe (message_id PK, processed_at)`
  in discord-gateway DB **or** reuse activity outbox complete as source of
  truth if consumer calls `outbox/:id/complete` after success.
- Preferred: keep outbox complete as SoT; consumer treats duplicate
  `messageId`/`outboxId` as success no-op (idempotent Discord edit).

### 3.8 Ordering assumptions

- **Per aggregateId**: best-effort via single consumer group + quorum queue;
  not a global total order.
- Out-of-order: consumer applies event only if
  `aggregateVersion >= last_applied_version` for that projection; stale
  versions ACK without Discord write (or refresh from Activity GET).
- Cross-aggregate: no order guarantee.

### 3.9 Transition from HTTP dispatcher

Feature flags:

- `ACTIVITY_OUTBOX_TRANSPORT=http|rabbitmq|dual`
- Phase A: `dual` — publish RMQ + keep HTTP until consumer lag=0
- Phase B: `rabbitmq` only
- HTTP path remains for emergency (`http`) — Issue #25 resilience

### 3.10 Restart recovery

- Publisher restart: unconfirmed outbox stays `claimed` until lease expiry →
  reclaim → republish (dedupe by `messageId`).
- Consumer restart: unacked messages redelivered by quorum queue; dedupe
  prevents double Discord create; edit path is idempotent.

---

## 4. Failure matrix

| Failure                                          | Data safety             | Retry                               | Dedupe                      | Operator visibility             | Auto recovery           |
| ------------------------------------------------ | ----------------------- | ----------------------------------- | --------------------------- | ------------------------------- | ----------------------- |
| RabbitMQ unavailable                             | Outbox pending retained | Publisher backoff                   | N/A                         | `outbox.pending` gauge + alert  | Yes when RMQ returns    |
| Publisher restart                                | Lease expiry reclaim    | Yes                                 | messageId                   | logs `leaseOwner`               | Yes                     |
| Consumer restart                                 | Unacked redelivery      | Yes                                 | messageId / outbox complete | consumer restart metric         | Yes                     |
| Crash before confirm                             | Outbox not completed    | Reclaim + republish                 | messageId                   | confirm timeout metric          | Yes                     |
| Crash after confirm, before complete             | Risk of redelivery      | Consumer no-op                      | **Required**                | mismatch metric outbox vs queue | Complete on dedupe hit  |
| Crash before ACK after Discord write             | Redelivery              | Idempotent edit                     | messageId                   | rare dup edit                   | Yes                     |
| Crash after Discord + ACK before outbox complete | Outbox may retry        | Consumer no-op                      | messageId                   | warn                            | Complete on second pass |
| Duplicate event                                  | No double create        | ACK                                 | messageId                   | debug                           | Yes                     |
| Out-of-order event                               | No downgrade            | ACK skip/stale                      | version check               | version_skew counter            | Refresh optional        |
| Discord 429                                      | No outbox complete      | Retry TTL / Retry-After             | —                           | rate_limit warn                 | Yes                     |
| Discord 5xx                                      | No complete             | Retry                               | —                           | discord_5xx                     | Yes                     |
| Missing Discord permission                       | Fail closed             | Limited retry then DLQ              | —                           | admin readiness flag            | Manual grant            |
| Bot removed from guild                           | Fail closed             | DLQ / mark projection `unavailable` | —                           | admin + audit                   | Manual reinvite         |
| Queue backlog                                    | Outbox + queue depth    | Scale prefetch / consumers          | —                           | depth alert                     | Partial                 |
| Network partition                                | Outbox durable          | Both sides retry                    | messageId                   | partition alarms                | Yes                     |
| Poison message                                   | No silent drop          | DLQ                                 | —                           | DLQ depth pager                 | Manual inspect          |

---

## 5. Security / abuse threat model

| Threat                        | Control                                                                | AuthZ                                 | Validation                     | Audit            | Tests                 |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------- | ------------------------------ | ---------------- | --------------------- |
| Cross-guild mutation          | Target allow-list + guild-scoped permissions                           | join/manage on **request** guild      | `guildId ∈ targets`            | audit `guild_id` | isolation specs       |
| Cross-org mutation            | `organization_id` match on activity + assertion aud                    | org boundary                          | org header/body mismatch → 403 | yes              | cross-org deny        |
| Forged guildId                | Ignore client guild unless equals path + membership                    | entitlements                          | fail-closed                    | yes              | spoof specs           |
| Forged projection / opaque id | Signed custom_id + server-side lookup                                  | —                                     | opaque → activity/guild        | yes              | forged id             |
| Unexpected channel            | Target `channel_id` SoT; Discord deliver uses SoT only                 | panel/config manage                   | channel must match target      | yes              | channel scope         |
| Unexpected bot guild          | Gateway membership check before write                                  | —                                     | bot not in guild → unavailable | yes              | bot-removed           |
| Stale membership              | Authz + Identity entitlements at mutation time                         | fail-closed                           | re-check                       | yes              | stale member          |
| Broker replay                 | dedupe messageId + outbox complete                                     | —                                     | —                              | —                | replay suite          |
| Duplicate delivery            | idempotent projection edit                                             | —                                     | —                              | —                | dual deliver          |
| Tampered envelope             | Optional HMAC later; v1 trust private network + mTLS-ish internal only | service assertion if calling Activity | schema zod                     | reject poison    | envelope fuzz         |
| SHARED/SEPARATE leakage       | scope_guild_id invariants                                              | —                                     | mode checks in domain          | —                | concurrent slot tests |
| Permission escalation         | multi publish requires org sensitive permission                        | `publish.multi_guild`                 | cannot self-grant              | yes              | escalate deny         |
| Admin overreach               | Admin APIs still guild/org scoped via Authz                            | config.manage / manage.guild          | no global bypass               | yes              | admin scope           |

Issue #25: no public AMQP ports; credentials in Zeabur secrets; no localhost
trust in production; secrets never logged (existing redaction).

---

## 6. Surface impact (smallest change)

### 6.1 Discord

- **Do not redesign Hub** (compact Section+button layout stays).
- Event projection renderer: unchanged UX language; may show capacity text
  that reflects SHARED vs SEPARATE (copy only if Accepted strings exist —
  otherwise keep current occupancy line sourced from correct pool).
- Multi-guild publish: **not** required on Discord create modal in first
  slices if Admin carries multi-target publish; optional later slice adds
  target multi-select only with `publish.multi_guild`.
- Projection consumer replaces HTTP-only deliver path behind flag.

### 6.2 Admin

Owner-friendly additions (minimal):

1. On publish / repair flow: multi-guild target picker (connected guilds +
   channel per guild).
2. Participant mode radio: **Wspólna lista** / **Osobne listy** (SHARED /
   SEPARATE) — only when ≥2 targets.
3. Readiness: show projection status per guild; RMQ/outbox depth if exposed
   via activity health.
4. No Hub redesign; no new product modules.

### 6.3 WWW

- Member list/detail/RSVP remain single selected guild context.
- RSVP calls already guild-scoped → automatically SEPARATE-correct;
  SHARED uses same API with server applying global pool.
- **No WWW creator** in P4.5.

---

## 7. Zeabur RabbitMQ

| Topic          | Plan                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Service        | Private RabbitMQ addon/prebuilt in **same** Zeabur project/env as V2 stack                          |
| Network        | Internal DNS only (`rabbitmq` / service hostname); **no public TCP 5672**                           |
| Creds          | `RABBITMQ_URL` amqps/amqp as Zeabur secret; rotate via owner Variables                              |
| TLS            | Prefer TLS if addon supports; else private network only (document risk)                             |
| Persistence    | Durable quorum queues + persistent volumes                                                          |
| Health         | `rabbitmq-diagnostics ping` (compose already); Zeabur health check                                  |
| Vars           | `RABBITMQ_URL`, `ACTIVITY_OUTBOX_TRANSPORT`, `ACTIVITY_RMQ_*` prefetch/retry, existing outbox flags |
| Deploy order   | 1) RabbitMQ healthy → 2) activity publisher flag dual → 3) discord consumer → 4) cut HTTP           |
| Rollback order | 1) transport=`http` → 2) stop consumer → 3) keep RMQ for drain → 4) optional suspend RMQ            |
| Observability  | Queue depth, DLQ depth, confirm fail rate, outbox pending/claimed/failed, consumer lag              |
| Issue #25      | Credentials never in git; no public management UI in prod                                           |

Local: existing `infrastructure/docker/docker-compose.yml` `rabbitmq` service

- `infrastructure/rabbitmq/rabbitmq.conf` (quorum default). Declare topology
  via migration script / `packages` init on boot (idempotent `assertQueue`).

---

## 8. Test matrix → likely paths

| Case                            | Type               | Likely path                                                                |
| ------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| SHARED concurrent final slot    | domain/integration | `services/activity-service/src/domain/**`, `**/activity.use-cases.spec.ts` |
| SHARED waitlist FIFO            | domain             | same + waitlist promotion specs                                            |
| SEPARATE concurrent final slot  | domain             | new `participant-mode.separate.spec.ts`                                    |
| SEPARATE independent capacities | domain             | same                                                                       |
| Cross-guild isolation           | application        | `authorize-fail-closed`, use-case guild checks                             |
| Cross-org isolation             | application        | org mismatch specs                                                         |
| Publisher confirm success/fail  | infra              | `**/outbox/rabbitmq-publisher*.spec.ts`                                    |
| Consumer ACK                    | gateway            | `apps/discord-gateway/**/projection-consumer*.spec.ts`                     |
| Duplicate delivery              | both               | publisher + consumer dedupe specs                                          |
| Restart recovery                | integration        | `tools` / service integration with Testcontainers RMQ                      |
| DLQ poison                      | infra              | publisher/consumer DLQ specs                                               |
| Discord 429                     | gateway adapter    | existing discord adapter retry tests extended                              |
| Out-of-order version            | consumer           | version gate spec                                                          |
| Migration compatibility         | SQL/integration    | migrate 001→009 on fixture DB with single-guild row                        |
| Docker compose                  | infra              | `pnpm` / compose config + RMQ ping                                         |
| Zeabur smoke                    | ops                | health ready + outbox gauges + one projection edit after flag on           |

Do **not** weaken gates. Map CI: unit in `pnpm test`; RMQ integration behind
`RUN_INFRA_TESTS` / compose like existing infra tests.

---

## 9. Implementation slices (dependency-ordered)

### P4.5-S0 — Plan checkpoint (this document)

- **Goal:** Auditable plan locked.
- **Files:** `docs/ai/P4_5_IMPLEMENTATION_PLAN.md`, SoT pointers.
- **Contracts:** none runtime.
- **Migration:** none.
- **Security:** none.
- **Tests:** docs format.
- **Checkpoint:** `READY_FOR_CHATGPT_P4_5_PLAN_AUDIT` / `P4_5_PLAN_CHECKPOINT_SHA`.

### P4.5-S1 — RabbitMQ package + local topology

- **Goal:** Idempotent declare exchange/queues; config guards; compose docs.
- **Files:** `packages/messaging` (or `packages/amqp-topology`),
  `infrastructure/rabbitmq/*`, `packages/configuration` env keys,
  `docs/deploy/ZEABUR_OWNER_VARIABLES.md`.
- **Contracts:** topology names from §3 (frozen in code constants).
- **Migration:** none.
- **Security:** no public ports; production URL non-localhost guard.
- **Tests:** topology declare unit; compose config.
- **Checkpoint:** `P45_S1_RMQ_TOPOLOGY_SHA`.

### P4.5-S2 — Outbox → RabbitMQ publisher adapter

- **Goal:** Broker-agnostic port `OutboxTransport`; RMQ adapter with confirms;
  flag `ACTIVITY_OUTBOX_TRANSPORT`.
- **Files:** `services/activity-service/src/application/ports/*`,
  `infrastructure/outbox/*`, env schema, keep HTTP dispatcher.
- **Contracts:** envelope v1.
- **Migration:** optional additive outbox delivery metadata only.
- **Security:** secrets redaction; fail-fast missing URL when transport=rmq.
- **Tests:** confirm ack/nack; crash before/after confirm; claim reclaim.
- **Checkpoint:** `P45_S2_PUBLISHER_SHA`.

### P4.5-S3 — Discord projection consumer

- **Goal:** Consume main queue; call existing projection apply path; ACK/dedupe;
  retry/DLQ.
- **Files:** `apps/discord-gateway/src/infrastructure/messaging/*`,
  wire into module; reuse `ActivityProjectionController` logic internally.
- **Contracts:** same envelope; guild/channel scope fail-closed.
- **Migration:** optional dedupe table in gateway if not using outbox complete.
- **Security:** §5 consumer checks.
- **Tests:** duplicate, 429, poison→DLQ, restart redelivery.
- **Checkpoint:** `P45_S3_CONSUMER_SHA`.

### P4.5-S4 — Dual-run cutover

- **Goal:** `dual` transport in staging/Zeabur; metrics; then `rabbitmq`.
- **Files:** deploy docs, env, dashboards/notes in observability.
- **Migration:** none.
- **Security:** Issue #25 private RMQ.
- **Tests:** Zeabur smoke checklist.
- **Checkpoint:** `P45_S4_CUTOVER_SHA`.

### P4.5-S5 — Schema: participant_mode + publication_targets + projection widen

- **Goal:** Migrations 005–007; backfill; repository read models.
- **Files:** `services/activity-service/migrations/*`, domain entities, repos.
- **Contracts:** OpenAPI additive fields.
- **Migration:** yes (forward-only).
- **Security:** org_id consistency checks in txn.
- **Tests:** migrate fixture single-guild; repository tests.
- **Checkpoint:** `P45_S5_SCHEMA_SHA`.

### P4.5-S6 — SEPARATE/SHARED domain occupancy + RSVP routing

- **Goal:** Domain rules + use-cases for both modes; scope_guild_id.
- **Files:** domain services, `activity.use-cases.ts`, migration 008.
- **Contracts:** RSVP responses include mode + scope.
- **Migration:** 008.
- **Security:** leakage tests.
- **Tests:** concurrent SHARED/SEPARATE slot + FIFO (§8).
- **Checkpoint:** `P45_S6_DOMAIN_MODES_SHA`.

### P4.5-S7 — Multi-guild publish API + AuthZ gate

- **Goal:** Publish to N targets requires `publish.multi_guild`; fan-out outbox
  projection targets.
- **Files:** activity controller/use-cases; authorization catalog already has
  permission id.
- **Contracts:** `POST .../publish` body `{ targets[], participantMode }`.
- **Migration:** none beyond S5.
- **Security:** escalation deny tests.
- **Tests:** single-guild path unchanged; multi without permission → 403.
- **Checkpoint:** `P45_S7_PUBLISH_API_SHA`.

### P4.5-S8 — Admin UX (mode + targets)

- **Goal:** Minimal owner-friendly picker + mode radios; readiness per guild.
- **Files:** `apps/admin/src/pages/*`, `activity-admin.ts`.
- **Contracts:** consume S7 API.
- **Migration:** none.
- **Security:** no new bypasses.
- **Tests:** admin unit/e2e mocked.
- **Checkpoint:** `P45_S8_ADMIN_SHA`.

### P4.5-S9 — WWW guild RSVP verification + docs freeze

- **Goal:** Confirm member RSVP against SHARED/SEPARATE; docs/ADR pointer
  update; Zeabur final smoke.
- **Files:** `apps/web` only if bugfix required; architecture notes.
- **Contracts:** none new.
- **Migration:** none.
- **Security:** regression.
- **Tests:** web e2e guild RSVP; Zeabur smoke.
- **Checkpoint:** `READY_FOR_REVIEW_P4_5` (implementation complete — **future**).

---

## 10. P4.5 Definition of Done (implementation — future)

1. SHARED and SEPARATE both implemented and tested (concurrency + FIFO).
2. Multi-guild publish gated by `permission.activity.event.publish.multi_guild`.
3. PG outbox remains durability boundary; RMQ is transport with confirms,
   ACK/NACK, retry, DLQ, dedupe, restart recovery.
4. Domain/application have zero RabbitMQ imports.
5. Existing single-guild activities continue to work without rewrite.
6. Discord Hub layout unchanged; projections in-place.
7. Admin can configure targets + mode without Hub redesign.
8. WWW has no creator; member RSVP correct per mode.
9. Zeabur: private RabbitMQ, 7 app services + RMQ healthy, same revision
   discipline as P4.0 closure.
10. CI green; Issue #26 Owner integrated UX still deferred to CORE FOUNDATION
    INTEGRATED REVIEW.
11. No merge to `main` without ChatGPT/Owner approval chain.

---

## 11. Stop line

**Do not start slices P4.5-S1+ until ChatGPT approves this plan**
(`READY_FOR_CHATGPT_P4_5_PLAN_AUDIT` → plan APPROVED) **and** P4.0 final delta
audit is accepted per rolling audit workflow.

Planning task ends at documentation checkpoint only.
