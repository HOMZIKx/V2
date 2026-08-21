# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field                                        | Value                                                      |
| -------------------------------------------- | ---------------------------------------------------------- |
| **CURRENT_STAGE**                            | 3 — V2 Hub Core                                            |
| **CURRENT_TASK**                             | `V2-HUB-CORE-OWNER-SCOPE-LOCK-002`                         |
| **FINAL_STATUS**                             | `V2_HUB_CORE` — scope locked + implemented; validate PASS  |
| **CURRENT_HEAD**                             | `178a37e1bf3fb83d0ef080453c96da17aa14e5e5`                  |
| **PR**                                       | #19                                                        |
| **HUB-CORE-001**                             | **OWNER_ACCEPTED**                                         |
| **V2_HUB_CORE_CHECKPOINT_SHA**               | `178a37e1bf3fb83d0ef080453c96da17aa14e5e5`                  |
| **P4_6_FINAL_CHECKPOINT_SHA**                | `6d80ea7716b439ec6827141707a6bf7ec5974147`                 |
| **DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA** | `5e95dcff35e78edca8ceba70ae8f2d7bccb88146`                 |
| **CI_SECURITY_CLOSURE_SHA**                  | `f4577fb0e5860c34e269fa3183eef17d4d6106a7`                 |
| **CI_STATUS**                                | pending push of Hub Core tip                               |
| **REPOSITORY_VISIBILITY**                    | **PUBLIC** — OWNER_ACTION_REQUIRED_REPOSITORY_PRIVATE      |
| **OPEN_CRITICAL**                            | 0                                                          |
| **OPEN_HIGH**                                | 1 — public repository (Issue #25)                          |

## What landed (Hub Core)

1. Owner decisions written to SoT (`HUB_CORE_SCOPE_LOCK.md`, ADR-0015, PENDING_DECISIONS).
2. `@v2/hub-core` — module registry (GRA/RYNEK/GILDIA/TY), deep links `v2://…`, class/spec + party-role + interest catalogs, channel retirement statuses, sync rules.
3. Discord canonical Hub → **V2 Centrum** StringSelect shell; Activity/profile/for_me/mine/notifications ephemeral flows; roadmap stubs for other modules.
4. Identity migration `002_player_profile_foundation` + `/identity/v1/profile` API.
5. Activity migration `011_hub_core_foundation` — legacy channels + module overrides; Admin **Moduły Hub**.
6. WWW `/profil`, `/dla-mnie` foundations + nav.

## Out of this stage (unchanged)

Full Reservations / Marketplace / Support / Community / Notifications Core / full LFG / Overlay / auto channel delete.

## Owner action required (HIGH)

Repository `HOMZIKx/V2` is **public**. Privatize per Issue #25.

## Next (Issue #26 continuous)

1. Push Hub Core tip; wait CI green.
2. Stage 4 — Notifications Core (`NOTIFICATIONS_CORE_CHECKPOINT_SHA`).
3. Do not reopen Hub discovery.
