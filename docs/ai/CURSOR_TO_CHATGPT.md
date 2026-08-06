# Cursor → ChatGPT

## 1. Status

`READY_FOR_OWNER_DECISIONS`

P4 Centrum Aktywności **planning package only** on
`cursor/p4-centrum-aktywnosci-plan-ea0a`. No product/service code.
**No merge by Cursor.**

## 2. Task ID

`P4-CENTRUM-AKTYWNOSCI-001`

## 3. Branch / PR / source of truth

- Branch: `cursor/p4-centrum-aktywnosci-plan-ea0a`
- HEAD: `73686cc9c6aaaefdb994519cb9932a3463e33b9a`
- Base: `main` @ `f299775`
- Prerequisite: P3 draft PR #16 (`READY_FOR_REVIEW_P3_AUTHORIZATION_FOUNDATION`)
  must be APPROVED + merged before P4 implementation
- Issue: none yet for P4 (tracking via this PR + `PENDING_DECISIONS`; owner may open Issue)

## 4. What this package delivers

| Doc                                                  | Purpose                          |
| ---------------------------------------------------- | -------------------------------- |
| `docs/ai/P4_CENTRUM_AKTYWNOSCI_HANDOFF.md`           | Handoff, scope, gates            |
| `docs/architecture/CENTRUM_AKTYWNOSCI.md`            | Proposed service boundaries      |
| `docs/architecture/decisions/ADR-0014-…md`           | ADR **Proposed**                 |
| `docs/product/CENTRUM_AKTYWNOSCI.md`                 | Product draft                    |
| `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`              | Interaction skeleton (no assets) |
| `docs/ai/PENDING_DECISIONS.md`                       | **P4-D1…P4-D8 BLOCKED**          |
| `PROJECT_STATE` / this report / `DECISION_LOG` D-035 | State                            |

## 5. Explicitly not delivered

- `community-service` code / DB / OpenAPI
- Discord product panel / commands
- Final permission catalog, module accent, emoji, banner, copy
- Merge of P3 PR #16

## 6. Technical recommendation summary (for owner)

1. P4-D1 **B** — hub + one activity type.
2. P4-D3 **A** — new `community-service` + DB `community`.
3. P4-D4 **A** — Discord-only v1.
4. P4-D5 **A** — sync HTTP + idempotency first.
5. P4-D6 **A** — operator slash publishes one stable panel.
6. P4-D8 **A** or **B** — visual checkpoint before UI (never lab placeholders as product).

## 7. Validation

```bash
pnpm format:check   # pass
pnpm lint           # pass
pnpm typecheck      # pass
pnpm test           # pass
# pnpm validate:quick — compose config failed locally (Docker CLI absent in agent VM)
```

Docs-only; no service code/schema changes.

## 8. Questions for owner / ChatGPT

1. Close P4-D1…P4-D8 (especially first activity type and visual checkpoint path).
2. Confirm P3 PR #16 APPROVED timeline — P4 implementation must not start on
   unmerged Authz foundation.
3. Optional: open GitHub Issue „P4 Centrum Aktywności” mirroring Issue #15 style
   for decision comments.

## Last updated

2026-08-06 — Cursor (P4 planning)
