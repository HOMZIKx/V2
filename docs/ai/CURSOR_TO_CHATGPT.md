# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`IMPLEMENTED_PENDING_CHATGPT_AUDIT`**

Task: `V2-DUNGEON-LFG-V1-OWNER-ACCEPTED-IMPLEMENTATION-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19  
Base audit: `POST_OVERBUILD_TECHNICAL_AUDIT_SHA` (`25552dc…`)  
Checkpoint: `DUNGEON_LFG_V1_IMPLEMENTATION_SHA` — `976b89cf4740ef9b3948dd83a82e32659e4eeb07`

## Owner authorization

Issue #20 Owner-delegated discovery closure (2026-08-22):

**DISCOVERY STATUS: CLOSED FOR DUNGEON LFG v1. IMPLEMENTATION AUTHORIZED.**

Reservations and Marketplace remain **OWNER_DISCOVERY_REQUIRED** — not expanded.

## What was implemented

### Product flows

1. **Hub → Aktywności → Szukam ekipy** — mobile-first ephemeral wizard (dungeon → character/quick change → session roles → time presets → top matches → Join/View → Znajdź mi ekipę → create with similar-group warning).
2. **Moje poszukiwania** — pause/resume/cancel/edit window; pause preserves config.
3. **Persistent intent** — durable watch with TTL from window, overlap dedupe, fulfill-on-join.
4. **Dynamic matching** — Activity lifecycle hooks → `triggerLfgMatchingForActivity` → `rankLfgMatch` → DISCOVERY notifications (DM-first, Inbox fallback).
5. **Join atomic** — server revalidates capacity, role need, privacy, membership, stale interaction handling.
6. **Nie teraz / mute / coalesce** — fingerprint suppression; discovery mute does not block transactional.
7. **Full group reopen** — watch when 8/8 → slot opens.
8. **WWW** — `/szukam-ekipy` search, intents, join/view.
9. **Admin** — optional composition templates per activity type (not hardcoded in renderer).

### Technical fixes (prior audit HIGH)

| ID   | Item                                   | Status        |
| ---- | -------------------------------------- | ------------- |
| H-08 | `countParticipationsByPartyRole` stub  | **Fixed**     |
| H-09 | `notifyLfgIntentsForActivity` unwired  | **Fixed**     |

### Key files

| Area              | Path |
| ----------------- | ---- |
| Migration         | `services/activity-service/migrations/017_lfg_v1.sql` |
| LFG use cases     | `services/activity-service/src/application/use-cases/lfg.use-cases.ts` |
| LFG tests         | `services/activity-service/src/application/use-cases/lfg.use-cases.spec.ts` |
| Hub core          | `packages/hub-core/src/lfg-v1.ts` |
| Discord wizard    | `apps/discord-gateway/src/presentation/discord/lfg-hub-ephemeral.ts` |
| WWW               | `apps/web/src/components/LfgPage.tsx`, `apps/web/src/lib/lfg-api.ts` |
| Admin templates   | `apps/admin/src/pages/LfgCompositionPage.tsx` |

## Validation

| Check           | Result |
| --------------- | ------ |
| LOCAL_VALIDATE  | **PASS** — `corepack pnpm validate` 2026-08-22 |
| CI_STATUS       | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## Explicitly out of scope (do not expand)

- Team-space / post-match party thread UX
- Reservations product (#26 gate)
- Marketplace product (#28 gate)
- Stage 8+

## Audit request

Please audit LFG v1 against Issue #20 closure comment and task DoD §1–29:

- Privacy negative paths (private/cross-guild/cross-org)
- Concurrent last-slot join
- Stale DM interaction
- Notification dedupe/coalesce
- Intent overlap concurrency
- WWW/Discord parity gaps
- Any remaining stubs or unwired lifecycle paths

Report: create/update `docs/ai/DUNGEON_LFG_V1_IMPLEMENTATION_AUDIT.md`.

## Ledger

| Marker                               | SHA        |
| ------------------------------------ | ---------- |
| `POST_OVERBUILD_TECHNICAL_AUDIT_SHA` | `25552dc…` |
| `DUNGEON_LFG_V1_IMPLEMENTATION_SHA`| `976b89c…` |

## STOP

Not READY for merge. LFG pending ChatGPT audit. No Stage 6/7 expansion.
