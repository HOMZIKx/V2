# CURSOR → ChatGPT

## Status

**MODE:** `V2-CURRENT-HEAD-STABILIZATION-006A` — local/CI gates closed; **runtime deploy still blocked**
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Branch: `cursor/p4-1-activity-domain` · PR **#19** — do not merge

## Process truth

| Task                            | Status                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **005 Admin Control Center UX** | `TASK_005_CODE_IMPLEMENTED_BUT_NOT_ACCEPTED` — code at `ADMIN_CONTROL_CENTER_UX_V1_SHA`; live deploy behind tip |
| **006 Player Toolkit Core**     | `TASK_006_CODE_IMPLEMENTED_PREMATURELY_AND_NOT_ACCEPTED` — live deploy missing tip (migration 003 / profil)     |

Mixed implementation landed in `2af092f` before 005 Owner review. History **not** rewritten.

## Delta classification (`81e5d49` → tip)

| Class                        | Scope                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **A — TASK_005_ADMIN**       | `apps/admin/**` (IA, events, Centrum V2, diagnostics, E2E)                           |
| **B — TASK_006_PLAYER_CORE** | identity migration 003, game accounts, WWW profil/postacie, Discord profile          |
| **C — SHARED**               | `packages/hub-core` class labels, `activity-service` app.module DI, `pnpm-lock.yaml` |
| **D — UNRELATED**            | discord-gateway debug scripts — operational only; `.tmp-*` local artifacts           |

## SHAs (immutable markers)

| Marker                                       | SHA                                        |
| -------------------------------------------- | ------------------------------------------ |
| `PLAYER_TOOLKIT_CORE_V1_SHA` (006)           | `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2` |
| `ADMIN_CONTROL_CENTER_UX_V1_SHA` (005)       | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` |
| `PLAYER_TOOLKIT_INTEGRATION_REMEDIATION_SHA` | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` |
| `CURRENT_HEAD_STABILIZATION_006A_SHA`        | `8a6afd6015d93466871801fa5c03a96080820277` |
| `CURRENT_HEAD`                               | `8905a613ee30c22332470dc9dc7eee0aec14bd84` |

## Stabilization 006A results

| Gate                    | Result                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **CURRENT_HEAD**        | `8905a613ee30c22332470dc9dc7eee0aec14bd84` (marker code SHA `8a6afd6`)                                                                          |
| **INFRA_DB_ISOLATION**  | **PASS** locally on fresh Docker volume (`migration-inventory` + `db-isolation` 11/11). Prior local FAIL = stale `v2_pgdata`, not architecture. |
| **CI (GitHub Actions)** | **UNVERIFIED locally** — `gh` not authenticated. Infra root cause (migration inventory drift) fixed in `4df7a94`.                               |
| **VALIDATE**            | **PASS** — `corepack pnpm validate` (`WEB_E2E_PORT=3010`); Admin E2E 6/6; Member WWW E2E 14/14                                                  |
| **ADMIN_005_RUNTIME**   | **BLOCKED** — deployed admin SHA still pre-005; Zeabur API rejects legacy local token                                                           |
| **PLAYER_006_RUNTIME**  | **BLOCKED** — deployed API/web behind tip; no LIVE profil/postacie proof without deploy                                                         |

### Deployed runtime (Zeabur TESTOWY)

| Service | `/health` gitCommitSha                     | vs tip |
| ------- | ------------------------------------------ | ------ |
| API     | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4` | behind |
| Web     | `510b262206ae413b228ee546ffa93b0e931e829c` | behind |
| Admin   | `8babc89784820c6fab9b627ce8425049abf52819` | behind |

### Code fixes (006A additive)

- CI infra: identity migration inventory expects **3** migrations (`4df7a94`).
- Web E2E: `WEB_E2E_PORT` + unrouted `E2E_API_BASE_URL` so middleware fails open and Playwright mocks work when local API occupies :4000.
- Identity: fix `player-game-account.integration.spec.ts` migrations path (`../../../migrations`).
- Zeabur deploy script: surface GraphQL `ERROR_INVALID_TOKEN` message.
- Docs: truthful checkpoint status (no implied runtime closure).

## Known blockers

1. **ZEABUR_TOKEN** — local CLI token is a disabled legacy API key (`ERROR_INVALID_TOKEN`). Need Personal Access Token + redeploy identity/web/admin/api to tip.
2. **CI visibility** — `gh auth login` (or `GH_TOKEN`) required to confirm Actions on tip.
3. **Runtime proof** — cannot record LIVE PASS for 005/006 until tip is deployed.

## Owner interaction required

1. Replace Zeabur token (Developer → Personal Access Token) in local CLI **and** GitHub `ZEABUR_TOKEN`; trigger deploy of tip.
2. After deploy: **Admin OAuth** one login click for full 005 smoke (if no session).
3. After deploy: **Discord session** for Member WWW `/profil` live 006 proof.

## Task 004 (unchanged)

- `ADMIN_OAUTH` = **OWNER_PASS** (prior Owner test on old admin build)
- `DM_LIVE_SMOKE` = **OWNER_ACCEPTANCE_PENDING**

## STOP

No task 007. No Trackers/Biolog/Elixirs/EQ/Marketplace/Guild Control.
