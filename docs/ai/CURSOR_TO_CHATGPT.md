# CURSOR → ChatGPT

## Status

**MODE:** Task 005 checkpoint — `ADMIN_CONTROL_CENTER_UX_V1`
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-ADMIN-CONTROL-CENTER-UX-005`
Branch: `cursor/p4-1-activity-domain`
PR: **#19** — do not merge
`ADMIN_CONTROL_CENTER_UX_V1_SHA` = `0834a5bddd71fe1503f5f2da2494f2de7a2f5e87`
`HEAD_SHA` = `854d5d9b72f2a7fdfec22e145424f5595ed6a960`

Task 006 (`PLAYER_TOOLKIT_CORE_V1`) unchanged at `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2`.

---

## Git classification (005 continuation)

| Class        | Scope                                                | Action                                                    |
| ------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| A — task 004 | In `a36718c` + organizer DI in `2af092f`             | No uncommitted 004 diff; separate 004 commit not required |
| B — task 005 | Admin IA in `2af092f`; E2E + checkpoint in `0834a5b` | Committed                                                 |
| C — unclear  | Identity migration manifest regen                    | Included in `0834a5b` (health spec count=3)               |

---

## Delivered (005)

| Gate                            | Result                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Admin unit tests                | **PASS** (64/64)                                                               |
| Admin E2E (Playwright chromium) | **PASS** (6/6)                                                                 |
| `corepack pnpm validate`        | **FAIL** — `VERSION_DRIFT` only (tip `854d5d9` vs live admin `8babc897`)       |
| Admin deploy TESTOWY            | **FAIL** — Zeabur `updateDockerfile` / `redeployService` Internal Server Error |
| GitHub CI                       | **PENDING** — `gh` not authed locally; push should trigger `zeabur-deploy.yml` |
| Live smoke (v2-admin)           | **BLOCKED** — tip not deployed; OAuth guild session required for full gates    |

### Key changes (005)

- **IA:** Pulpit `/`, Discord Bot, Aktywności, System; legacy `/activity/*` redirects.
- **Pages:** Dashboard, Centrum V2 + HubPreview, Diagnostics, Event create/edit, settings tabs.
- **E2E:** Selectors updated for Pulpit heading and nested settings tabs.

---

## Deploy / runtime

- Live admin `/health` → `gitCommitSha=8babc89784820c6fab9b627ce8425049abf52819` (pre-005 UX bundle).
- Target tip: `854d5d9` (includes `0834a5b` checkpoint).
- Zeabur admin deploy attempts: `deployFromSpecification` ISE; `updateDockerfile failed` on retry.

---

## STOP

No task 006 expansion. No merge to `main`.
