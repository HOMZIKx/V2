# Cursor → ChatGPT

## 1. Status

`READY_FOR_REAUDIT_P3_AUTHORIZATION_FOUNDATION`

P3 Authorization foundation security/correctness remediation on draft PR #16
(`cursor/p3-authorization-foundation`). Issue #15 decisions P3-D1–P3-D20 unchanged.
**No merge by Cursor. No UI. No P4 work.**

## 2. Task ID

`P3-AUTHORIZATION-FOUNDATION-001`

## 3. Branch / PR / source of truth

- Branch: `cursor/p3-authorization-foundation`
- HEAD tip: see GitHub PR #16
- Issue: #15
- PR: https://github.com/HOMZIKx/V2/pull/16 (draft)

## 4. Audit remediations (12/12)

| #   | Problem                                                        | Fix                                                                                                                                             | Files                                                                   | Confirming test                                                                                     | Result                    |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | Bootstrap ignored `AUTHORIZATION_BOOTSTRAP_DISCORD_USER_ID`    | Exact env seed match before first bootstrap; require existing Discord↔V2 link; env mismatch after bootstrap only audits `bootstrap.env_ignored` | `authorization-repository.ts`, `authorization-env.ts`, controller       | `authorization-repository.integration.spec.ts` — seed reject + idempotent no-transfer               | pass (infra)              |
| 2   | One S2S guard for all routes                                   | Per-client `allowed_operations`; `@RequireOperation`; verified `clientId` + actor claims on request                                             | `verify-inbound-assertion.ts`, `inbound-assertion.guard.ts`, controller | `inbound-assertion.guard.spec.ts`, `verify-inbound-assertion.spec.ts`                               | pass                      |
| 3   | Link reassignment + OR authorize context                       | Immutable 1:1 link; exact pair required when both IDs present; CONFLICT on mismatch                                                             | repository `upsertIdentityLink` / `resolvePrincipal`                    | integration — immutable link + mismatched pair CONFLICT                                             | pass (infra)              |
| 4   | Worst sync across guilds; guild blocks ignored on login        | Per-guild login evaluation; guild block skips that candidate; global block still denies                                                         | `decision-engine.ts`                                                    | `decision-engine.spec.ts` — fresh guild wins despite stale sibling; guild block deny                | pass                      |
| 5   | `unavailable` had no trust window; GuildDelete outage detached | Ordinary trust window for stale+unavailable; `guild_unavailable` keeps status/login; detach only on confirmed removal                           | `decision-engine.ts`, repository, `discord-js-adapter.ts`               | decision-engine unavailable trust; adapter GuildDelete test; repo unavailable keeps login_entitling | pass                      |
| 6   | Event keys used `randomUUID()`                                 | Deterministic `buildDiscordEventKey` (entity + payload hash)                                                                                    | `discord-js-adapter.ts`                                                 | `discord-js-adapter.spec.ts` — same payload same key; replay same key                               | pass                      |
| 7   | Revoke after commit; block/deny/expiry no revoke               | `pending_session_revoke` in same txn; drain+retry; block/deny/expiry enqueue                                                                    | migration `002_*`, repository, use-cases, system-revoke client          | use-cases drain/retry; integration member_remove + createBlock enqueue                              | pass                      |
| 8   | Register could set loginEntitling; activate without fresh      | Register always `pending_sync`+`login_entitling=false`; activate requires `sync_status=fresh`; separate login-entitling endpoint                | repository, controller, contracts                                       | integration activate-before-fresh fails; login-entitling separate                                   | pass (infra)              |
| 9   | Actor/specificity from body; no manage check                   | Actor from assertion claims; specificity computed; authorize manage.org/guild before mutation                                                   | controller, repository, ports `computeGrantSpecificity`                 | integration actor without permission FORBIDDEN                                                      | pass (infra)              |
| 10  | Soft-deleted roles still mapped                                | Join `discord_role_snapshot` with `deleted_at IS NULL`; clear member_role on delete                                                             | repository                                                              | integration deleted role → deny mapped permission                                                   | pass (infra)              |
| 11  | Sparse audit                                                   | Audit on bootstrap, link, register, activate, login-entitling, events, reconcile, grants, blocks, expire; `actor_client_id`                     | repository + migration `002`                                            | exercised via mutation paths / audit inserts in repository                                          | pass (code + infra paths) |
| 12  | Login deny test pre-seeded account                             | First-OAuth ordering: user → no Discord deny → linkAccount → fresh PG probe → Authz deny (no session) / allow (session)                         | `p3-identity-authz.integration.spec.ts`                                 | `First Discord OAuth login entitlement ordering`                                                    | pass (infra)              |

## 5. Validation

```bash
pnpm format:check   # pass
pnpm lint           # pass
pnpm typecheck      # pass
pnpm test / coverage / architecture:check / e2e / runtime-smoke  # pass
RUN_INFRA_TESTS=true … authorization + identity integration  # pass (local PG/Redis)
gitleaks detect --log-opts="main..HEAD"  # no leaks found
# Local `pnpm validate` compose config step fails without Docker CLI;
# CI compose + infra jobs are green on tip HEAD.
```

### Tip HEAD

`a7ced41db3e8313461138d691327378862bdc51e` (GitHub SoT; remediation code `e844402` + docs)

### Green workflows (code tip `e844402`; docs tip CI pending/following)

| Workflow                        | URL                                                                    |
| ------------------------------- | ---------------------------------------------------------------------- |
| CI (PR)                         | https://github.com/HOMZIKx/V2/actions/runs/31114236847                 |
| CI (push)                       | https://github.com/HOMZIKx/V2/actions/runs/31114230003                 |
| PR Title                        | https://github.com/HOMZIKx/V2/actions/runs/31114240124                 |
| Secret scan (PR CI job)         | https://github.com/HOMZIKx/V2/actions/runs/31114236847/job/92659769075 |
| Infrastructure integration (PR) | https://github.com/HOMZIKx/V2/actions/runs/31114236847/job/92659769387 |
| Quality gates (PR)              | https://github.com/HOMZIKx/V2/actions/runs/31114236847/job/92659769318 |

## 6. Explicitly unchanged

- P3-D1–P3-D20
- No P4 / PR #17 work
- No UI
- No merge

## Last updated

2026-08-06 — Cursor (`READY_FOR_REAUDIT_P3_AUTHORIZATION_FOUNDATION`)
