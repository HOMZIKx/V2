# Cursor → ChatGPT

## 1. Status

`READY_FOR_FINAL_REAUDIT_AND_PHASE_CLOSE_P3`

Final P3 closure pass on draft PR #16 after `BLOCKING_FINAL_P3_CLOSURE_PASS`.
Issue #15 decisions P3-D1–P3-D20 unchanged. **No merge by Cursor. No UI. No P4.**

## 2. Task ID

`P3-AUTHORIZATION-FOUNDATION-001`

## 3. Branch / PR / source of truth

- Branch: `cursor/p3-authorization-foundation`
- HEAD tip: see GitHub PR #16
- Issue: #15
- PR: https://github.com/HOMZIKx/V2/pull/16 (draft)
- Phase matrix: `docs/ai/PHASE_COMPLETION_AUDIT.md`
- P4 / PR #17: **frozen**

## 4. Final closure remediations (7/7)

| # | Problem | Fix | Files | Confirming test | Result |
| - | ------- | --- | ----- | --------------- | ------ |
| 1 | Identity-only keys collided across lifecycle cycles | Gateway `GuildLifecycleEpochStore`; remove/unavailable/detach keys include epoch; bump on rejoin/reconcile/reconnect | `guild-lifecycle-epoch.ts`, `discord-js-adapter.ts` | leave→rejoin→leave; unavailable→reconcile→unavailable; detach→reconnect→detach | pass |
| 2 | Durable revoke had no autonomous retry | `AuthorizationMaintenanceWorker` startup+interval; `claimPendingSessionRevokes` with `FOR UPDATE SKIP LOCKED` + lease; backoff; graceful shutdown | migration `003_*`, worker, use-cases, repository | worker.spec + use-cases maintenance tick + lease claim integration | pass |
| 3 | Expiry only via manual endpoint | Same worker runs `processExpiredPolicies` periodically and on startup | worker + `runMaintenanceTick` | worker.spec automatic tick without Discord/policy event | pass |
| 4 | No-escalation checked only manage.* | Expand group permissions; actor must hold each granted permission; local manager cannot grant org scope | repository `requireActorCanGrantPermissions` | integration direct + group escalation FORBIDDEN | pass (infra) |
| 5 | Gateway could inject `v2UserId` | Removed from Gateway port + Authz member schema (`.strict()`); membership binds V2 from `discord_identity_link` only | sync port, controller, `upsertMember` | gateway-member-contract.spec + integration link bind | pass |
| 6 | Revoke not based on real WWW login allow→deny | Authoritative `permission.platform.login.www` before/after; revoke only on loss; non-login deny and sibling-guild block do not logout; deny/block expiry no revoke | repository entitlement helpers | integration non-login deny, multi-guild block, deny expiry | pass (infra) |
| 7 | Missing revoke delivery audit | `revoke.enqueued` / `revoke.attempt_failed` / `revoke.delivered` / `revoke.failed_terminal` with user, correlation, source, attempt, outcome, actor | repository mark/enqueue | integration audit lifecycle | pass (infra) |

Prior 12-point security remediation remains in force (see earlier PR comments / git history).

## 5. Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate   # full suite once at end
gitleaks detect --log-opts=main..HEAD
```

CI URLs and final HEAD filled after green tip push.

## 6. Explicitly unchanged / frozen

- P3-D1–P3-D20
- No P4 / PR #17 implementation
- No UI
- No merge by Cursor

## 7. Conscious backlog (not foundation defects)

See `PHASE_COMPLETION_AUDIT.md` — RabbitMQ/outbox, effective cache, Authz UI,
product permission names, Zeabur, P4.

## Last updated

2026-08-06 — Cursor (`READY_FOR_FINAL_REAUDIT_AND_PHASE_CLOSE_P3`)
