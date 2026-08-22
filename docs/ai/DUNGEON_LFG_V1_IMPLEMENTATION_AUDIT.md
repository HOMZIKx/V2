# Dungeon LFG v1 — Implementation Audit (Cursor pre-ChatGPT)

Task: `V2-DUNGEON-LFG-V1-OWNER-ACCEPTED-IMPLEMENTATION-001`  
Audit range: `POST_OVERBUILD_TECHNICAL_AUDIT_SHA` (`25552dc…`) → `DUNGEON_LFG_V1_IMPLEMENTATION_SHA` (`976b89c…`)  
Product status: **`IMPLEMENTED_PENDING_CHATGPT_AUDIT`**

Owner authorization: Issue #20 discovery closure 2026-08-22 — **IMPLEMENTATION AUTHORIZED**.

---

## Summary

Dungeon LFG v1 replaces the post-board pattern with matching-first discovery, persistent intents,
dynamic lifecycle-driven notifications, and atomic join. Prior audit items **H-08** and **H-09**
are addressed. Local `corepack pnpm validate` **PASS** on implementation tip.

| Area                         | Status v1 implementation                          |
| ---------------------------- | ------------------------------------------------- |
| Hub ephemeral wizard         | Implemented                                       |
| Persistent intent            | Implemented                                       |
| Dynamic matching             | Implemented (lifecycle hooks)                     |
| DISCOVERY notifications      | Implemented (DM-first, coalesce, Nie teraz, mute) |
| Atomic join                  | Implemented                                       |
| WWW parity                   | Baseline implemented                              |
| Admin composition templates  | Implemented                                       |
| Team-space post-match        | **Not implemented** (Owner decision required)     |
| Reservations / Marketplace   | **Not touched** (Owner discovery required)        |

---

## DoD mapping (task §1–29)

| Requirement                              | Evidence                                                                 | Gap / note                                      |
| ---------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| Match-first flow                         | `lfg.use-cases.ts` search + similar groups; Discord `lfg-hub-ephemeral` | E2E Discord flow not in CI                      |
| Skip redundant character step            | Wizard uses default character + quick change                             | Manual mobile verify recommended                |
| Time presets + custom window             | Hub presets + `deriveIntentExpiresAt` in hub-core                        | —                                               |
| Top 3 + Pokaż więcej                     | Search limits + Discord pagination                                       | —                                               |
| Atomic join                              | `joinLfgActivity` revalidation                                           | Concurrent last-slot integration test **open**  |
| Persistent intent + overlap guard        | DB + use-case guard                                                      | Concurrency integration test **open**           |
| Moje poszukiwania controls               | Hub button + WWW page + pause/resume/cancel API                          | —                                               |
| Dynamic matching on lifecycle            | `triggerLfgMatchingForActivity` wired                                  | Reconcile safety net exists elsewhere           |
| H-08 role accounting                     | `countParticipationsByPartyRole` SQL                                     | Multi-role edge cases: unit tests partial       |
| H-09 notify wiring                       | Lifecycle hooks + `notifyLfgIntentsForActivity`                          | —                                               |
| DISCOVERY notification UX                | notification-core enqueue + fingerprint                                  | DM 429 retry covered in prior audit             |
| Nie teraz / mute / coalesce              | suppression table + preference checks                                    | Burst coalesce: unit coverage partial           |
| Full group reopen watch                  | full-group watch migration + handlers                                    | Integration test **open**                       |
| Similar group warning before create      | `findSimilarGroups` in use cases                                           | —                                               |
| Privacy                                  | `canViewPrivateActivity` filter + negative unit test                       | Cross-guild/org integration negatives **open**  |
| Organizer handoff                        | Activity domain existing + LFG does not auto-kick                        | Explicit claim flow: Activity P4 scope          |
| IN_PROGRESS discovery gate               | LFG list filters lifecycle                                               | Verify against all lifecycle transitions        |
| WWW parity                               | `/szukam-ekipy`                                                          | Polish/mobile pass manual                       |
| Admin templates                          | `LfgCompositionPage` + API                                               | —                                               |
| Security (IDOR, replay, rate limit)      | guild authz wrappers + signed Discord IDs                                | Dedicated adversarial suite **partial**         |
| Auto sync                                | Existing outbox projection invariant                                     | No manual sync required for LFG state           |

---

## Tests (explicit §29 checklist)

| Scenario                              | Covered                                                    |
| ------------------------------------- | ---------------------------------------------------------- |
| existing match first                  | **YES** — `lfg.use-cases.spec.ts`                          |
| no match → intent                     | **YES** — create intent test                               |
| duplicate overlapping intent          | **YES** — reject overlap test                              |
| expired intent                        | **PARTIAL** — TTL in hub-core; expiry integration **open** |
| paused / resumed intent               | **PARTIAL** — API exists; dedicated test **open**          |
| private activity hidden               | **YES** — unit negative                                    |
| cross-guild / cross-org hidden        | **OPEN** — integration                                     |
| membership / permission lost          | **OPEN** — integration                                     |
| character role mismatch               | **PARTIAL** — join path logic                              |
| role need filled / slot reopened      | **PARTIAL** — countParticipations test                     |
| cancelled / ended removed             | **OPEN** — integration                                     |
| time changed                          | **OPEN** — integration                                     |
| stale DM click                        | **OPEN** — Discord handler spec partial                      |
| concurrent last slot                  | **OPEN** — integration                                     |
| Nie teraz suppression                 | **YES** — suppression test                                 |
| meaningful change re-notify           | **PARTIAL** — fingerprint tests in hub-core                |
| mute discovery / transactional survives | **PARTIAL** — notification-core prior tests                |
| DM blocked → Inbox                    | **PARTIAL** — prior notification audit                     |
| several matches coalesced             | **PARTIAL** — notify wiring test                           |
| successful join closes matching intent  | **OPEN** — integration                                     |

---

## Known open items (non-blocking for checkpoint)

1. **Team-space UX** — explicitly Owner decision required; not in v1.
2. **Integration/E2E** — many §29 scenarios need docker integration suite expansion.
3. **Organizer handoff claim flow** — relies on Activity P4; LFG adds no separate escalation.
4. **Rate limit tuning** — baseline guards; Owner/ChatGPT may adjust constants.
5. **Zeabur deploy** — billing blocker; live runtime not updated.

---

## CRITICAL / HIGH from prior audit

| ID   | Item                         | Status in LFG v1                          |
| ---- | ---------------------------- | ----------------------------------------- |
| C-01 | Private activity leak in LFG | **Fixed** (prior audit) + retained         |
| H-08 | Party role count stub        | **Fixed** — real SQL in repository         |
| H-09 | Notify unwired               | **Fixed** — lifecycle hooks               |

No new CRITICAL findings identified in Cursor pre-audit.

---

## Validation

```
corepack pnpm validate — PASS (2026-08-22, LFG implementation tip)
CI_STATUS — BLOCKED_GITHUB_BILLING_SPENDING_LIMIT
```

---

## Recommendation for ChatGPT audit

1. Verify privacy/integration negatives with docker suite.
2. Add or require integration tests for concurrent join and intent overlap.
3. Confirm Discord signed-ID replay/stale interaction handling under adversarial cases.
4. Decide whether v1 meets **Accepted Stage 5** or needs polish pass before ACCEPTED.
5. Keep Reservations/Marketplace gated.

---

## Checkpoint

| Marker                               | SHA     |
| ------------------------------------ | ------- |
| `DUNGEON_LFG_V1_IMPLEMENTATION_SHA` | `976b89cf4740ef9b3948dd83a82e32659e4eeb07` |
