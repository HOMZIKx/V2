# Phase completion audit — P0–P3

Source of truth for closing foundation phases before any P4 work.
P4 / PR #17 remains **frozen** until PR #16 is merged by the owner.

| Etap | Zadanie / PR | Merged commit (main) | Rezultat | Testy / dowód | Świadomie odłożone |
| ---- | ------------ | -------------------- | -------- | ------------- | ------------------ |
| **P0** | Monorepo bootstrap — PR #3 | `877c680` | `COMPLETED` | Nx/pnpm, architecture boundaries, CI quality gates | Zeabur deploy (DEC-001), product UI |
| **P1** | Discord test harness — PR #9 (plan PR #8) | `c82d6bd` | `COMPLETED_WITH_DEFERRED_ITEMS` | Live guild panel, Components V2, unit/integration/smoke | Production bot permissions (DEC-002 override), Zeabur |
| **P2** | Identity foundation — plan PR #10; proof PR #11; Internal JWT PR #14 | `15586ac`, `f299775` | `COMPLETED_WITH_DEFERRED_ITEMS` | Better Auth Discord OAuth, opaque session, system revoke, Internal JWT, infra PG/Redis | Admin MFA (D-018), multi-provider active OAuth beyond Discord, Zeabur |
| **P3** | Authorization foundation — Issue #15, draft PR #16 | *pending owner merge* | `COMPLETED_WITH_DEFERRED_ITEMS` (code on PR tip; awaiting final re-audit) | Unit + infra Authz; Identity first-OAuth gate; Gateway lifecycle keys; maintenance worker; revoke lease/audit | RabbitMQ/outbox, effective-access cache, Admin/Discord/WWW Authz UI, product permission names, owner transfer, Centrum Aktywności |

## Foundations vs deferred product

**Completed foundations (must hold after merge):**

- Service boundaries and DB isolation (P0)
- Discord Gateway harness + guild isolation (P1)
- Identity V2 User, Discord link, session, Internal JWT, system revoke (P2)
- Authorization decisions, login gate, Discord sync, durable session revoke, S2S allowlist, no-escalation, audit (P3)

**Conscious backlog (not foundation defects):**

- Zeabur full-stack deploy
- RabbitMQ Streams / outbox for Authz events
- Effective-access cache
- Admin / Discord / WWW authorization UIs
- Final product permission / group names
- Owner transfer UX
- P4 Centrum Aktywności (PR #17 frozen)

## Next allowed stage

After owner merge of PR #16 and `APPROVED` phase close: **P4 Centrum Aktywności**
(planning already in frozen PR #17 — do not implement until unfrozen).

## Last updated

2026-08-06 — Cursor
