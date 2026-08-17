# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_DISCORD_FIXUP_REVIEW`

ROLLING AUDIT MODE: **ACTIVE**

## 2. Checkpoints

PREVIOUS_TASK_ID: `P4-ADMIN-PRODUCTIZATION-001`  
ADMIN_CHECKPOINT_SHA: `2824489cf788622587800e401c709c1083ae627b`  
ADMIN_CHECKPOINT_PUSHED: YES

AUDITED_DISCORD_SHA: `ba082b3cfe39d5c3a58a0f6384425750368fe811`

CURRENT_TASK_ID: Discord audit fixup (Phase A)  
DISCORD_FIXUP_SHA: _(git tip of this commit — do not amend)_

ChatGPT may audit `ADMIN_CHECKPOINT_SHA` and `AUDITED_DISCORD_SHA` independently.
Zero amend / rebase / force push / squash.

## 3. Delta summary (Discord audit fixup)

- Removed `v2dui.v1` / signed JSON from TextDisplay preview copy
- `DraftUiStateCache`: in-memory, TTL 20 min, max 512, key = guildId + discordUserId + opaqueDraftId
- Presentation cache only; activity-service remains draft SoT
- Edit cache hit: `showModal` with zero HTTP
- Edit cache miss: `deferUpdate` → HTTP → rebuild cache → update the same preview
- Capacity: `Miejsca: 3/8` vs `Miejsca: bez limitu · zapisanych: 3`
- WWW 401 pages already render `UnauthorizedState`; targeted test GREEN
- GitHub Bugbot thread not resolved (`gh` unauthenticated):
  https://github.com/HOMZIKx/V2/pull/19#discussion_r3792126672

## 4. Validation

Targeted discord interaction / cache / event renderer / WWW unauthorized, then
`pnpm validate` — all full validation checks passed.

## 5. Explicit

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ · ISSUE #20 NOT IMPLEMENTED  
WWW PRODUCTIZATION NOT STARTED  
GLOBAL DESIGN SYSTEM: OWNER_VISUAL_REVIEW_REQUIRED  
ADMIN: OWNER_VISUAL_REVIEW_REQUIRED  
DISCORD: OWNER_VISUAL_REVIEW_REQUIRED
