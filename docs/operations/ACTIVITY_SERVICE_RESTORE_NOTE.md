# Activity Service Restore Note

**Date:** 2026-09-04 (Europe/Warsaw)  
**Machine:** BOBER  
**Repo:** `C:\Users\mateu\OneDrive\Pulpit\NowyTematV2`  
**Scope:** read-only inventory only — no `git restore`, no force-checkout.

## Branch to cherry-pick

- **Primary:** `cursor/p4-1-activity-domain`
- **Present locally and remotely** (`origin/cursor/p4-1-activity-domain`)
- **Tip:** `84716b3` — `docs(sot): freeze 006C audit + accept D-051/D-052 character/workspace model`

### Related activity/p4 refs (also on origin)

| Branch | Remote SHA (short) |
|--------|--------------------|
| `cursor/p4-1-activity-domain` | `84716b3` |
| `cursor/p4-centrum-aktywnosci-plan-ea0a` | `0c8804a` |
| `cursor/p4-centrum-aktywnosci-spec-v2` | `c5c492c` |
| `cursor/p4-spec-post-merge-hygiene` | `c99085a` |
| `codex/activity-center-web` | `5491aa1` |

## What's in `services/activity-service/dist`

- **`src/` is MISSING** on disk. Top-level under `activity-service`: `dist/`, `node_modules/` only.
- **No OpenAPI YAML** under `activity-service` (none found outside `node_modules`).
- Compiled Nest-style layout in `dist/`: `application/`, `domain/`, `infrastructure/`, `interface/`, plus `main.js`, nested `packages/`, `services/`.

### Top controllers (from `dist/interface/`)

1. `activity.controller` (`.js` / `.d.ts` / `.js.map`)
2. `activity-admin.controller`
3. `health.controller`

Also present in interface: `app.module`, `activity.tokens`, `activity-exception.filter`, `inbound-assertion.guard`.

## Recommendation

**Wait for New Bot** — do **not** restore `src` via `git restore` / checkout while owner is away.

Rationale:

1. Compiled `dist` already contains the activity + admin + health controllers; runtime/build artifact is present.
2. Source is absent on this working tree; restoring it would be a destructive/working-tree change the owner forbade.
3. Cherry-pick candidate `cursor/p4-1-activity-domain` is safely on `origin` when New Bot / owner is ready to bring `src` back deliberately.

**Optional later (owner/New Bot only):** cherry-pick or merge `cursor/p4-1-activity-domain` to recover `src`; treat `dist` as evidence of prior successful build, not as a substitute for source control.