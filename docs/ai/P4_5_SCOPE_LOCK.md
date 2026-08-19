# P4.5 scope lock — recovered from Accepted SoT

Status: `PLAN_LOCKED_PENDING_OWNER_DECISION_1`  
Branch: `cursor/p4-1-activity-domain` · PR #19  
Prepared after: `P4_0_AUDIT_CHECKPOINT_SHA` (see `PROJECT_STATE.md`)

## Classification legend

| Tag | Meaning |
| --- | --- |
| **CURRENT_ACCEPTED** | Explicit Accepted owner/architecture decision |
| **SUPERSEDED** | Replaced by newer Accepted text |
| **HISTORICAL** | Context only; not a build gate |
| **CONTRADICTORY** | Conflicting docs — resolved below or escalated |
| **UNRESOLVED** | Requires `OWNER_DECISION_REQUIRED` before product-visible behavior |

## Search summary (repo-wide)

| Topic | Classification | SoT anchor |
| --- | --- | --- |
| RabbitMQ transport for Activity outbox | **CURRENT_ACCEPTED** from P4.5 | `P4-D5`, ADR-0014 §transport, architecture §9 |
| PostgreSQL transactional outbox retained | **CURRENT_ACCEPTED** | P4-D5, ADR-0014 |
| HTTP + idempotency during P4.1–P4.4 | **CURRENT_ACCEPTED** (historical phase) | P4-D5 |
| `permission.activity.event.publish.multi_guild` | **CURRENT_ACCEPTED** | architecture §6, `permissions.ts` |
| Ordinary member: one allowed Discord | **CURRENT_ACCEPTED** (product rule in task brief) | task P4.5 §17 + architecture multi-guild intent |
| Organizer/admin multi-Discord publish | **CURRENT_ACCEPTED** | architecture §6 permission + P4 traceability row A |
| Activity data central SoT | **CURRENT_ACCEPTED** | ADR-0014, architecture |
| Discord messages = projections | **CURRENT_ACCEPTED** | ADR-0014, P4.2 notes |
| Multi-guild participant mode (shared vs split lists) | **UNRESOLVED** | `P4_TEST_TRACEABILITY.md` lists both options; no Accepted pick |
| P4.5 in deploy docs (no RMQ yet on Zeabur) | **HISTORICAL** for P4.1–P4.4 deploy | `ZEABUR.md`, `ZEABUR_OWNER_VARIABLES.md` — superseded **for P4.5 planning only** |
| `CHATGPT_TO_CURSOR.md` “do not start P4.5” | **SUPERSEDED** by owner task `P4-0-SELF-AUDIT-AND-CONTINUOUS-HANDOFF-001` | rolling audit mode |
| Issues #20–#24 implementation | **CURRENT_ACCEPTED OUT OF SCOPE** | PROJECT_STATE, OWNER review |
| P4.6 series/privacy/attendance/stats | **CURRENT_ACCEPTED DEFERRED** | P4 traceability → P4.6 |
| Notifications Core #24 | **CURRENT_ACCEPTED OUT OF SCOPE** | task §23 |
| Generic community-service | **CURRENT_ACCEPTED REJECTED** | P4-D3 |
| Domain broker-agnostic | **CURRENT_ACCEPTED** | NON_NEGOTIABLES, ADR-0014 |

## Accepted P4.5 technical direction (implementation may proceed)

1. **Outbox → publisher adapter → RabbitMQ → consumer → Discord projection adapter**  
   Domain/application remain broker-agnostic. Existing PG outbox schema/lease/retry stays.

2. **Multi-guild publish** gated by `permission.activity.event.publish.multi_guild` (organization scope, sensitive).

3. **Security** — extend existing projection guild/channel scope + Authorization checks; no cross-org/guild mutation; forged `guildId` / unexpected channel / stale membership fail closed.

4. **Extend existing services** — `activity-service`, discord-gateway projection paths, Admin/WWW only where required. No new community/watch/notification microservices.

## OWNER_DECISION_REQUIRED

### OD-P4.5-001 — Multi-Discord participant list mode

| Field | Value |
| --- | --- |
| Question | For one activity published to multiple Discord guilds, is participation **one shared list/limit** or **separate lists per guild**? |
| Evidence | `P4_TEST_TRACEABILITY.md` row “shared/split lists”; no Accepted product paragraph choosing one |
| Options | A) Shared participant pool + shared limit · B) Separate lists/limits per guild projection |
| Recommendation | **A) Shared pool** — matches “Activity data central SoT” and simpler RSVP/waitlist invariants |
| Impact | Schema (`activity_projections` vs participation keys), RSVP UX copy, Admin repair, concurrent tests |
| Blocks | Product-visible multi-guild publish UX and RSVP semantics — **not** RabbitMQ adapter scaffolding |

## P4.5 implementation order (after plan checkpoint)

1. RabbitMQ infrastructure package + docker compose wiring (dev only; Zeabur variables doc update).
2. Outbox publisher port + RabbitMQ adapter (confirms, retry, DLQ envelope).
3. Projection consumer in discord-gateway (or dedicated worker in-gateway) with existing scope checks.
4. Multi-guild publish API + Admin intent (blocked on OD-P4.5-001 for RSVP semantics).
5. Integration tests: isolation, idempotency, consumer dedupe, restart recovery.

## Explicit non-goals (P4.5)

- P4.6, G8 #21, Dungeon LFG #20, V2 Hub Core #22, Notifications #24, Reservations, Marketplace, Music, Overlay.
