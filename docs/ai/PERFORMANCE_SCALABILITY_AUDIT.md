# Performance and Scalability Audit

Task: `V2-PERFORMANCE-AND-SCALABILITY-AUDIT-001`  
Base: `b76dcf556ab8007311aecab046c3ef2e2357aee4` (DATA_RECOVERY_AUDIT_SHA)  
Checkpoint: **`PERFORMANCE_SCALABILITY_AUDIT_SHA`** = `179be84ee645cf2a3709a403798349407a60db56`

Mode: performance engineering — **no new product features** (indexes, batching, caps, timeouts only).

---

## Executive summary

| Severity | Found | Fixed | Open |
| -------- | ----- | ----- | ---- |
| CRITICAL | 0     | 0     | 0    |
| HIGH     | 8     | 6     | 2    |
| MEDIUM   | 9     | 1     | 8    |
| LOW      | 5     | 0     | 5    |

**LOCAL_VALIDATE:** PASS  
**Proof tests:** `lfg-batch-queries.spec.ts` (batched LFG search = 3 SQL batches, not 3×N)

---

## HIGH — fixed

### H-PERF-01 — LFG search N+1 (up to ~151 queries per search)

| Field      | Detail                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path       | `searchLfgMatches` → per-activity `buildGroupMatchContext`                                                                                                                                           |
| Complexity | O(activities × 3) SQL — 50 activities → 150 queries                                                                                                                                                  |
| Impact     | Slow LFG search under guild load; connection pool pressure                                                                                                                                           |
| Fix        | `buildGroupMatchContextsForActivities` + batch repo methods (`listActivityRoleRequirementsForActivities`, `countParticipationsByPartyRoleForActivities`, `countOccupiedParticipationsForActivities`) |
| Proof      | `lfg-batch-queries.spec.ts` — 1 batch call each, zero single-activity calls                                                                                                                          |

### H-PERF-02 — LFG intent notify per-intent suppression queries

| Field      | Detail                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Path       | `notifyLfgIntentsForActivity`                                                                                                              |
| Complexity | 3 DB queries × N intents + duplicate auth/identity per recipient                                                                           |
| Impact     | RSVP/composition change blocks on 1000 intents                                                                                             |
| Fix        | Batch `listSuppressedLfgIntentIds`, `listSuppressedLfgActorRecipients`, `listLfgNotifiedRecipients`; membership + character caches per job |
| Proof      | Existing LFG notify specs + batch path in code                                                                                             |

### H-PERF-03 — Unbounded `listActiveLfgIntents`

| Field      | Detail                                                           |
| ---------- | ---------------------------------------------------------------- |
| Complexity | O(all active intents) full scan                                  |
| Fix        | `LIMIT 500` + index `lfg_intents_active_org_idx` (migration 019) |
| Proof      | Repository SQL + migration                                       |

### H-PERF-04 — `listActivityTypes` N+1 (2 queries × type count)

| Field      | Detail                                                              |
| ---------- | ------------------------------------------------------------------- |
| Path       | `presentActivities` / browse enrichment                             |
| Complexity | 1 + 2N queries per guild list                                       |
| Fix        | `loadActivityTypesForGuild` — 3 queries total via `ANY($1::uuid[])` |
| Proof      | Code inspection; bounded query count                                |

### H-PERF-05 — Authorization sync client no timeout

| Field  | Detail                             |
| ------ | ---------------------------------- |
| Path   | `authorization-sync-client.ts`     |
| Impact | Guild reconcile hangs indefinitely |
| Fix    | `AbortSignal.timeout(15_000)`      |
| Proof  | Code                               |

### H-PERF-06 — Internal JWT proof fetches no timeout

| Field | Detail                              |
| ----- | ----------------------------------- |
| Path  | `internal-jwt-proof.service.ts`     |
| Fix   | 5s timeout on identity token + JWKS |
| Proof | Code                                |

### H-PERF-07 — Interaction idempotency O(n) sweep per claim

| Field      | Detail                                                     |
| ---------- | ---------------------------------------------------------- |
| Path       | `idempotency.ts`                                           |
| Complexity | O(map size) every interaction                              |
| Fix        | Periodic sweep (5s) + max 10_000 entries with LRU eviction |
| Proof      | Existing idempotency spec                                  |

### H-PERF-08 — Outbox retry storm under outage

| Field  | Detail                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Path   | `outbox-dispatcher.ts`                                                                                  |
| Impact | 10 concurrent POSTs / 2s during discord-gateway degradation                                             |
| Fix    | Adaptive claim limit (10→5→3 on failure streak); honor `Retry-After` on 429; lease reclaim index in 019 |
| Proof  | Code + outbox dispatcher specs                                                                          |

---

## HIGH — open

### H-PERF-09 — Authorization full context reload per LFG membership check

| Field          | Detail                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Path           | `authorize` → `loadAuthorizeContext` in LFG loops                                                               |
| Impact         | External HTTP + heavy SQL per unique recipient (cached within single notify job after this pass for duplicates) |
| Recommendation | Narrow guild-scoped authorize query or short TTL cache at authorization-service                                 |

### H-PERF-10 — api-gateway triple sequential HTTP per activity request

| Field          | Detail                                                      |
| -------------- | ----------------------------------------------------------- |
| Path           | `session-actor.resolver` + activity proxy                   |
| Impact         | Latency multiplier on browse/LFG                            |
| Recommendation | Combined identity session-actor endpoint or short LRU cache |

---

## MEDIUM — fixed

### M-PERF-01 — Unbounded `listReports`

| Fix | `LIMIT 200` (aligned with activity list cap) |

---

## MEDIUM — open

| ID        | Item                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| M-PERF-02 | `listMyActivities` — partial index added (019); query still uses DISTINCT + LEFT JOIN    |
| M-PERF-03 | LFG matching synchronous in RSVP mutation path — defer via outbox job (product decision) |
| M-PERF-04 | `listParticipations` / attendance endpoints unbounded per activity                       |
| M-PERF-05 | api-gateway rate-limit Map grows without periodic global sweep                           |
| M-PERF-06 | No unread inbox COUNT API/index yet                                                      |
| M-PERF-07 | Opaque LFG ID lookups use expression scan                                                |
| M-PERF-08 | `listActivitiesBySeries` unbounded                                                       |
| M-PERF-09 | Notification enqueue 5–7 SQL per recipient in fan-out                                    |

---

## SQL index matrix (migration 019)

| Index                               | Serves                                   |
| ----------------------------------- | ---------------------------------------- |
| `activities_guild_start_active_idx` | Browse / my-activities ORDER BY start_at |
| `participations_discord_active_idx` | My-activities participant filter         |
| `lfg_intents_active_org_idx`        | Active intent scan for matching          |
| `outbox_messages_claim_expired_idx` | Expired lease reclaim                    |

---

## Outbox / notifications / memory (reviewed)

| Area         | Status                                                               |
| ------------ | -------------------------------------------------------------------- |
| Outbox claim | `SKIP LOCKED` + partial indexes; adaptive claim on failures          |
| Inbox        | Keyset pagination + recipient index (012) — OK                       |
| Dedupe       | DB-backed PKs; no unbounded in-memory recipient arrays in LFG notify |
| UI caches    | Draft/LFG UI caches capped at 512 / 20m TTL                          |
| DM dedupe    | FIFO cap 2000 in discord-gateway                                     |

---

## Validation

```
pnpm validate — PASS
lfg-batch-queries.spec.ts — PASS (batched query proof)
```

---

## Recommendation

Safe HIGH bottlenecks addressed without product scope change. Before high-volume LFG production: run migration 019 on Activity DB; consider H-PERF-09/10 in a follow-up infra pass.
