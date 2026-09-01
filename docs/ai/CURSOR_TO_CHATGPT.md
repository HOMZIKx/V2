# CURSOR → ChatGPT

## Status

**MODE:** Task 005 checkpoint — `ADMIN_CONTROL_CENTER_UX_V1`
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-ADMIN-CONTROL-CENTER-UX-005`
Branch: `cursor/p4-1-activity-domain`
PR: **#19** — do not merge
Tip: see `ADMIN_CONTROL_CENTER_UX_V1_SHA`

Task 006 (`PLAYER_TOOLKIT_CORE_V1`) remains at `PLAYER_TOOLKIT_CORE_V1_SHA` — deploy pending; not expanded in this handoff.

---

## Git classification (005 continuation)

| Class        | Scope                                                     | Action                                                            |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------------- |
| A — task 004 | Already in `a36718c` + activity organizer DI in `2af092f` | No uncommitted 004 product diff; separate 004 commit not required |
| B — task 005 | Admin IA in `2af092f` + E2E alignment (this checkpoint)   | E2E updated for Pulpit / settings tabs / legacy redirects         |
| C — unclear  | Migration manifest regen (activity + authorization)       | Committed as tooling sync                                         |

---

## Delivered (005)

| Gate                     | Result                               |
| ------------------------ | ------------------------------------ |
| Admin unit tests         | PASS (64/64)                         |
| Admin E2E (Playwright)   | PASS (6/6) after IA selector updates |
| `corepack pnpm validate` | see checkpoint SHA                   |
| Admin deploy TESTOWY     | see `DEPLOYED_SHA` below             |
| Live smoke gates         | see LIVE block below                 |

### Key changes (005)

- **IA:** Pulpit `/`, Discord Bot, Aktywności, System; legacy `/activity/*` redirects.
- **Pages:** Dashboard, Centrum V2 + HubPreview, Diagnostics, Event create/edit, settings tabs.
- **UX:** FormActions, unsaved-changes blocker, audit labels, product cards on Pulpit.
- **E2E:** `home.spec.ts`, `centrum-config.spec.ts` aligned with new nav and settings layout.

---

## STOP

No task 006 expansion. No merge to `main`.
