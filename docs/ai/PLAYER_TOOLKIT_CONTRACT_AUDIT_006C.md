# Player Toolkit — pre-implementation contract audit (006C)

| Field                    | Value                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **TASK**                 | `V2-PLAYER-TOOLKIT-PREIMPLEMENTATION-CONTRACT-AUDIT-006C`                                                                  |
| **STATUS**               | `COMPLETE` — Owner Decisions A/B recorded as **D-051** / **D-052**; implementation authorized separately as foundation-001 |
| **DATE**                 | 2026-09-02                                                                                                                 |
| **CURRENT_HEAD**         | `7c4382cbac25297c9c26f0b47cd00af7a778829b`                                                                                 |
| **BRANCH / PR**          | `cursor/p4-1-activity-domain` / **#19** (not merged)                                                                       |
| **FRONTEND SOT**         | `preview/destiled-web`, `codex/phase5-*` (PR #30 direction)                                                                |
| **PRODUCT IMPL STARTED** | **NO**                                                                                                                     |
| **TASK 007**             | **NOT STARTED**                                                                                                            |

**Canonical for this freeze.** Owner Decisions A/B accepted as **D-051** / **D-052**. Implementation authorized under `V2-PLAYER-WORKSPACE-TEAM-CHARACTER-BOARD-FOUNDATION-001` (separate task).

---

## Verdict

Identity **006** owns **canonical** `player_characters` + `player_game_accounts` for profile / Discord Hub / LFG S2S resolve.

Owner-accepted DESTILED SoT (**D-040…D-059** on frontend track; docs on `preview/destiled-web`) defines a **different** entity: a **Team Character Board** (planning card: real / planned / hypothetical) inside a **private Team** workspace, with later EQ / sets / timers / notes / history.

These must **not** be one table. Premature EQ/Trackers in Identity violate `PLAYER_TOOLKIT_ARCHITECTURE_BOUNDARY.md`.

Sources read for this audit: `AGENTS.md`, `NON_NEGOTIABLES`, `DECISION_LOG` (D-037 note / **D-050**), `PROJECT_STATE`, handoffs, architecture boundary, `WEB_PRODUCT_DESIGN_AND_DELIVERY.md`, Identity/Authz/Activity code on this branch, DESTILED product docs + mock adapters on remotes (`team-membership`, `character-profile`, `character-equipment`, `team-history`, `member-dashboard`, `team-workspace`). Issue #29 / PR #30 HTML not fetchable without GitHub auth; content reconstructed from boundary + DESTILED SoT + code.

---

## MODEL_MAP

| Concept                   | Model A — Identity 006 (PR #19)                | Model B — DESTILED Team SoT                                  | Verdict                            |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| **USER**                  | Better Auth V2 user + Discord link             | Same platform user                                           | Shared                             |
| **GAME ACCOUNT**          | `player_game_accounts` — solo logical grouping | Not multi-user ACL                                           | **KEEP** A for profile             |
| **TEAM**                  | Missing                                        | Explicit private workspace; Owner/Member; invite-before-data | **BUILD** B                        |
| **TEAM MEMBER**           | Missing                                        | Membership after accept; roles owner\|member                 | **BUILD** B                        |
| **CHARACTER (canonical)** | `player_characters` UUID; user-owned           | —                                                            | **KEEP** A for LFG/Discord/profile |
| **CHARACTER BOARD**       | —                                              | Team-owned planning card; may be hypothetical                | **BUILD** B (separate)             |
| **CHARACTER CARD (UI)**   | Profile list / Discord select                  | Fantasy two-face board UI                                    | Presentation only                  |
| **PROFILE CHARACTER**     | Same as canonical                              | Must not equal board                                         | Split                              |
| **ITEM / EQ**             | Forbidden in Identity                          | `TeamEquipmentItem` + optional `ItemDefinition`              | Later slice                        |
| **ITEM LOCATION**         | —                                              | Last-confirmed note (not custody)                            | Later                              |
| **SET**                   | —                                              | Named loadout per board                                      | Later                              |
| **TRACKER / TIMER**       | Deferred / Task 007                            | Character progression timers team-scoped                     | Later (not Task 007 map hunt)      |
| **ACTION**                | —                                              | Lightweight team reminders                                   | Later                              |
| **NOTE**                  | —                                              | Team / character notes + revision                            | Later                              |
| **HISTORY**               | `player_private_audit` (user-private)          | Team `ChangeEvent` append-only                               | Separate domains                   |

---

## MODEL_CONFLICTS (Phase B answers)

| #   | Question                                       | Answer                                                                                                                                                            |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Can `player_characters` represent both models? | **No** — ownership, uniqueness, game-existence, privacy, LFG verify conflict.                                                                                     |
| 2   | Need separation?                               | **Yes** — Canonical Player Character (Identity) vs Team Character Board (Player Workspace). Names Owner-refinable; **separation binding**.                        |
| 3   | Team vs Issue #29 GameAccount sharing?         | Team **supersedes multi-user sharing** for collaboration.                                                                                                         |
| 4   | Team vs GameAccount relation?                  | **Orthogonal.** GameAccount = organize _my_ characters. Team = shared private workspace.                                                                          |
| 5   | EQ belongs to?                                 | **Team** (`TeamEquipmentItem`); not Identity; not GameAccount-as-ACL. Catalog `ItemDefinition` is platform/curated later.                                         |
| 6   | Privacy layers?                                | Identity profile/chars/accounts = **user-private**. Boards/EQ/timers/notes/history = **team-private**. Guild analytics = **separate** (D-040+).                   |
| 7   | Activity/LFG character reference?              | **Identity `player_characters.id` only.** Hypothetical boards cannot enroll unless Owner later defines explicit link + verify.                                    |
| 8   | Does 006 lock a bad model?                     | **Medium risk if misused.** 006 foundation is **KEEP**. Risk = treating it as Team board or stuffing EQ into Identity — blocked by boundary; next slice must not. |

---

## OWNER DECISIONS — ACCEPTED (post-audit)

Recorded in `docs/DECISION_LOG.md` using next free IDs after D-050 on this branch log (avoids colliding with frontend-track D-040… product IDs):

| ID        | Summary                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **D-051** | Decision A — Identity `player_characters` ≠ Team Character Board; optional `linkedPlayerCharacterId`; LFG uses Identity IDs only          |
| **D-052** | Decision B — `player-workspace-service` owns Team/membership/invites/boards (+ later EQ…); GameAccount remains SOLO; no GameAccountMember |

Historical open options from the audit are **closed**. Implementation proceeds under `V2-PLAYER-WORKSPACE-TEAM-CHARACTER-BOARD-FOUNDATION-001`.

---

## EXISTING_CODE_MATRIX

Status: **A** complete reusable · **B** foundation · **C** partial · **D** frontend/mock · **E** duplicated · **F** conflicts with new SoT · **G** missing

### IDENTITY

| Element                  | Status | Evidence                                                            |
| ------------------------ | ------ | ------------------------------------------------------------------- |
| Discord user/session     | A      | Better Auth / Identity                                              |
| PlayerProfile            | B      | `002_player_profile_foundation.sql`; `player-profile.controller`    |
| `player_characters`      | B      | UUID; nickname; `class_spec_key`; level; default; `game_account_id` |
| `player_game_accounts`   | B      | `003_…`; solo grouping; archive                                     |
| Private audit            | B      | `player_private_audit`                                              |
| Party roles on character | B      | `player_character_party_roles` (LFG)                                |
| S2S character resolve    | A      | `POST identity/v1/internal/character/resolve`                       |

### AUTHORIZATION

| Element                               | Status | Evidence                              |
| ------------------------------------- | ------ | ------------------------------------- |
| User / platform login                 | A      | `permission.platform.login.www`       |
| Org/guild scopes                      | B      | policy manage org/guild               |
| Activity permissions                  | A      | `005_activity_permission_catalog.sql` |
| Team / private-workspace capabilities | G      | No `permission.team.*`                |

### PLAYER / TEAM DOMAIN

| Element                | Status | Notes                               |
| ---------------------- | ------ | ----------------------------------- |
| Team                   | G / D  | Backend G; mock on phase5           |
| TeamMember             | G / D  |                                     |
| Invitation             | G / D  | `TeamMembershipAdapter` mock        |
| Roles Owner/Member     | D      | Frontend contract only              |
| Access checks          | G      |                                     |
| Concurrency / revision | D      | Mock `teamRevision` / `operationId` |

### CHARACTER

| Element                    | Status                | Notes                                                                            |
| -------------------------- | --------------------- | -------------------------------------------------------------------------------- |
| Create/edit (canonical)    | A                     | Identity HTTP + Discord Hub                                                      |
| Delete/archive canonical   | C                     | Soft patterns partial; board archive G                                           |
| Canonical vs planning-card | F                     | Must not map 1:1                                                                 |
| Class/spec                 | E / CONTRACT_MISMATCH | Identity `warrior_body` etc. vs DESTILED `warrior\|sura\|ninja\|shaman` + gender |
| Level / nickname           | B / D                 | Both; different owners                                                           |
| Avatar / class art         | D                     | DESTILED approved renders                                                        |
| Game account relation      | B                     | Identity only                                                                    |
| Team relation              | G / D                 | Board belongs to Team                                                            |

### EQ / SETS / TRACKERS / ACTIONS / NOTES / HISTORY / REALTIME

| Element                                                                      | Status | Notes                                                |
| ---------------------------------------------------------------------------- | ------ | ---------------------------------------------------- |
| ItemInstance / template / bonuses / pool / slots / drag / OCC / move history | D / G  | `character-equipment.ts` fixture helpers; no backend |
| Saved sets / readiness                                                       | D / G  |                                                      |
| Daily/cooldown/biolog/horse/spirit/custom                                    | D / G  | Progression timers in fixture; Task 007 not started  |
| Team actions / reminders / quiet hours                                       | D / G  | Dashboard / workspace fixtures                       |
| Notes + author                                                               | D / G  | Local append in UI                                   |
| Team history / leases / conflict UI                                          | D / G  | `team-history.ts`                                    |
| Presence / edit lock / SSE-WS                                                | D / G  | ConnectionState enum only                            |
| Discord profile quick actions                                                | A      | Hub profile; **no** Team EQ Discord                  |
| Discord reminders / deep-links for Team                                      | G      | Later                                                |
| WWW real adapter (PR #19 `/profil`)                                          | A      | `lfg-api.ts` → Identity                              |
| WWW DESTILED mock adapters                                                   | D      | Remotes only on this monorepo tip                    |
| Admin for this slice                                                         | G      | None required beyond existing bot config             |

---

## FRONTEND_CONTRACT_MATRIX

Source: `origin/preview/destiled-web` (and phase5 slices). **Do not redesign UI.** Wire real APIs to adapter shapes; flag mismatches.

### Pulpit (`MemberDashboardSnapshot`)

| Field       | Value                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------ |
| READS       | viewerName, teamName, members online, quickActions, character/set summaries, history teasers     |
| MUTATIONS   | QuickAction outcome: done / snoozed / unavailable                                                |
| REALTIME    | Soft presence (“online”); not mandatory for first backend slice                                  |
| AUTHZ       | Team member of summarized team(s)                                                                |
| ERRORS      | unavailable actions; access revoked                                                              |
| CONCURRENCY | Action idempotency later                                                                         |
| MOCK        | `apps/web/src/member-dashboard.ts`                                                               |
| REAL API    | Missing — aggregate over Team + Actions (later); first slice may stub Pulpit from Team list only |
| NOTE        | First **implementation** slice need not fully wire Pulpit actions                                |

### Moje zespoły / Zespół

| Field     | Value                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| READS     | Team list; `TeamWorkspaceSnapshot` (members, characters, tasks, notes, sync label) |
| MUTATIONS | Task outcomes; append note (later); create team (implied)                          |
| REALTIME  | Sync label / connection                                                            |
| AUTHZ     | Membership                                                                         |
| MOCK      | `team-workspace.ts`                                                                |
| REAL API  | Team CRUD + membership snapshot                                                    |

### Dodanie / zaproszenie członka

| Field             | Value                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| READS             | `TeamMembershipSnapshot`; invitations                                                                   |
| MUTATIONS         | `createInvitation` (expectedTeamRevision, operationId, DiscordIdentity); respond accept/decline; cancel |
| REALTIME          | ConnectionState incl. `revoked`                                                                         |
| AUTHZ             | Owner invites/cancels; invitee responds                                                                 |
| ERRORS            | invalid_discord_id; identity_not_found; revision conflict; expired                                      |
| CONCURRENCY       | teamRevision + invitation.revision + operationId                                                        |
| MOCK              | `TeamMembershipAdapter`                                                                                 |
| REAL API          | Match adapter; **resolve Discord via Identity**, never trust raw Discord ID alone                       |
| CONTRACT_MISMATCH | Fixture teamId `asteria` (slug) → production opaque UUID                                                |

### Karta postaci / create-edit

| Field             | Value                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| READS             | `CharacterProfileSnapshot` (draft: name, class, gender, level, responsibleMemberId, startingSetName, teamNote)                                                                          |
| MUTATIONS         | `saveProfile` with expectedTeamRevision + expectedCharacterRevision + operationId                                                                                                       |
| AUTHZ             | Team member                                                                                                                                                                             |
| ERRORS            | validation; revision conflict                                                                                                                                                           |
| CONCURRENCY       | dual revision tokens                                                                                                                                                                    |
| MOCK              | `CharacterProfileAdapter`                                                                                                                                                               |
| REAL API          | CharacterBoard CRUD                                                                                                                                                                     |
| CONTRACT_MISMATCH | Class taxonomy vs Identity `class_spec_key`; gender absent on Identity; `startingSetName` implies Set create — **defer Set entity** or accept name-only placeholder in foundation slice |
| CONTRACT_MISMATCH | Fixture characterIds `nerwnicht` → UUID                                                                                                                                                 |

### EQ / sety / timery / akcje / notatki / historia

| Screen   | Status for first vertical                                                         |
| -------- | --------------------------------------------------------------------------------- |
| EQ       | **OUT** — mock `CharacterEquipmentSnapshot`; no adapter port yet for move/confirm |
| Sety     | **OUT**                                                                           |
| Timery   | **OUT**                                                                           |
| Akcje    | **OUT** (Pulpit/workspace fixtures)                                               |
| Notatki  | **OUT** (except optional teamNote field on board create)                          |
| Historia | **OUT** — `TeamHistoryAdapter`; keep ChangeEvent minimal optional in foundation   |

---

## DATA_OWNERSHIP

| ENTITY                                           | SoT SERVICE                | DB OWNER            | READERS                              | WRITERS            | AUTHZ SCOPE                     | RETENTION/AUDIT     | PUBLIC/PRIVATE               |
| ------------------------------------------------ | -------------------------- | ------------------- | ------------------------------------ | ------------------ | ------------------------------- | ------------------- | ---------------------------- |
| User / session                                   | Identity                   | Identity            | self, S2S                            | Identity           | self                            | Identity policies   | private                      |
| PlayerProfile                                    | Identity                   | Identity            | self; Discord Hub                    | owner              | self                            | private audit       | private                      |
| `player_characters`                              | Identity                   | Identity            | owner; Activity S2S resolve; Discord | owner              | self + S2S                      | private audit       | private                      |
| `player_game_accounts`                           | Identity                   | Identity            | owner                                | owner              | self                            | private audit       | private                      |
| Team                                             | Player Workspace (future)  | PW DB               | members                              | Owner              | team                            | ChangeEvent         | team-private                 |
| TeamMember / Invite                              | PW                         | PW DB               | members / invitee                    | Owner / invitee    | team + invite                   | ChangeEvent         | team-private                 |
| CharacterBoard                                   | PW                         | PW DB               | members                              | members            | team                            | ChangeEvent         | team-private                 |
| linkedPlayerCharacterId                          | PW → Identity ref          | PW column only      | members                              | members (after #1) | team + Identity ownership check | audit               | team-private                 |
| TeamEquipmentItem / Set / Timer / Note / History | PW                         | PW DB               | members                              | members            | team                            | append-only history | team-private                 |
| ItemDefinition catalog                           | Curated later              | catalog DB          | platform                             | curators           | platform                        | definition revision | shared curated               |
| LFG `characterId`                                | Activity + Identity verify | Activity stores ref | activity participants                | member via verify  | activity + Identity             | activity audit      | guild activity (not team EQ) |

**Why not Identity for Teams:** Boundary + D-010 ownership; gameplay/collaboration state must not enter Identity Postgres.

**Why not a microservice per table:** One Player Workspace bounded context covers Team→Board→(later) EQ/timers.

---

## SECURITY_FINDINGS

### CRITICAL

- Collapsing Team boards into Identity `player_characters` → cross-team leakage + LFG IDOR class.
- Treating hypothetical board as verified LFG character.

### HIGH

- No Authz team capabilities yet — must not infer access from guild rank (SoT).
- Invite must grant **zero** private data before accept; revoke must cut reads + realtime.
- Guessed/slug IDs (`asteria`, `nerwnicht`) unsafe as production identifiers.
- Silent last-write-wins forbidden (D-049+); need revision tokens.
- Attaching someone else’s Identity character as `linkedPlayerCharacterId` without ownership proof.

### MEDIUM

- Class taxonomy mismatch → wrong verify / wrong art mapping if forced through Identity.
- Stale membership after remove if caches/SSE not invalidated.
- Deleted/archived board still referenced by LFG if wrongly shared ID.
- Guild admin attempting private team access (must hard-fail).

### LOW

- PR #19 `/profil` coexists with DESTILED shell — confusion risk only; do not delete.
- Display labels (`joinedLabel`) must stay presentation; server timestamps for audit.

**Never store:** Metin2 logins, passwords, PIN, cookies, recovery codes, game credentials.

---

## REUSABLE_CODE / ADAPT / DEPRECATE / DO_NOT_DELETE

### REUSABLE_CODE (KEEP)

- Identity session + Discord link
- `player_characters` / `player_game_accounts` / private audit
- Identity S2S character resolve + Activity LFG verify path
- Discord Hub profile character select/create
- WWW `/profil` Identity HTTP client (`lfg-api.ts`)
- 006B migrate-on-deploy entrypoint pattern
- Architecture boundary doc

### ADAPT

- DESTILED mock adapters → real HTTP clients (same TypeScript ports)
- Class mapping layer Identity `class_spec_key` ↔ DESTILED class+gender (frontend or BFF mapping — **do not invent product without Owner if labels diverge**)
- Boundary doc wording: “canonical character reference **for Activity/LFG/Discord profile**” — not Team boards

### DEPRECATE_LATER

- Issue #29 multi-user GameAccount **sharing** assumptions (Teams replace collaboration sharing)
- Any design that puts EQ/trackers in Identity
- Treating PR #19 member WWW chrome as production DESTILED visual SoT

### DO_NOT_DELETE (OBSOLETE BUT KEEP)

- Premature 006 Player Core foundation commits / SHA markers
- PR #19 `/profil` UI (technical material; D-050)
- phase5 fixtures (design validation)

---

## RECOMMENDED_FIRST_IMPLEMENTATION_SLICE

**Name (suggested):** `V2-PLAYER-WORKSPACE-TEAM-AND-CHARACTER-BOARD-FOUNDATION`

**Do not start in this task.**

### GOAL

Smallest vertical that freezes ownership/access for:

`Pulpit (minimal) → Moje zespoły → Zespół → Postać (CharacterBoard)`

without EQ + Trackers + Notifications + Discord Team reminders.

### WHY_THIS_FIRST

- DESTILED SoT is **Team-first**; boards hang off Team.
- EQ/timers/notes all require Team ACL + board identity.
- Identity 006 already covers LFG/canonical characters — do not rebuild that.
- Unblocks wiring approved `TeamMembershipAdapter` + `CharacterProfileAdapter`.

### DOMAIN

New **Player Workspace** bounded service/DB (Decision #2 Option A). **Not** Identity. **Not** Activity.

### ENTITIES

- `Team` (incl. solo “My workspace” presentation)
- `TeamMember` (owner | member)
- `TeamInvitation` (pending/accepted/declined/expired/cancelled)
- `CharacterBoard` (+ archive; revisions)
- Optional minimal `ChangeEvent` for create/invite/accept/board mutations
- **No** EquipmentItem / Set / Timer tables in this slice
- After Owner Decision #1: nullable `linkedPlayerCharacterId` (FK-by-ref to Identity id, no Identity write of team state)

### MIGRATIONS

- New PW schema/DB only; Identity untouched except if Decision #1 later needs no Identity migration (prefer link column only on PW side)

### AUTHORIZATION

- Explicit team roles; invite accept gate
- Guild Leader / Technician **never** imply team access
- Platform login still Identity
- New Authz permissions or PW-local membership checks with Identity user id — decide in implementation prompt; must be testable IDOR suite

### API (align to mocks)

- get/create Team; list my teams
- getTeamMembership; createInvitation; respond; cancel
- resolveDiscordIdentity → Identity
- save/get CharacterBoard (profile adapter shape)
- revision + operationId on mutations
- structured conflict responses

### FRONTEND CONTRACTS TO WIRE

- `TeamMembershipAdapter`
- `CharacterProfileAdapter`
- Minimal team list for Pulpit / Moje zespoły navigation
- **Defer** equipment / history / dashboard action adapters

### REALTIME

**Not required** for foundation DoD (polling OK). ConnectionState may stay client-local until later slice.

### TESTS / SECURITY TESTS

- Non-member cannot read/write team or board (IDOR)
- Pending invite sees no private snapshot
- Revoked member denied
- Invite replay / expire / cancel
- Revision conflict (409 structured)
- Cannot link another user’s Identity character (when link enabled)
- LFG still resolves **only** Identity characters
- No Metin2 credentials fields exist

### ZEABUR SERVICES

- New PW service + DB + migrate entrypoint (006B pattern)
- Authz update if new permissions
- Web env for PW base URL when wiring

### RUNTIME PROOF

- Deploy tip; health/ready after migrate; smoke create team → invite → accept → create board; negative IDOR

### IMPLEMENTATION_DOD

1. Owner Decision #1 recorded
2. Team create + My workspace
3. Invite → accept → membership
4. CharacterBoard CRUD with revisions
5. Non-member IDOR blocked
6. DESTILED adapters pointed at real API for membership + profile
7. LFG/Identity character path unchanged
8. No EQ/sets/timers/Task 007
9. Targeted tests + security tests green
10. SoT handoff updated; Owner acceptance 005/006 still PENDING unless separately closed

---

## Acceptance unchanged

| Item                               | Status      |
| ---------------------------------- | ----------- |
| OWNER_ACCEPTANCE_005               | **PENDING** |
| OWNER_ACCEPTANCE_006               | **PENDING** |
| NEW_PRODUCT_IMPLEMENTATION_STARTED | **NO**      |

---

## STOP

Audit complete. Await Owner/ChatGPT on Decision #1 (and confirmation of Decision #2 at implementation prompt). **Do not start** the recommended slice from this task.
