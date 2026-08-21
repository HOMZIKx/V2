# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field                             | Value                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| **CURRENT_STAGE**                 | 3 — V2 Hub Core (discovery gate) + inventory hotfix        |
| **CURRENT_TASK**                  | `V2-ADMIN-DISCORD-GUILD-INVENTORY-503-ROOT-CAUSE-FIX-001`  |
| **FINAL_STATUS**                  | `READY_FOR_OWNER_LIVE_LOGIN_PROOF`                         |
| **CURRENT_HEAD**                  | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859`                 |
| **PR**                            | #19                                                        |
| **P4_6_FINAL_CHECKPOINT_SHA**     | `6d80ea7716b439ec6827141707a6bf7ec5974147`                 |
| **ADMIN_GUILD_INVENTORY_FIX_SHA** | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859`                 |
| **OPEN_CRITICAL**                 | 0 code; owner login proof remaining                        |
| **OPEN_HIGH**                     | 0                                                          |

## Hotfix checkpoint

| Field | Value |
| ----- | ----- |
| ROOT_CAUSE | Wrong Activity→Discord internal hostname style + false-green diagnostics + Docker `@v2/messaging` gap blocking tip activity deploys |
| FIX_SHA | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859` |
| ZEABUR_SERVICES_REDEPLOYED | activity-service, discord-gateway, api-gateway, admin |
| LIVE evidence | Discord bot `ready`; activity outbox `baseUrl=http://discord-gateway.zeabur.internal:8080`; Admin diagnostics show Gateway OK / Bot Połączony without inventing Activity→Discord OK while logged out |
| LIVE_GUILD_INVENTORY | PENDING_OWNER_LOGIN |
| AUTHORIZATION_FILTER | PASS (tests) |
| DIAGNOSTICS | PASS (split probes live) |

## Next

1. Owner: open https://v2-admin.zeabur.app → Zaloguj przez Discord → confirm server picker + Control Center.
2. Resume Hub Core discovery (`HUB-CORE-001`) — do not invent Hub IA.
