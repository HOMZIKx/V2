# Player Workspace ↔ DESTILED frontend adapter contract map

- **Status:** INTEGRATION-001
- **Decisions:** D-051, D-052, D-050
- **APPROVED_FRONTEND_SOURCE:** `origin/preview/destiled-web` @ `b7271a07`
- **Scope:** Team + Character Board only (no EQ/Sets/Trackers)

## REAL (wired via API Gateway / Identity)

| Surface                                 | Adapter / client                             | Backend                                                        |
| --------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| List teams                              | `listTeams()`                                | `GET /player-workspace/v1/teams`                               |
| Create team                             | `createTeam()`                               | `POST /player-workspace/v1/teams`                              |
| Team detail + members + pending invites | `getTeamDetail()`                            | `GET /player-workspace/v1/teams/:teamId`                       |
| Invite member                           | `HttpTeamMembershipAdapter.createInvitation` | `POST .../teams/:teamId/invitations`                           |
| Accept / reject invite                  | `respondToInvitation`                        | `POST .../invitations/:id/accept\|reject`                      |
| Revoke invite                           | `cancelInvitation`                           | `POST .../invitations/:id/revoke`                              |
| Pending invites for actor               | `listPendingInvitations()`                   | `GET /player-workspace/v1/invitations/pending`                 |
| Resolve Discord ID                      | `resolveDiscordDirectory()`                  | `POST /identity/v1/directory/resolve-discord`                  |
| Identity characters (link picker)       | adapter-ready, **no new DESTILED control**   | optional `linkedPlayerCharacterId`; backend verifies ownership |

| Character boards CRUD | `HttpCharacterProfileAdapter.saveProfile` | `POST/PATCH .../character-boards` |
| Class presentation ↔ API | `class-spec-adapter.ts` | hub-core `classSpecKey` |

## DEFERRED (no fixture fallback on live Team/Board/invite routes)

| UI field / surface                               | Status                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| `startingSetName`, Sets/EQ persistence           | DEFERRED — API returns `null`; form optional       |
| `responsibleMemberId`, `teamNote`                | DEFERRED — not stored in foundation slice          |
| Dashboard quick actions, equipment sets, history | Empty arrays from API mapping                      |
| Team tasks, notes, timers                        | DEFERRED_MOCK_PREVIEW in workspace UI only         |
| Character equipment page                         | DEFERRED_MOCK_PREVIEW with mock-notice             |
| Member online presence                           | Always `offline` until realtime                    |
| Member display names (non-resolved)              | Placeholder from `userId` until profile enrichment |

## TeamMembershipAdapter

| Adapter field / method         | Backend                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `getTeamMembership(teamId)`    | `GET /player-workspace/v1/teams/:teamId`                 |
| `createInvitation`             | `POST /player-workspace/v1/teams/:teamId/invitations`    |
| `respondToInvitation(accept)`  | `POST /player-workspace/v1/invitations/:id/accept`       |
| `respondToInvitation(decline)` | `POST /player-workspace/v1/invitations/:id/reject`       |
| `cancelInvitation`             | `POST /player-workspace/v1/invitations/:id/revoke`       |
| `resolveDiscordIdentity`       | Identity directory — never trust raw Discord ID as authz |
| `teamRevision`                 | `team.revision`                                          |
| `role owner\|member`           | `OWNER`/`MEMBER` (adapter lowercases for display)        |
| Fixture slug IDs (`asteria`)   | **REPLACED** — production uses UUID                      |

## CharacterProfileAdapter

| Adapter field                                        | Backend                                          |
| ---------------------------------------------------- | ------------------------------------------------ |
| `saveProfile` create                                 | `POST .../character-boards`                      |
| `saveProfile` update                                 | `PATCH .../character-boards/:boardId`            |
| `name`                                               | `displayName`                                    |
| `characterClass` / gender                            | Mapped via `toClassSpecKey` / `fromClassSpecKey` |
| `level`                                              | `level` nullable                                 |
| `linkedPlayerCharacterId`                            | optional UUID; null for unlinked boards          |
| `expectedTeamRevision` / `expectedCharacterRevision` | `expectedTeamRevision` / `expectedBoardRevision` |
| `operationId`                                        | required on create/invite/accept                 |

## Class taxonomy

Canonical DB/API value: hub-core enabled `class_spec_key` (`warrior_body`, …).  
Frontend display labels/slugs map in `apps/web/src/lib/class-spec-adapter.ts` only.

## Phase 15 — fixture audit

| PATH                                                                         | USED_BY_LIVE_ROUTE                      | PURPOSE                       | SAFE_TO_KEEP                  |
| ---------------------------------------------------------------------------- | --------------------------------------- | ----------------------------- | ----------------------------- |
| `src/member-dashboard.ts` `memberDashboardFixture`                           | NO (Pulpit uses `HomePageClient` + API) | unit tests / design snapshot  | YES                           |
| `src/team-membership.ts` `teamMembershipFixture` / `discordDirectoryFixture` | NO (members/invites use HTTP adapter)   | unit tests                    | YES                           |
| `src/character-profile.ts` `*CharacterProfileFixture`                        | NO                                      | unit tests                    | YES                           |
| `src/team-workspace.ts` `teamWorkspaceFixture`                               | NO (workspace page maps API)            | unit tests                    | YES                           |
| `src/team-history.ts` `teamHistoryFixture`                                   | YES — `/teams/[teamId]/history`         | DEFERRED_MOCK_PREVIEW History | YES (isolated deferred route) |
| `src/character-equipment.ts` `characterEquipmentFixture`                     | YES — `/teams/.../characters/[id]` EQ   | DEFERRED_MOCK_PREVIEW EQ      | YES (isolated deferred route) |
| `e2e/member.spec.ts` Playwright mocks                                        | NO (Playwright only)                    | e2e against DESTILED chrome   | YES                           |

Live Team list / detail / members / invitations / Character Board create-edit: **no API-fail → fixture fallback**.

## REAL FRONTEND

Moje zespoły, create team, team detail, members, invitations (create/accept/reject/revoke/remove), Character Board list/create/edit, Pulpit team/board counts.

## DEFERRED

EQ, Sets, Trackers, Notes, Team Actions, History, Notifications, Realtime, Discord Team reminders, canonical-character link picker UI.
