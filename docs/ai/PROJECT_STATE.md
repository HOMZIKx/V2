# PROJECT_STATE

## Status

`READY_FOR_OWNER_DISCORD_FIXUP_REVIEW`

Rolling audit: Admin Control Center is an immutable checkpoint.
Discord audit fixup is a new immutable checkpoint on the same branch.
WWW productization has not started.

## Explicit gates

- **NO MERGE**
- **NO P4.5**
- **NO P4.6**
- **NO RABBITMQ**
- Issue #20 **NOT IMPLEMENTED**
- **WWW PRODUCTIZATION NOT STARTED**
- Global design system: **OWNER_VISUAL_REVIEW_REQUIRED** (not APPROVED)
- Admin visual: **OWNER_VISUAL_REVIEW_REQUIRED**
- Discord visual: **OWNER_VISUAL_REVIEW_REQUIRED**

## Active phase

Discord audit fixup after ChatGPT audit of `ba082b3cfe39d5c3a58a0f6384425750368fe811`

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- Discord visual audited SHA: `ba082b3cfe39d5c3a58a0f6384425750368fe811`
- Admin checkpoint: `2824489cf788622587800e401c709c1083ae627b`
- Discord fixup checkpoint: git tip of this commit

## Delivered in this delta

- Removed `v2dui.v1` signed UI tokens from Discord TextDisplay / preview copy
- In-memory bounded TTL `DraftUiStateCache` keyed by guild + user + draft
- Cache hit: `showModal` before HTTP; cache miss: `deferUpdate` then same preview
- Public event capacity copy: `Miejsca: 3/8` / `Miejsca: bez limitu · zapisanych: 3`
- WWW 401 UnauthorizedState verified in code and targeted tests (GitHub thread not resolved: `gh` unauthenticated)

## Owner next

1. Visual review of Admin (`tmp/ui-review/admin/`)
2. ChatGPT audits Admin SHA `2824489` and this Discord fixup independently
3. Do **not** merge; do **not** start P4.5 / P4.6 until the next rolling prompt

## Explicitly not done

- Merge to `main`
- P4.5 / P4.6 / RabbitMQ / Issue #20 / G8
- WWW productization
- Owner approval of Admin or Discord visuals
- Global design-system APPROVED
- Resolving GitHub Bugbot thread (no GitHub CLI auth)

## Last updated

2026-08-17 — Discord audit fixup after P4-ADMIN-PRODUCTIZATION-001
