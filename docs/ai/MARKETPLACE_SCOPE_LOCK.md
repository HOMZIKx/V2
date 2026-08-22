# Marketplace / Handel — Scope Lock (Stage 7)

## Status (authoritative)

| Flag                   | Value                                                 |
| ---------------------- | ----------------------------------------------------- |
| **Issue #28 gate**     | `OWNER_DISCOVERY_REQUIRED` — **DO NOT IMPLEMENT YET** |
| **Code on branch**     | `FOUNDATION_WIP_EXISTS` (prototype only)              |
| **Product acceptance** | `NOT_ACCEPTED_FOR_PRODUCT_IMPLEMENTATION`             |

SoT: GitHub Issue **#28** (Authoritative).

Previous local claim of `OWNER_ACCEPTED` via continuous resume was **incorrect** and is
**revoked** (`V2-CORE-FOUNDATION-STATE-AND-CI-RECOVERY-001`,
`V2-OWNER-DISCOVERY-GATE-COMPLIANCE-REMEDIATION-001`).

Continuous execution does **not** override Owner Discovery governance.

## Classification of existing code

Existing Marketplace implementation is **PROTOTYPE / FOUNDATION WIP** under
`MARKETPLACE_FOUNDATION_WIP_SHA` (`24828b7`):

- migration `015_marketplace_core.sql`
- domain `offerMatchesWatch`
- `createMarketplaceOffer` use-case + POST API
- optional DISCOVERY notification on watch match

It may be useful later. It must **not** define final product for:

UX · schema semantics · reservation behavior · TTL · BUY/SELL workflow · matching rules ·
catalog structure · bonus model · notifications · moderation · reputation · privacy ·
Discord UX · WWW UX · Admin UX

unless explicitly covered by future **Owner Accepted** decisions after Issue #28 discovery.

## Gate

Before any implementation prompt: ChatGPT runs full Owner product discovery; Owner
decides UX/behavior. Cursor must not invent final Marketplace product.

Stage 7 in Issue #26 is an implementation slot **only after** #28 Definition of Ready
is Owner-Accepted.

## Cursor rules

- **Do not expand** Marketplace product behavior.
- **Do not delete** prototype code/migrations (additive governance only).
- **Do not** expose as “released” or Accepted Stage 7.
- Safe work: tests, docs, isolation notes, bug fixes — see `OWNER_DISCOVERY_GAPS.md`.

## Checkpoint

Accepted Stage 7 checkpoint: **none** until Issue #28 Owner Discovery + DoD.
