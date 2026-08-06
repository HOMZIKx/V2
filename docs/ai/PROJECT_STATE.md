# PROJECT_STATE

## Status

`READY_FOR_FINAL_P4_SPEC_AUDIT`

## Active phase

P4 Centrum Aktywności — **końcowy audyt specyfikacji** (docs only).
P0–P3 zakończone. Implementacja P4 jeszcze się nie rozpoczęła.

## Active task

- Task ID: `P4-SPEC-TRANSPLANT-AFTER-P3-001`
- Branch: `cursor/p4-centrum-aktywnosci-spec-v2` (fresh from `origin/main`)
- Base: `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e` (PR #16 merge)
- Source local commits (preserved history):
  - `15cfebe` — complete P4 product/architecture/UX spec
  - `0992693` — Discord Components V2 interactive layout contract
- Issue #15: **closed**
- Old PR #17: **closed (superseded)** — do not reopen

## Current objective

Owner/ChatGPT final audit of P4 specification → marker
`READY_FOR_FINAL_P4_SPEC_AUDIT`. Next stage after approval: **P4.1**
(domain/contracts only — not started).

## In scope now

- Product / architecture / UX / traceability docs for Centrum Aktywności
- Discord Components V2 interactive layout contract
- Mapping P4-D1–P4-D8 / open tech decisions

## Out of scope now

- Kod community-service / migracje / endpointy / Discord / WWW / Admin UI
- Final assets (Issue #12 / P4-D8)
- Zmiany GitHub Actions
- Merge by Cursor

## Decisions in force

- P0–P3 COMPLETED (PR #16 merged @ `1f23635`)
- Product A–S OWNER_ACCEPTED (`docs/product/CENTRUM_AKTYWNOSCI.md`)
- Interactive Discord layout CONTRACT_SPECIFIED
- P3-D1–P3-D20 — Authz SoT (no parallel RBAC in activity module)
- D-023 / D-024
- ADR-0014 Proposed (technical boundary)
- P4-D3 / D5 / D6 / D7 / D8 — open as documented in PENDING

## Validation (this task)

- Docs format / relative links / P4.1–P4.6 traceability: pass
- `pnpm architecture:check`: pass
- `pnpm validate` once: repo checks passed through runtime smoke; Docker CLI
  missing (`docker compose … config` → ENOENT) — **environment limitation**

## Last updated

2026-08-06 — Cursor (`READY_FOR_FINAL_P4_SPEC_AUDIT`) — PR #18 draft
