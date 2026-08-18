# Public exposure (current P4)

Never expose PostgreSQL or Redis publicly.

| Component             | Public? | Why                                              | Who calls it                        | Auth                                    | Notes                                      |
| --------------------- | ------- | ------------------------------------------------ | ----------------------------------- | --------------------------------------- | ------------------------------------------ |
| api-gateway           | YES     | Browser BFF + OAuth callback host                | Admin, WWW, Discord OAuth           | Session cookie / unauthenticated health | CORS allowlist; 256 KiB body; 15s upstream |
| admin                 | YES     | Operator UI                                      | Guild operators in a browser        | Identity session                        | No secrets in `VITE_*`                     |
| web                   | YES     | Member WWW                                       | Guild members in a browser          | Identity session                        | No secrets in `NEXT_PUBLIC_*`              |
| identity-service      | NO      | Only via api-gateway `/identity` and `/api/auth` | api-gateway                         | Better Auth                             | Keep internal URL                          |
| activity-service      | NO      | Only via api-gateway `/activity/v1`              | api-gateway, discord-gateway        | Client assertion                        | Keep internal URL                          |
| authorization-service | NO      | Service-to-service authorize                     | activity-service, identity-service  | Client assertion                        | Keep internal URL                          |
| discord-gateway       | NO\*    | Outbound Discord WebSocket                       | Discord; activity outbox internally | Bot token / projection secret           | Optional public `/health/*` only           |
| postgres-\*           | NO      | Data stores                                      | owning service only                 | DB credentials                          |                                            |
| redis                 | NO      | Sessions + assertion JTI                         | identity, activity                  | Redis URL                               |                                            |

\* A public discord-gateway health URL is optional for operators. Do not
publish projection or interaction HTTP beyond what Discord already requires
on the bot connection.
