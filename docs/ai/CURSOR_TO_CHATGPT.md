# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_PRODUCTIZATION_VISUAL_AND_LIVE_REVIEW`

ROLLING AUDIT MODE: **ACTIVE**

CURRENT_TASK_ID: `P4-PRODUCTIZATION-AUDIT-CLOSURE-001`  
BASELINE_SHA: `ae0a8f0f0169197eee1e72de9c9cba53eedac121`  
CLOSURE_CHECKPOINT_SHA: _(git tip of this commit — do not amend)_

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 NOT IMPLEMENTED · G8 / ISSUE #21 NOT IMPLEMENTED

## 2. Process correction (G1)

Admin HIGH (channel allowlist truncation at `ADMIN_CHECKPOINT_SHA`
`2824489cf788622587800e401c709c1083ae627b`) was reported during later rolling
WWW work and **did not stop the pipeline**.

Workflow was **not** redesigned. From now the existing rule is enforced:

HIGH / CRITICAL of an earlier checkpoint → SAFE WIP checkpoint → STOP → FIX PRIORITY.

## 3. Findings closed

### ADMIN HIGH — channel allowlist data loss

FIXED. Owner MultiSelect of all `allowedPublishChannelIds`. Hub channel remains
separate. No artificial limit of 2. Missing Discord channels show as
„Kanał niedostępny”, not raw IDs.

### ADMIN SECURITY — guild inventory

GET `/activity/v1/admin/guilds` filters Discord candidate guilds by
`ACTIVITY_PERMISSIONS.CONFIG_MANAGE` guild scope. Denied guilds are not
returned (no id/name). Authz dependency failure → `CONFIG_INVALID` (fail closed).
Unauthenticated → `UNAUTHENTICATED`. No ACL in Admin. No owner Discord ID hardcode.

### ADMIN product

- Discord channel/role metadata failure is a visible error + Spróbuj ponownie,
  not an empty picker.
- Declined copy no longer claims „nie zajmuje miejsca”. OccupiesSlot stays an
  independent field (SoT below). Warning when `declined && occupiesSlot`.

### DISCORD LOW

Successful discard and successful terminal publish delete `DraftUiStateCache`
for guild+user+opaqueDraft. Failure does not clear cache. Stale Edit after
discard is a cache miss.

### WWW

- `.detail-facts` is a semantic `<dl>` with `dt`/`dd` as direct grid children.
- Global `a:hover` no longer overrides `.v2-btn` / `.v2-btn-primary` contrast
  (selector ownership in design-system + `a:not(.v2-btn):hover` in web/admin CSS).
- 401 → `UnauthorizedState` on Activities / Detail / My / Inbox (HEAD verified).

OLD REVIEW THREAD: `VERIFIED_FIXED_THREAD_PENDING_CHATGPT_RESOLUTION`
(no GitHub CLI auth in this environment).

## 4. SoT — declined / occupiesSlot

`docs/architecture/CENTRUM_AKTYWNOSCI.md` §5: `occupiesSlot` **nie wystarcza**;
`behavior` is independent (`confirmed` | `tentative` | `declined` | `custom`).

`docs/product/CENTRUM_AKTYWNOSCI.md`: same independence.

Domain seed declined uses `occupiesSlot: false`, but `assertValidReferenceStatus`
does **not** forbid `declined + occupiesSlot=true`. Domain therefore **allows**
the combination; UI warns and does not auto-flip the toggle.

## 5. Explicit

NO MERGE  
NO P4.5  
NO P4.6  
NO RABBITMQ  
ISSUE #20 NOT IMPLEMENTED  
G8 / ISSUE #21 NOT IMPLEMENTED

OWNER GATES STILL REQUIRED:

- DISCORD VISUAL/LIVE
- ADMIN VISUAL/LIVE
- WWW VISUAL/LIVE
- GLOBAL DESIGN SYSTEM: OWNER_VISUAL_REVIEW_REQUIRED

STOP.
