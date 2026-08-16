# Phase completion audit — P0–P3

Source of truth for foundation phase close. **P0–P3 are completed.**
P3 merged via PR #16 → `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e`.
Issue #15 closed. Old planning PR #17 closed (superseded).

| Etap   | Zadanie / PR                                                         | Merged commit (main) | Rezultat                        | Testy / dowód                                                                                                 | Świadomie odłożone                                                                                            |
| ------ | -------------------------------------------------------------------- | -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **P0** | Monorepo bootstrap — PR #3                                           | `877c680`            | `COMPLETED`                     | Nx/pnpm, architecture boundaries, CI quality gates                                                            | Zeabur deploy (DEC-001), product UI                                                                           |
| **P1** | Discord test harness — PR #9 (plan PR #8)                            | `c82d6bd`            | `COMPLETED_WITH_DEFERRED_ITEMS` | Live guild panel, Components V2, unit/integration/smoke                                                       | Production bot permissions (DEC-002 override), Zeabur                                                         |
| **P2** | Identity foundation — plan PR #10; proof PR #11; Internal JWT PR #14 | `15586ac`, `f299775` | `COMPLETED_WITH_DEFERRED_ITEMS` | Better Auth Discord OAuth, opaque session, system revoke, Internal JWT, infra PG/Redis                        | Admin MFA (D-018), multi-provider active OAuth beyond Discord, Zeabur                                         |
| **P3** | Authorization foundation — Issue #15, PR #16                         | `1f23635`            | `COMPLETED_WITH_DEFERRED_ITEMS` | Unit + infra Authz; Identity first-OAuth gate; Gateway lifecycle keys; maintenance worker; revoke lease/audit | RabbitMQ/outbox, effective-access cache, Admin/Discord/WWW Authz UI, product permission names, owner transfer |

## Foundations vs deferred product

**Completed foundations:**

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
- P4 Centrum Aktywności **specification** — PR #18 **merged** (`8c1b095`);
  owner `FINAL_P4_SPEC_AUDIT_APPROVED`. Implementation waits for
  `READY_FOR_CURSOR` (P4.1). Old PR #17 superseded.

## Next allowed stage

**P4.1** — `activity-service` domain, data, contracts, outbox core
(no Discord UI) after ChatGPT brief `READY_FOR_CURSOR`.
No P4 product code until that brief.

## Last updated

2026-08-16 — Cursor (post-merge P4 spec status)
