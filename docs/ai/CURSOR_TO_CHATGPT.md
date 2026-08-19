# Cursor → ChatGPT handoff

## Continuous handoff snapshot

| Field                               | Value                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| **CURRENT_TASK**                    | `P4-0-CLOSURE-CORRECTIVE-002`                                                       |
| **FINAL_HEAD_SHA**                  | `59172be2f10fce4e891480dc25a61810fe4ee3f5` (local only; remote `4674401`)           |
| **CI_RUN_ID**                       | `32283423808` (remote HEAD 4674401)                                                 |
| **CI_RESULT**                       | **FAIL** — `format:check` on docs; fixed locally, not pushed                        |
| **REPOSITORY_VISIBILITY**           | **PUBLIC** — Issue #25 blocker                                                      |
| **ZEABUR_REVISION_7_OF_7**          | **STALE** — live api `7f9e15e`; 7/7 same-SHA not verified                           |
| **ACTIVITY_SMOKE_RESULT**           | **BLOCKED** — live `"activity":"disabled"`                                          |
| **HUB_ATTACHMENT_RECONCILE_RESULT** | **LOCAL PASS** — adapter `attachments:[]` + lifecycle spec; live not verified       |
| **OPEN_CRITICAL**                   | 0                                                                                   |
| **OPEN_HIGH**                       | 0                                                                                   |
| **OWNER_DECISIONS_REQUIRED**        | Issue #25 PRIVATE repo; Activity enable on Zeabur; Zeabur auth for deploy           |

---

## FINAL STATUS

**BLOCKED_OWNER_ACTION**

Reasons:

1. `REPOSITORY_STILL_PUBLIC` (Issue #25)
2. Push/deploy forbidden until repo is PRIVATE
3. Zeabur still on `7f9e15e`, not corrective SHA
4. Activity technical smoke blocked (`activity: disabled` on live ready)

NO MERGE · NO P4.5 · NO P4.6 · Issues #20–#24 NOT IMPLEMENTED

---

## Corrective changes (local, not pushed)

### 1. CI format fix

Prettier applied to:

- `docs/ai/CURSOR_TO_CHATGPT.md`
- `docs/ai/P4_5_SCOPE_LOCK.md`
- `docs/ai/PROJECT_STATE.md`

### 2. OD-P4.5-001 removed (false blocker)

Accepted `docs/product/CENTRUM_AKTYWNOSCI.md` §10 Multi-Discord:

**BOTH MODES ARE ACCEPTED** — SHARED or SEPARATE participant lists per activity publication;
not a global Owner decision.

Removed from `PENDING_DECISIONS.md`, `PROJECT_STATE.md`, `P4_5_SCOPE_LOCK.md`.

### 3. Hub attachment reconcile safety

- `discord-js-adapter.ts`: on edit with replacement `files`, pass `attachments: []` per discord.js
  MessageEditOptions (prevents cumulative duplicates on repeated reconcile/edit).
- New test: `activity-hub-attachment-lifecycle.spec.ts` — publish + 3× reconcile/edit cycles,
  exactly 5 attachments each call, signed Secondary buttons unchanged.

### 4. SoT drift cleanup

- `OWNER_P4_1_TO_P4_4_REVIEW.md` — Issue #26 Owner UX still deferred
- `P4_5_SCOPE_LOCK.md` — status `PLAN_LOCKED`, no false OWNER gate

---

## Security regression (code review — unchanged)

| Check                                           | Result                                 |
| ----------------------------------------------- | -------------------------------------- |
| A. WWW OAuth no production loopback             | PASS (code)                            |
| B. API real readiness probes                    | PASS (code)                            |
| C. Admin Discord diagnostics from gateway state | PASS (code)                            |
| D. Admin no vite preview in production          | PASS (Dockerfile.admin + serve-static) |
| E. Projection guild/channel fail-closed         | PASS (code)                            |
| F. Issue #26 manual Owner UX deferred           | PASS (SoT)                             |

---

## Local validation (NODE_ENV=test)

```text
pnpm format:check          PASS
pnpm lint                  PASS
pnpm typecheck             PASS
pnpm test                  PASS
pnpm test:coverage         PASS (via validate)
pnpm architecture:check    PASS
pnpm runtime:doctor        PASS
pnpm build                 PASS
pnpm test:e2e              PASS
pnpm test:runtime-smoke    PASS
pnpm audit --audit-level=high  PASS (0 high)
pnpm validate              PASS
```

Docker daemon unavailable — compose config only.

---

## Live proof (Zeabur, stale SHA 7f9e15e)

| Endpoint                         | Result                                        |
| -------------------------------- | --------------------------------------------- |
| `v2-api.zeabur.app/health/live`  | OK                                            |
| `v2-api.zeabur.app/health/ready` | OK; activity **disabled**                     |
| `v2-web.zeabur.app/logowanie`    | 200                                           |
| Hub 5 icons + 3× reconcile       | NOT VERIFIED (discord-gateway not redeployed) |
| OAuth redirect no loopback       | NOT RE-VERIFIED on stale deploy               |

---

## Owner next steps

1. Set `HOMZIKx/V2` visibility → **PRIVATE** (Issue #25)
2. Push corrective commit; wait CI green (Quality Gates, Secret Scan, Infra Integration)
3. Redeploy same final SHA to Zeabur 7/7
4. Enable Activity config for technical smoke
5. Re-run Hub live + 3× reconcile proof
6. ChatGPT final delta audit

---

## Out of scope (respected)

No merge. No P4.5/P4.6 implementation. No #20–#24. Additive commits only when pushed.
