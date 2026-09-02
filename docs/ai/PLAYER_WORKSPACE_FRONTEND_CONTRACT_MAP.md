# Player Workspace ↔ DESTILED frontend adapter contract map

- **Status:** FOUNDATION-001
- **Decisions:** D-051, D-052, D-050
- **Scope:** Team + Character Board only (no EQ/Sets/Trackers)

## TeamMembershipAdapter

| Adapter field / method         | Backend                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `getTeamMembership(teamId)`    | `GET /player-workspace/v1/teams/:teamId`                  |
| `createInvitation`             | `POST /player-workspace/v1/teams/:teamId/invitations`     |
| `respondToInvitation(accept)`  | `POST /player-workspace/v1/invitations/:id/accept`        |
| `respondToInvitation(decline)` | `POST /player-workspace/v1/invitations/:id/reject`        |
| `cancelInvitation`             | `POST /player-workspace/v1/invitations/:id/revoke`        |
| `resolveDiscordIdentity`       | Identity (existing) — never trust raw Discord ID as authz |
| `teamRevision`                 | `team.revision`                                           |
| `role owner\|member`           | `OWNER`/`MEMBER` (adapter may lowercase for display)      |
| Fixture slug IDs (`asteria`)   | **CONTRACT_MISMATCH** — production uses UUID              |

## CharacterProfileAdapter

| Adapter field                                        | Backend                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `saveProfile` create                                 | `POST .../character-boards`                                                                            |
| `saveProfile` update                                 | `PATCH .../character-boards/:boardId`                                                                  |
| `name`                                               | `displayName`                                                                                          |
| `characterClass` / gender                            | **CONTRACT_MISMATCH** vs hub-core `classSpecKey` — adapter must map presentation → `warrior_body` etc. |
| `level`                                              | `level` nullable                                                                                       |
| `responsibleMemberId`                                | deferred (not stored in foundation)                                                                    |
| `startingSetName`                                    | **DEFERRED_PRESENTATION_FIELD** — API returns `null`; do not invent Set rows                           |
| `teamNote`                                           | deferred (notes out of slice)                                                                          |
| `linkedPlayerCharacterId`                            | optional UUID; ownership verified via Identity S2S                                                     |
| `expectedTeamRevision` / `expectedCharacterRevision` | `expectedTeamRevision` / `expectedBoardRevision`                                                       |
| `operationId`                                        | required on create/invite/accept                                                                       |

## Class taxonomy

Canonical DB/API value: hub-core enabled `class_spec_key` (`warrior_body`, …).  
Frontend display labels/slugs map in adapter only.
