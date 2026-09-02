# Durability / Recovery / Auto-Sync Audit

**Task:** `V2-DURABILITY-RECOVERY-AND-AUTO-SYNC-AUDIT-002`  
**Mode:** Technical reliability audit — no new product behavior  
**Date:** 2026-08-24  
**Branch:** `cursor/p4-1-activity-domain`

## Invariant under audit

```
BACKEND SoT CHANGE
  → DURABLE EVENT / OUTBOX
  → DOWNSTREAM PROJECTION / NOTIFICATION
  → AUTOMATIC RECOVERY
```

No **normal** workflow may require manual `/sync`, `/refresh`, republish, restart, redeploy, or Admin force-sync.  
Reconcile / Admin repair / `/centrum-reconcile` are **safety nets**, not the delivery path.

## Architecture summary

| Path                               | SoT write                             | Durable signal                                                      | Downstream apply               | Auto-recovery                                |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------- | ------------------------------ | -------------------------------------------- |
| Activity Discord event projection  | activity DB                           | TX outbox `PROJECTION_REQUESTED` (full payload)                     | discord-gateway HTTP deliver   | Outbox retry + projection auto-repair        |
| Hub panel                          | activity DB + publish occurrences     | Direct Discord apply (+ optional audit `PANEL_PROJECTION_REPAIRED`) | discord-gateway hub ops        | Startup hub reconcile (default on)           |
| Notifications                      | Inbox + outbox `NOTIFICATION_DELIVER` | Outbox                                                              | Discord DM (Inbox remains SoT) | Outbox retry; DM blocked → `fallback_inbox`  |
| LFG lifecycle matching             | activity DB + Inbox                   | Outbox notification + projection                                    | DM + Discord post              | Matching after projection; watch idempotency |
| Profile / interest role projection | identity-service foundation           | **Not wired to Discord apply loop**                                 | N/A in this foundation         | Documented gap — not Activity outbox         |

Default production transport: **`ACTIVITY_OUTBOX_TRANSPORT=http`**.  
`rabbitmq` / `dual` are **boot-blocked** until delivery receipts exist (dual would double-apply).

---

## Scenario matrix

| Scenario                                               | Expected                        | Status             | Notes                                                                                                        |
| ------------------------------------------------------ | ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Duplicate outbox deliver                               | Idempotent apply                | **PASS** (process) | In-memory `outboxId` dedupe on projection + DM; lost on process restart                                      |
| Out-of-order event                                     | Last write / versioned payload  | **PASS**           | Full projection payload from current SoT; apply is replace/edit                                              |
| Consumer crash after Discord success before outbox ack | No duplicate public post        | **PARTIAL**        | Lease reclaim redelivers; in-memory dedupe helps same process only; hub has nonce/occurrence — events do not |
| Consumer crash before processing                       | Retry                           | **PASS**           | Claim lease expires → reclaim                                                                                |
| Rabbit outage                                          | N/A for prod http               | **PASS**           | Rabbit/dual blocked at config                                                                                |
| Discord outage / 5xx                                   | Retry with backoff              | **PASS**           | Outbox `failRetry` + backoff ≤ 300s                                                                          |
| Discord 429                                            | Retry                           | **PASS**           | HTTP 429 retryable; notification `rate_limited` body retries                                                 |
| Service restart                                        | Resume pending outbox           | **PASS**           | Claim + poll on start                                                                                        |
| DB restart                                             | Resume                          | **PASS**           | Durable outbox + projections                                                                                 |
| Stale projection                                       | Auto re-enqueue                 | **PASS** (fixed)   | Permanent fail → `failed` + delayed lease → `ActivityProjectionAutoRepair`                                   |
| Missing Discord message                                | Recreate on apply               | **PASS**           | Event edit path recreates when message missing                                                               |
| Deleted Discord message                                | Recreate / remove handling      | **PASS**           | Apply path handles missing; remove completes                                                                 |
| Duplicate Discord message                              | Prevent                         | **PARTIAL**        | Crash-after-create window; no durable consumer receipt yet                                                   |
| Admin repair/scan                                      | Full payload only               | **PASS** (fixed)   | Uses `enqueueEventProjection` → `PROJECTION_REQUESTED`                                                       |
| Hub messageId change signal                            | No Discord deliver of thin body | **PASS** (fixed)   | `PANEL_PROJECTION_REPAIRED` completed as audit only                                                          |
| Manual `/sync` for normal ops                          | Not required                    | **PASS**           | Hub startup reconcile; event auto-repair                                                                     |

---

## CRITICAL findings

### C1 — Admin repair/scan enqueued thin payloads (gateway permanent-fail)

|            |                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause**  | `repairProjection` / `requestProjectionScan` inserted incomplete bodies (or `PANEL_PROJECTION_REPAIRED` for events). Gateway requires full event schema → permanent fail. |
| **Impact** | Admin “repair” made projections worse; looked like force-sync was required forever.                                                                                       |
| **Fix**    | Shared `enqueueEventProjection()` builds full `PROJECTION_REQUESTED` payloads; repair/scan use it.                                                                        |
| **Proof**  | `enqueue-event-projection.ts`; `activity-admin.use-cases.ts` repair/scan.                                                                                                 |

### C2 — `PANEL_PROJECTION_REPAIRED` thin hub signal Discord-delivered

|            |                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause**  | Dispatcher treated panel repair as Discord deliver; payload `{ panelId, messageId }` fails validation while Discord already correct via direct hub path. |
| **Impact** | Stuck outbox / noise after successful hub upsert.                                                                                                        |
| **Fix**    | Removed from `DISCORD_DELIVER_EVENT_TYPES`; completed as audit/domain signal only.                                                                       |
| **Proof**  | `outbox-dispatcher.ts` + unit test “completes PANEL_PROJECTION_REPAIRED without Discord deliver”.                                                        |

### C3 — `dual` / `rabbitmq` transport double-apply or never-complete

|            |                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Cause**  | `dual` publishes Rabbit **and** HTTP; gateway consumer + HTTP both apply. Pure `rabbitmq` never completes without receipts. |
| **Impact** | Duplicate Discord posts or infinite retry.                                                                                  |
| **Fix**    | Env validation + dispatcher fail-fast: only `http` allowed while receipts missing.                                          |
| **Proof**  | `activity-env.ts` `assertOutboxWorkerRequirements`; `outbox-dispatcher.onModuleInit`.                                       |

---

## HIGH findings

### H1 — Unbounded outbox retries with no projection failure state

|           |                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cause** | Poison / long-fail rows never marked `failed`; `claimProjectionRepair` unused and previously claimed `pending` (racing healthy in-flight). |
| **Fix**   | Max attempts (25) → `permanentFail` + projection `failed` + delayed lease; claim/list problems only `failed                                | degraded | missing`; `ActivityProjectionAutoRepair` re-enqueues full payloads. |
| **Proof** | `outbox-dispatcher.ts`, `projection-auto-repair.ts`, repository claim/list filters, unit test max attempts.                                |

### H2 — LFG watch/suppress/full-group ignored Idempotency-Key

|            |                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------- |
| **Cause**  | Clients/gateway send keys; controller/use-cases skipped `mutate` idempotency store.      |
| **Impact** | Duplicate watches / suppress under retry.                                                |
| **Fix**    | Wire `mutationCtx` + `mutate` for create/update/cancel/pause/resume/suppress/full-group. |
| **Proof**  | `activity.controller.ts`, `activity.use-cases.ts`.                                       |

### H3 — Notification DM redelivery after success before outbox complete

|           |                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------- |
| **Cause** | No consumer-side `outboxId` memory → duplicate DMs on reclaim.                                          |
| **Fix**   | In-process dedupe Map (same pattern as projections). Durable cross-restart receipt still open (MEDIUM). |
| **Proof** | `notification-dm-delivery.service.ts` + unit test.                                                      |

---

## MEDIUM / documented (not product expansion)

| ID  | Item                                                                 | Disposition                                                                   |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| M1  | In-memory projection/DM dedupe lost on restart / multi-instance      | Needs durable delivery receipts (Owner/architecture)                          |
| M2  | Event path lacks hub-style publish nonce for create-before-ack       | Same receipt work                                                             |
| M3  | Watch create/resume does not re-scan existing open groups            | **Product behavior** — document only; do not implement without Owner decision |
| M4  | Profile/interest Discord role projection not in Activity outbox loop | Identity foundation only — out of this deliverable                            |
| M5  | Hub vs event asymmetry (hub startup reconcile vs event auto-repair)  | Event auto-repair added; hub remains direct-apply + startup reconcile         |

---

## Manual controls (safety net only)

| Control                      | Normal path? | Role                                             |
| ---------------------------- | ------------ | ------------------------------------------------ |
| Admin projection repair/scan | No           | Operator safety net (now enqueues full payloads) |
| `/centrum-reconcile`         | No           | Emergency hub                                    |
| Redeploy / restart           | No           | Ops; outbox + auto-repair resume automatically   |
| `/sync` / `/refresh`         | No           | Must not be required for SoT→Discord             |

---

## Idempotency & durable processing records

| Record                    | Store                   | Purpose                                     |
| ------------------------- | ----------------------- | ------------------------------------------- |
| `outbox_messages`         | activity DB             | Durable pending/claimed/delivered/failed    |
| `activity_projections`    | activity DB             | Projection status + lease for repair        |
| `idempotency` rows        | activity DB             | HTTP mutation dedupe (incl. LFG watches)    |
| Hub publish occurrences   | activity DB             | Hub nonce / adopt / sent                    |
| Inbox items               | activity DB             | Notification SoT                            |
| In-memory `outboxId` maps | discord-gateway process | Rapid redelivery shield (not cross-restart) |

---

## Fixes shipped in this task

1. `enqueueEventProjection` shared helper; admin repair/scan use full payloads
2. `PANEL_PROJECTION_REPAIRED` audit-only in dispatcher
3. Block `rabbitmq`/`dual` outbox transport
4. Max delivery attempts + mark projection `failed`
5. Projection claim/list exclude healthy `pending`
6. `ActivityProjectionAutoRepair` worker
7. LFG mutate idempotency wiring
8. Notification DM in-process `outboxId` dedupe

**Out of scope (per task):** Reservations product, Marketplace product, watch re-scan of existing groups.

---

## Validation

Run: `corepack pnpm validate` — **PASS** (Playwright Chromium installed for e2e on this agent).  
Checkpoint marker: `DURABILITY_RECOVERY_AUDIT_SHA` = `be86063726947930a02c06eab38dad947a4243cc`.

## Verdict

After fixes: **normal SoT→Discord/notification path is durable + automatically retried/repaired** for Activity event projections, hub (direct + startup), and notifications.  
Remaining gap for perfect at-most-once Discord create is **durable consumer receipts** (M1/M2) — architectural follow-up, not Admin force-sync.
