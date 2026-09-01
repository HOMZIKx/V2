# PROJECT_STATE

## Status

`READY_FOR_FINAL_P4_SPEC_REAUDIT`

Visual screenshot contract: `REFERENCE_IMAGE_REQUIRED` (not designed from memory).

## Owner directive — WWW product (2026-09-02)

- Decision: **D-037 ACCEPTED**.
- Cursor keeps existing Web/Admin code, but it is **not** a visual or product
  reference for the new interface.
- Cursor must not independently design or extend Web/Admin layout, information
  architecture, graphics, copy, animations or user-facing page content until an
  approved frontend slice exists.
- The previous Sites demo and legacy UI are not requirements or default visual
  direction.
- Backend, API, database, Discord, Identity, Authorization, tests and
  infrastructure may continue only without inventing Web/Admin UX assumptions.
- Any technical choice that changes user-facing behavior is
  `OWNER_DECISION_REQUIRED`.
- First next Web/Admin step: repository/product inventory according to
  [WEB_PRODUCT_DESIGN_AND_DELIVERY](../product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md).
  No page design starts before the product map and information architecture are
  owner-approved.
- This directive does not cancel approved Discord-specific P4 contracts; it
  freezes independent Web/Admin product design.

## Active phase

P4 Centrum Aktywności — final specification closure (docs only).
P0–P3 completed. P4 implementation not started.

## Active task

- Task ID: `P4-FINAL-SPEC-CLOSURE-001`
- Branch: `cursor/p4-centrum-aktywnosci-spec-v2`
- Draft PR: **#18**
- Base: `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e`
- ADR-0014: **Accepted**
- Service name: **`activity-service`** / DB **`activity`**

## Closed blockers

P4-D3, P4-D5, P4-D6 (nonce/adopt), P4-D7 permissions, RSVP confirmationState,
transactional invariants, one logical Discord form, Issue #12 non-blocking for
P4.2a test.

## Open

- P4-D8 assets = OWNER_DECISION_REQUIRED (prod visual sign-off)
- Screenshot-based `CENTRUM_AKTYWNOSCI_VISUAL_INTERACTION_CONTRACT.md` blocked —
  image file unavailable in agent environment

## Out of scope

Code, migrations, Discord publish, merge, Actions, new PR, reopen #17.

## Last updated

2026-08-06 — Cursor (`P4-FINAL-SPEC-CLOSURE-001`)
