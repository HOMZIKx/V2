# Guild Control & Member Monitoring — Owner Discovery Prep

Task: `V2-GUILD-CONTROL-AND-MEMBER-MONITORING-DISCOVERY-PREP-001`  
Mode: **inventory + technical discovery prep only** — **no product implementation**  
Owner priority: **BOT-FIRST / GUILD OPERATIONS** · Community deprioritized

Near-term product focus (Owner amendment, Issue #26): Guild Control / Discord server administration → server/member monitoring → G8 attendance/activity → Marketplace after Owner discovery.

**Disclaimer:** Existing code is **technical foundation**, not an Accepted Guild Control product. Do not treat migrations, sync snapshots, or Admin Activity pages as final Guild Control UX.

Related SoT: `OWNER_DISCOVERY_GAPS.md`, `PENDING_DECISIONS.md`, `ADR-0013-authorization-foundation.md`, `P4_6_SCOPE_LOCK.md`, `MARKETPLACE_SCOPE_LOCK.md`, Issue **#21** (G8), **#25** (Security), **#26** (roadmap), **#27** (Profile/Interests), **#28** (Marketplace).

**Note:** GitHub Issue bodies were not fetched in this prep (CLI auth unavailable). G8 scope below is synthesized from in-repo scope locks (`P4_6_SCOPE_LOCK.md`) and Owner task checklist; ChatGPT should reconcile with full Issue #21 text during formal Discovery.

---

## CURRENT_CAPABILITY_MATRIX

Legend: **IMPLEMENTED** = production-ready foundation in repo · **PARTIAL** = exists but incomplete or Activity-scoped only · **MISSING** = no bounded-context support

| Capability area                                 | Status          | What exists today                                                                                                                               | Primary owner / surface                      |
| ----------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Guild membership ingest                         | **IMPLEMENTED** | `discord_membership`, join/leave/update via gateway → authz events/reconcile                                                                    | `authorization-service`                      |
| Connected guild lifecycle                       | **IMPLEMENTED** | `connected_guild`: pending_sync → active, login_entitling, inactive_detached, sync_status                                                       | `authorization-service`                      |
| Discord role snapshot                           | **IMPLEMENTED** | `discord_role_snapshot`, `discord_member_role`; GuildRoleCreate/Update/Delete sync                                                              | `authorization-service`                      |
| Identity link (Discord ↔ V2 user)               | **IMPLEMENTED** | `discord_identity_link`; Identity-only writes                                                                                                   | `authorization-service` + `identity-service` |
| RBAC decision engine                            | **IMPLEMENTED** | Allow/deny + explain; blocks, grants, owner shield, sync gate, specificity                                                                      | `authorization-service`                      |
| Activity permission catalog                     | **PARTIAL**     | Seeded activity permissions (RSVP, attendance, stats, admin, etc.) — not general guild RBAC UI                                                  | `authorization-service` migration `005`      |
| WWW login entitlement gate                      | **IMPLEMENTED** | `permission.platform.login.www` checked before session (fail-closed on stale sync)                                                              | Identity + Authorization                     |
| Session revoke on entitlement loss              | **IMPLEMENTED** | `pending_session_revoke` worker → Identity system revoke                                                                                        | `authorization-service`                      |
| Player profile + characters                     | **PARTIAL**     | V2 profile, characters, party roles, active character; Discord edit-in-place (Owner UX pack)                                                    | `identity-service`                           |
| Interests catalog + user selections             | **PARTIAL**     | `interest_catalog`, `user_interests`; API read/write; no Admin CRUD UI                                                                          | `identity-service`                           |
| Interest → Discord role projection              | **PARTIAL**     | Safety validation + desired-state **compute only**; **APPLY not wired** (`PROFILE-DISC-001`)                                                    | `identity-service` domain                    |
| Discord role projection audit                   | **PARTIAL**     | `interest_role_projection_audit` table; no apply loop / outbox                                                                                  | `identity-service`                           |
| Notification preferences                        | **PARTIAL**     | Per-guild prefs + inbox; separate from interests/roles                                                                                          | `activity-service`                           |
| Activity guild configuration                    | **IMPLEMENTED** | Types, channels, limits, hub, LFG composition, report reasons — Admin CRUD                                                                      | `activity-service` + `apps/admin`            |
| Activity participation / RSVP                   | **IMPLEMENTED** | Participations, waitlist, reconfirm, join/resign                                                                                                | `activity-service`                           |
| Organizer attendance (P4.6)                     | **PARTIAL**     | `activity_attendance_records`, 24h window, `permission.activity.attendance.record`; API exists; Discord marking flows **deferred** in P4.6 lock | `activity-service`                           |
| Activity stats (self/guild)                     | **PARTIAL**     | Domain + API scaffolding in P4.6 direction; not full Guild Control analytics                                                                    | `activity-service`                           |
| Activity audit log                              | **PARTIAL**     | `activity_audit_entries`; Admin `/activity/audit`                                                                                               | `activity-service`                           |
| Authorization audit log                         | **PARTIAL**     | `audit_log` for policy/sync/revoke; **no Admin UI**                                                                                             | `authorization-service`                      |
| Discord gateway diagnostics                     | **PARTIAL**     | `/status`, `/health/discord`, Admin hub diagnostics, projection repair                                                                          | `discord-gateway`, `apps/admin`              |
| Discord interactions (Hub/LFG/Activity)         | **IMPLEMENTED** | Components V2, single-workspace UX (Owner UX pack)                                                                                              | `discord-gateway`                            |
| General guild moderation                        | **MISSING**     | No ban/kick/timeout module; Activity event moderation only (cancel/takeover/report)                                                             | —                                            |
| Guild Control Admin (members/roles/permissions) | **MISSING**     | No membership browser, grant/block editor, interest mapping UI                                                                                  | —                                            |
| G8 voice attendance / rankings                  | **MISSING**     | Explicitly OUT OF SCOPE until after Core Foundation (`P4_6_SCOPE_LOCK.md`, Issue #21 PLANNING)                                                  | —                                            |
| Community module                                | **MISSING**     | Hub registry `community` = roadmap; Owner deprioritized                                                                                         | —                                            |

---

## MEMBER_DATA_MATRIX

What durable data exists **today** for a guild member (no new storage proposed).

| Data domain                             | Stored? | Location / API                                        | Notes                             |
| --------------------------------------- | ------- | ----------------------------------------------------- | --------------------------------- |
| Discord user id                         | Yes     | Authz membership rows; Identity OAuth `account`       | Canonical Discord id in sync path |
| V2 user id                              | Yes     | Identity `"user"`; link via `discord_identity_link`   | Nullable until linked             |
| Display name / OAuth profile            | Yes     | Identity Better Auth user                             | Not guild nickname                |
| Guild membership state                  | Yes     | `discord_membership` (joined_at, left_at, sync epoch) | Per connected guild               |
| Discord role ids held                   | Yes     | `discord_member_role` snapshot                        | From sync events / reconcile      |
| Discord role metadata                   | Yes     | `discord_role_snapshot`                               | Name, position, managed flags     |
| Authorization grants/blocks             | Yes     | `access_grant`, `access_block`                        | Explainable RBAC                  |
| WWW login entitlement                   | Derived | Decision on `permission.platform.login.www`           | Fail-closed if sync stale         |
| Player profile (V2)                     | Yes     | `player_profiles`                                     | Not guild-specific                |
| Characters + party roles                | Yes     | `player_characters`, `player_character_party_roles`   | Used by LFG                       |
| Active character                        | Yes     | `player_profiles.active_character_id`                 |                                   |
| Interests (keys)                        | Yes     | `user_interests`                                      | Separate from Discord roles       |
| Interest catalog                        | Yes     | `interest_catalog`                                    | Seed keys (#27)                   |
| Interest→role mapping config            | Yes     | `interest_role_mappings`                              | Apply not wired                   |
| Notification preferences                | Yes     | `notification_preferences`                            | Activity-service                  |
| Inbox items                             | Yes     | `notification_inbox_items`                            | Not guild moderation inbox        |
| Activity participations                 | Yes     | `participations`                                      | RSVP/join state                   |
| Organizer attendance marks              | Yes     | `activity_attendance_records`                         | Present/absent per activity event |
| LFG intents / watches                   | Yes     | `lfg_intents`, `lfg_full_group_watches`, etc.         | Matching context                  |
| Activity audit events                   | Yes     | `activity_audit_entries`                              | Activity-scoped                   |
| Authz audit events                      | Yes     | `audit_log`                                           | Policy/sync/revoke                |
| Voice presence / time-in-channel        | **No**  | —                                                     | G8 gap                            |
| Scheduled occurrence attendance (voice) | **No**  | —                                                     | G8 gap                            |
| Ban/mute/timeout history                | **No**  | —                                                     | Not collected                     |
| Nickname change history                 | **No**  | Only latest in sync payload if captured on update     | No dedicated audit                |
| Join/leave analytics rollups            | **No**  | Raw membership rows only                              | No G8 ranking tables              |

**API surfaces (member-relevant, non-exhaustive):**

- Identity session: `GET /identity/me`, `GET/PUT /identity/v1/profile`, characters, interests
- Authorization S2S: `POST /authorization/v1/discord/events`, reconcile, decision/explain (internal)
- Activity member: RSVP, inbox, preferences, LFG, my-activities, stats/self (P4.6)

---

## DISCORD_EVENT_MATRIX

Source: `apps/discord-gateway/src/infrastructure/discord/discord-js-adapter.ts`, `ADR-0007`, `docs/discord/TEST_BOT_SETUP.md`.

### Gateway intents (configured)

| Intent           | When enabled                              | Purpose                       |
| ---------------- | ----------------------------------------- | ----------------------------- |
| `Guilds`         | Always                                    | Guild lifecycle, role events  |
| `GuildMembers`   | `DISCORD_AUTHORIZATION_SYNC_ENABLED=true` | Member add/remove/update sync |
| `MessageContent` | **Forbidden**                             | Not used                      |
| `GuildPresences` | **Forbidden**                             | Not used                      |

### Events — consumed today

| Event                                        | Handler | Downstream                           | Guild Control relevance   |
| -------------------------------------------- | ------- | ------------------------------------ | ------------------------- |
| `ClientReady`                                | Yes     | Health / logging                     | Diagnostics               |
| `InteractionCreate`                          | Yes     | Hub, Activity, LFG, commands         | Bot-first ops surface     |
| `GuildCreate`                                | Yes     | Register + reconcile (allowed guild) | Guild attach              |
| `GuildDelete`                                | Yes     | unavailable / detach → authz         | Guild detach              |
| `GuildMemberAdd`                             | Yes     | member upsert → authz                | Membership                |
| `GuildMemberRemove`                          | Yes     | member remove → authz                | Membership                |
| `GuildMemberUpdate`                          | Yes     | member upsert → authz                | Roles / nick (in payload) |
| `GuildRoleCreate/Update/Delete`              | Yes     | role snapshot → authz                | Role catalog sync         |
| `Error`, `Warn`, `ShardError`, `Invalidated` | Yes     | Degraded state                       | Diagnostics               |

### Events — available but **not** consumed (inventory only; do not enable without Owner approval)

| Event category                       | Examples                                                    | G8 / monitoring relevance                               |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------- |
| Voice                                | `VoiceStateUpdate`                                          | **Critical for Issue #21 G8** voice telemetry           |
| Presence                             | `PresenceUpdate`                                            | Online/status segments (requires Presence intent)       |
| Messages                             | `MessageCreate`, edits, deletes                             | Moderation / activity (requires Message Content intent) |
| Channels                             | `ChannelCreate/Update/Delete`                               | Guild structure admin                                   |
| Moderation                           | `GuildBanAdd/Remove`, `GuildMemberAdd` (ban case), timeouts | Guild Control moderation                                |
| Invites / threads / scheduled events | various                                                     | Not inventoried for v1                                  |
| AutoMod                              | `AutoModerationActionExecution`                             | Not consumed                                            |

**Isolation:** Gateway enforces `DISCORD_TEST_GUILD_ID` (single allowed guild in test harness). Unauthorized guilds rejected (`ADR-0007`).

---

## G8_IMPLEMENTATION_GAP_MATRIX

Issue **#21** (G8 — voice frekwencja / guild activity) is **`PLANNING`** in repo SoT. Explicitly **not** Activity P4.6 organizer attendance (`P4_6_SCOPE_LOCK.md`).

| G8 capability (Owner checklist)    | Status      | Reusable foundation                                               | Gap                                                             |
| ---------------------------------- | ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Voice telemetry (time in channel)  | **MISSING** | Gateway client, authz membership                                  | No `VoiceStateUpdate`, no storage, no Presence intent           |
| Scheduled occurrences              | **PARTIAL** | P4.6 `activity_series` direction (Activity product, not G8 voice) | G8 schedule model undefined; not linked to voice                |
| Presence segments                  | **MISSING** | —                                                                 | No Presence intent; no segment store                            |
| Calculation engine                 | **MISSING** | Activity stats read models (P4.6, event-scoped)                   | No G8 aggregation job/domain                                    |
| Ranking / leaderboards             | **MISSING** | LFG match ranking (different product)                             | No G8 rank tables or weekly rollups                             |
| Weekly roles (auto-assigned)       | **MISSING** | Authz role snapshot + mapping infrastructure                      | No ranking→role assignment loop; safety rules untested at scale |
| Role synchronization (G8-specific) | **PARTIAL** | Authz Discord sync + interest projection compute                  | G8 role targets ≠ interest projection; APPLY pending            |
| Admin configuration (G8)           | **MISSING** | Activity Admin patterns (guild settings CRUD)                     | No G8 config schema/UI                                          |
| Member self stats (G8)             | **MISSING** | P4.6 `stats.read.self` (activity attendance)                      | No voice-time self dashboard                                    |
| Audit / corrections                | **PARTIAL** | `activity_audit_entries`, authz `audit_log`                       | No G8 correction workflow                                       |
| Restart / recovery                 | **PARTIAL** | Authz reconcile snapshot; outbox patterns elsewhere               | No G8 backfill/replay from voice logs                           |
| Privacy / retention                | **MISSING** | Backup policy docs; notification retention TBD                    | No G8 retention Owner decision                                  |

**Explicit non-overlap:** P4.6 **organizer-marked** attendance (`activity_attendance_records`, 24h window) is **Activity Centrum** product — not a substitute for G8 voice frekwencja.

---

## ADMIN_CONTROL_GAP_MATRIX

Future Owner-approved **Guild Control** (not designed here) — technical gap vs reusable APIs.

| Control area                 | Reusable today                                                 | Missing bounded-context capability                                 |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Guild Control** (overview) | Admin bootstrap status flags (identity/activity/authz enabled) | Unified guild ops dashboard; authz guild activate/detach UI        |
| **Members**                  | Authz membership API + sync; no read UI                        | Member list/search, link status, sync freshness, reconcile trigger |
| **Roles**                    | Role snapshot in DB; Discord sync                              | Role diff view, mapping editor, managed-role guards                |
| **Permissions**              | Decision engine, grants/blocks API                             | Grant/block Admin UI, group management, no-escalation preview      |
| **Activity / Attendance**    | Full Activity Admin + P4.6 attendance API                      | G8 voice admin; cross-link attendance types                        |
| **Audit**                    | Activity audit page; authz audit table                         | Unified audit explorer, export, correction actions                 |
| **Diagnostics**              | Hub diagnostics, projection repair, gateway `/status`          | Authz sync diagnostics, member projection dry-run, intent status   |

**Admin app today:** Activity Centrum control center only (`apps/admin/README.md`, routes under `/activity/*`). No routes for authorization or identity admin beyond runtime flags.

---

## SECURITY_PRIVACY_GAPS

| Topic                  | Current state                                                              | Risk / implication                                                           | Owner gate                                   |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| Privileged intents     | GuildMembers only when authz sync on; MessageContent/Presence **off**      | G8 voice requires **VoiceState** (no extra intent) but high-volume telemetry | Approve intent + retention before collection |
| Interest role APPLY    | Compute only; silent mutation forbidden                                    | Prevents privilege escalation                                                | `PROFILE-DISC-001` — approve apply policy    |
| Role hierarchy safety  | `validateInterestRoleMappingSafety` blocks @everyone, admin, managed roles | Required for any auto-role (G8 weekly roles too)                             | Extend policy to G8 assigner                 |
| Cross-guild isolation  | Test harness single guild; Activity org binding hardened (H-SEC-01)        | LFG cross-guild tests still open in audits                                   | Owner scope for multi-guild prod             |
| Moderation permissions | Activity mod actions use `manage.guild` + activity permissions             | No general ban/kick audit trail in V2                                        | Guild Control discovery                      |
| Member data retention  | No TTL on membership snapshots, profile, attendance                        | GDPR/export undefined for guild ops data                                     | Owner retention policy                       |
| Voice/presence storage | Not collected                                                              | Future G8 is sensitive (activity surveillance)                               | Privacy model before #21 implementation      |
| Audit completeness     | Split across authz + activity + projection audit                           | No unified member timeline                                                   | Guild Control audit requirements             |
| Secrets / S2S (#25)    | Private RMQ, no credentials in git, rate-limit hardening                   | Zeabur env discipline                                                        | Operational, not product                     |

**Do not enable** Message Content, Presence, or broad telemetry intents without explicit Owner approval.

---

## REUSABLE_FOUNDATION

Safe to reuse after Owner Discovery (do not delete; classify as foundation):

| Layer                                          | Reuse      | Notes                                                       |
| ---------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `authorization-service` membership + role sync | **High**   | Core of Guild Control member graph                          |
| Authz decision engine + audit_log              | **High**   | Permissions for Admin and bot commands                      |
| Identity profile + characters + interests      | **High**   | Member context for monitoring dashboards                    |
| Interest projection safety + compute           | **Medium** | Pattern for desired-state role ops; APPLY separate decision |
| Discord gateway event → HTTP sync pipeline     | **High**   | Extend with **approved** events only                        |
| Activity Admin CRUD patterns                   | **Medium** | Template for Guild Control Admin pages                      |
| Activity attendance + stats (P4.6)             | **Medium** | Parallel product — do not conflate with G8 voice            |
| Notification inbox + preferences               | **Medium** | Member comms for Guild Control alerts (catalog TBD)         |
| Hub single-workspace Discord UX                | **Medium** | Bot-first Guild Control commands                            |
| Outbox / idempotency patterns (Activity)       | **Medium** | For future G8 aggregation workers                           |
| Internal JWT + service assertions (#25)        | **High**   | S2S for any new guild ops services                          |

**Do not treat as Accepted product:** Activity Admin pages, authz sync tables, P4.6 attendance, interest projection compute, Marketplace prototype (#28).

---

## MARKETPLACE_DEPENDENCY_MAP (Issue #28 — reuse only)

**No Marketplace implementation.** Foundations Marketplace may reuse later:

| Foundation                    | Reuse potential                                     |
| ----------------------------- | --------------------------------------------------- |
| Identity + profile/characters | Seller/buyer identity, trust signals                |
| Notifications + inbox         | Watch match alerts (prototype exists)               |
| LFG watch / matching patterns | Similar “notify when available” semantics           |
| Admin catalogs                | Item/category admin pattern (Activity types analog) |
| Authorization                 | Guild-scoped permissions for listing/moderation     |
| Audit                         | Offer/trade audit trail                             |
| Deep links `v2://…`           | Listing detail navigation                           |
| Discord single-workspace UX   | Offer flows in ephemeral workspace                  |
| Hub module registry           | `marketplace` slot reserved roadmap                 |

**Blocked by:** Issue #28 `NOT_ACCEPTED_FOR_PRODUCT_IMPLEMENTATION` (`MARKETPLACE_SCOPE_LOCK.md`).

---

## OWNER_DECISIONS_REQUIRED

Maximum **5** major decisions for ChatGPT-led Discovery (no micro-questions):

### 1. Guild Control product boundary (BOT-FIRST)

**Decision:** What is in v1 Guild Control on Discord vs Admin WWW vs both?

- Options: (A) Discord-first ops commands + minimal Admin diagnostics; (B) Admin-first control center with Discord notifications; (C) strict parity.
- **Blocks:** All Guild Control implementation scope.

### 2. G8 (#21) vs Activity attendance (#19 / P4.6)

**Decision:** Are voice frekwencja rankings and organizer-marked activity attendance **separate products** with separate member-facing stats?

- Repo SoT already separates them (`P4_6_SCOPE_LOCK.md`); Owner must **confirm** no merged “attendance score”.
- **Blocks:** G8 schema, member self-stats UX, Admin reporting.

### 3. Discord telemetry & privileged intents

**Decision:** Which telemetry is allowed for monitoring/G8 — voice state only, presence, messages — and what retention?

- Enabling Presence/Message Content requires Developer Portal + privacy policy.
- **Blocks:** Issue #21 implementation, member monitoring, compliance.

### 4. Role automation policy (interests + G8 weekly roles)

**Decision:** When may the bot **mutate** Discord roles automatically (interest projection APPLY, G8 weekly roles, manual Admin only)?

- Today: APPLY **forbidden** until `PROFILE-DISC-001` closed.
- **Blocks:** Interest sync, G8 weekly roles, Guild Control role management.

### 5. Admin Control Center scope vs Activity Admin

**Decision:** Is Guild Control Admin a **new** surface (members/authz/audit) extending `apps/admin`, or a separate app/module?

- Reuse authorization APIs vs new guild-ops service.
- **Blocks:** Architecture, delivery order, Marketplace/Community deprioritization.

---

## Status

**GUILD_CONTROL_DISCOVERY_PREP_READY**

**Explicit STOP:** No Guild Control implementation · No G8 implementation · No Marketplace · No Reservations · No Community.

Next step (Owner + ChatGPT): formal Discovery on Issues #21/#26 amendment → Options → Accepted SoT → implementation prompt only after `APPROVED`.
