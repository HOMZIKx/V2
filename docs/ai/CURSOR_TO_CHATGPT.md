# CURSOR → ChatGPT

## Status

**MODE:** `V2-CURRENT-HEAD-STABILIZATION-006A` — checkpoint repair (no new product features)
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Branch: `cursor/p4-1-activity-domain` · PR **#19** — do not merge

## Process truth

| Task                            | Status                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **005 Admin Control Center UX** | `TASK_005_CODE_IMPLEMENTED_BUT_NOT_ACCEPTED` — code at `ADMIN_CONTROL_CENTER_UX_V1_SHA`; runtime proof blocked   |
| **006 Player Toolkit Core**     | `TASK_006_CODE_IMPLEMENTED_PREMATURELY_AND_NOT_ACCEPTED` — live deploy missing migration 003 / WWW profil routes |

Mixed implementation landed in `2af092f` before 005 Owner review. History **not** rewritten.

## Delta classification (`81e5d49` → `9306fcf`)

| Class                        | Scope                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **A — TASK_005_ADMIN**       | `apps/admin/**` (IA, events, Centrum V2, diagnostics, E2E)                           |
| **B — TASK_006_PLAYER_CORE** | identity migration 003, game accounts, WWW profil/postacie, Discord profile          |
| **C — SHARED**               | `packages/hub-core` class labels, `activity-service` app.module DI, `pnpm-lock.yaml` |
| **D — UNRELATED**            | discord-gateway debug scripts — operational only; `.tmp-*` local artifacts           |

## SHAs (immutable markers)

| Marker                                       | SHA                                        |
| -------------------------------------------- | ------------------------------------------ |
| `PLAYER_TOOLKIT_CORE_V1_SHA`                 | `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2` |
| `ADMIN_CONTROL_CENTER_UX_V1_SHA`             | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` |
| `PLAYER_TOOLKIT_INTEGRATION_REMEDIATION_SHA` | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` |

## Stabilization 006A (this pass)

| Gate                    | Result                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **CURRENT_HEAD**        | `9306fcf6c6c4c36cf65cfc3ad86fff3005a590ea` (pre-stabilization fixes; see post-push SHA)                                                |
| **INFRA_DB_ISOLATION**  | **PASS** locally on fresh Docker volume (`migration-inventory` + `db-isolation` 11/11). Prior local FAIL was stale `v2_pgdata` volume. |
| **CI (GitHub Actions)** | **UNVERIFIED** — `gh` not authenticated locally; expected PASS on `4df7a94+` after migration-inventory fix (identity 3 migrations).    |
| **VALIDATE**            | **PENDING** — rerun after doc prettier + stabilization commit                                                                          |
| **ADMIN_005_RUNTIME**   | **BLOCKED** — deployed admin SHA `8babc897` (pre-005 UX); Zeabur deploy API rejects legacy local token                                 |
| **PLAYER_006_RUNTIME**  | **BLOCKED** — deployed API `9d5fdcd` / web `510b262` lack 006 tip; no LIVE profil/postacie proof without deploy                        |

### Deployed runtime (Zeabur TESTOWY, 2026-09-02)

| Service | `/health` gitCommitSha                     | vs HEAD `9306fcf` |
| ------- | ------------------------------------------ | ----------------- |
| API     | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4` | behind            |
| Web     | `510b262206ae413b228ee546ffa93b0e931e829c` | behind            |
| Admin   | `8babc89784820c6fab9b627ce8425049abf52819` | behind            |

### Code fixes (006A additive)

- `migration-inventory.test.ts` identity **3** migrations (in `4df7a94`).
- `apps/web/playwright.config.ts` — `WEB_E2E_PORT` for validate when :3000 busy.
- `tools/scripts/zeabur-sync-and-deploy.mjs` — surface Zeabur GraphQL error text (legacy token).

## Known blockers

1. **ZEABUR_TOKEN** — local `~/.config/zeabur/cli.yaml` uses disabled legacy API key; `updateDockerfile` / `deployFromSpecification` fail with `ERROR_INVALID_TOKEN`. GitHub secret must be a **personal access token**; redeploy identity/web/admin to HEAD.
2. **CI-BILLING-001** — GitHub Actions may still be billing-limited (Owner).
3. **Runtime proof** — cannot record LIVE PASS for 005/006 until deploy succeeds.

## Owner interaction required

1. Replace Zeabur API token (Developer → Personal Access Token) in local CLI **and/or** GitHub `ZEABUR_TOKEN` secret; trigger `zeabur-deploy` workflow on branch tip.
2. **Admin OAuth** — one login click on TESTOWY admin for full 005 smoke (if no valid session).
3. **Discord session** — Member WWW `/profil` live proof needs authenticated Owner session after deploy.

## Task 004 (unchanged)

- `ADMIN_OAUTH` = **OWNER_PASS** (prior successful Owner test on old admin build)
- `DM_LIVE_SMOKE` = **OWNER_ACCEPTANCE_PENDING**

## STOP

No task 007. No Trackers/Biolog/Elixirs/EQ/Marketplace/Guild Control.
