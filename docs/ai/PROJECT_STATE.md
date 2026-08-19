# PROJECT_STATE

## Status

`BLOCKED_OWNER_ACTION` — corrective task `P4-0-CLOSURE-CORRECTIVE-002` prepared locally;
**not pushed** (Issue #25: repo still **PUBLIC**).

Not APPROVED. Not merged. No P4.5 / P4.6 implementation.

## Blockers (owner action required)

| Blocker                     | Reason                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| **REPOSITORY_STILL_PUBLIC** | `HOMZIKx/V2` visibility = `public` (GitHub API 2026-08-19). Issue #25 requires **PRIVATE**.              |
| **PUSH_DEFERRED**           | Security precondition forbids pushing corrective commits to a public repo.                               |
| **ZEABUR_STALE**            | Live `v2-api.zeabur.app` reports `gitCommitSha: 7f9e15e` (not corrective HEAD).                          |
| **ACTIVITY_DISABLED_LIVE**  | `/health/ready` → `"activity":"disabled"` — technical Activity smoke blocked until Owner enables config. |

## Immutable checkpoints

| Marker                    | SHA                                        | Notes                             |
| ------------------------- | ------------------------------------------ | --------------------------------- |
| FIXUP_START_SHA           | `1290df92681ee1e98fde3e0efaf231f7d110f6db` | P4-COMBINED-AUDIT-FIXUP-001 start |
| FIXUP_CHECKPOINT_SHA      | `7f9e15e8020305db5e1b5bd3fb8f00532412a2c8` | Six audit findings (live Zeabur)  |
| HUB_ASSETS_SHA            | `63ed51e303c2b42e6e17e6ca9dce3ff903f6873d` | Owner Activity Hub icons          |
| P4_0_AUDIT_CHECKPOINT_SHA | `0bdb254b4d6c0a84463a6331f2d830f642cbeeea` |
| P4_5_PLAN_CHECKPOINT_SHA  | `0bdb254b4d6c0a84463a6331f2d830f642cbeeea` |
| P4_0_CORRECTIVE_FIXUP_SHA | `59172be2f10fce4e891480dc25a61810fe4ee3f5` | not pushed (repo PUBLIC) |

## Current task

`P4-0-CLOSURE-CORRECTIVE-002`

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- Remote HEAD: `46744013a133f537c90c24d24b58f2abc83f8292`
- Local corrective HEAD: `59172be2f10fce4e891480dc25a61810fe4ee3f5` (1 commit ahead of origin; not pushed)

## CI (remote HEAD 4674401)

- Run `32283423808` — **FAIL** (Quality Gates / `format:check` on 3 docs files)
- Corrective fix: Prettier applied locally; green CI pending push after repo → PRIVATE

## Six combined-audit findings — verified CLOSED (code)

| #   | Finding                           | Status                                                          |
| --- | --------------------------------- | --------------------------------------------------------------- |
| A   | WWW OAuth production loopback     | CLOSED                                                          |
| B   | API real readiness                | CLOSED                                                          |
| C   | Admin real Discord diagnostics    | CLOSED                                                          |
| D   | Admin production runtime          | CLOSED                                                          |
| E   | Projection guild/channel boundary | CLOSED                                                          |
| F   | SoT Issue #26                     | CLOSED — Owner UX deferred to Core Foundation Integrated Review |

## OD-P4.5-001 — REMOVED (false blocker)

Accepted product §10 Multi-Discord: **BOTH MODES ARE ACCEPTED** (SHARED + SEPARATE per activity).
See `docs/ai/P4_5_SCOPE_LOCK.md`. Not an Owner decision gate.

## Hub attachments — corrective additions

- `editComponentsV2Message`: `attachments: []` when replacing files (discord.js semantics)
- Regression: `activity-hub-attachment-lifecycle.spec.ts` (3× reconcile/edit, 5 files invariant)

## Local validation (corrective workspace, NODE_ENV=test)

- `pnpm format:check` — PASS
- `pnpm validate` — PASS (full suite)
- Docker image verify — BLOCKED_EXTERNAL (no local daemon)

## Live Zeabur (2026-08-19)

- api `/health/live` + `/health/ready` — OK on `7f9e15e`
- activity ready check — **disabled**
- Hub icons + 3× reconcile live — **NOT VERIFIED** (stale discord-gateway deploy)

## Explicit gates

- **NO MERGE**
- Issues #20–#24 **NOT IMPLEMENTED**
- P4.6 **NOT STARTED**

## OPEN_CRITICAL / OPEN_HIGH

- OPEN_CRITICAL: **0**
- OPEN_HIGH: **0**

## OWNER_DECISIONS_REQUIRED

- **Issue #25** — set repository visibility to **PRIVATE** before push/deploy
- **Activity config** — enable Activity technical smoke on Zeabur (ACTIVITY_ENABLED path)
- Zeabur redeploy same SHA 7/7 after repo private + CI green

## Last updated

2026-08-19 — P4-0-CLOSURE-CORRECTIVE-002 (local; push blocked)
