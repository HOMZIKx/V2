# V2 Hub Core (Stage 3)

## Status

Owner Accepted — `HUB-CORE-001` / `docs/ai/HUB_CORE_SCOPE_LOCK.md`.

## Ownership

| Concern                                            | Owner                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| Module registry / deep-link / catalogs (contracts) | `@v2/hub-core` (shared, no Nest/Discord/ORM)                      |
| Canonical Discord Hub panel                        | `activity-service` hub panel + `discord-gateway` render/reconcile |
| Player profile / characters / interests            | `identity-service` (extends ADR-0009 basic profile)               |
| Activity module product                            | `activity-service` (unchanged boundary ADR-0014)                  |
| Authorization checks                               | `authorization-service` + per-service re-authz                    |

## Invariants

1. Hub navigation visibility is **not** authorization; backends re-authorize.
2. Backend state is Source of Truth; Hub Discord projection updates automatically.
3. Discord message URL is **not** durable object identity; deep links use V2 IDs.
4. Personalized data must not be published into the public Hub channel.
5. `HAVING_INTEREST ≠ DISCORD_ROLE ≠ WANTING_NOTIFICATION`.
6. Class/spec catalog ≠ party-role catalog; characters may have multiple party roles.
7. Legacy structured channels are never auto-deleted by Hub Core.

## Sync rules (baseline)

When Hub-visible config or shared state changes, services enqueue/reconcile Discord Hub
projection without requiring Owner `/sync`, `/publish`, restart, or redeploy for
normal product-data changes. Secrets and infra remain Zeabur-managed.
