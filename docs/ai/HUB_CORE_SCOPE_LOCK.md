# V2 Hub Core — Scope Lock (Stage 3)

## Status

`OWNER_ACCEPTED` — task `V2-HUB-CORE-OWNER-SCOPE-LOCK-002`  
Resolves: `HUB-CORE-001` / Issue #22 product discovery gate.

## Product principle

V2 is the central operating layer of the Discord gaming community.
Discord remains conversation / voice / social.
Normal member operation must not require slash-command discovery.

## Canonical Discord entry

- Channel: `#v2-centrum` or Admin-configured equivalent (`hubChannelId`).
- One canonical Hub message; edit-in-place; auto-reconcile; restart-safe; adopt/recreate if deleted/stale.
- No duplicated V2 panels; avoid conversation noise in the Hub channel.

## Information architecture (registry map)

| Group  | Module key      | Label         | Hub Core status                           |
| ------ | --------------- | ------------- | ----------------------------------------- |
| GRA    | `activities`    | Aktywności    | **available** (existing Centrum product)  |
| GRA    | `reservations`  | Rezerwacje    | roadmap stub                              |
| RYNEK  | `marketplace`   | Handel        | roadmap stub                              |
| GILDIA | `support`       | Wsparcie      | roadmap stub                              |
| GILDIA | `community`     | Społeczność   | roadmap stub                              |
| TY     | `profile`       | Mój profil    | **foundation**                            |
| TY     | `for_me`        | Dla mnie      | **foundation**                            |
| TY     | `mine`          | Moje          | **foundation** (+ existing activity mine) |
| TY     | `notifications` | Powiadomienia | entry point (full system = Stage 4)       |

## In Stage 3 (Hub Core)

- Hub shell, module registry, navigation
- Mój profil / Dla mnie / Moje foundations
- Notifications location/entry under TY
- Deep-link contract (durable V2 object identity)
- Shared user-context / permission baseline (nav ≠ authz)
- Discord ↔ WWW sync rules (backend SoT; auto Hub projection)
- Channel retirement model: `LEGACY_ACTIVE` → `V2_READY` → `OWNER_CAN_RETIRE` (no auto-delete)
- Class/spec catalog + party-role catalog (separate dimensions)
- Interests foundation (Issue #27); interest ≠ Discord role ≠ notification preference
- Role projection **contract + safety requirements** (full reconcile may continue iteratively)
- **Role projection Discord mutation (apply)** is **not** complete — only safety +
  desired-state compute exist (`ROLE_PROJECTION_DISCORD_MUTATION = pending`)

## Out of Stage 3

- Full Reservations / Marketplace / Support / Community
- Full Notifications Core (Stage 4)
- Full LFG (Activity Stage 2 / Issue #20)
- Desktop Companion / Overlay implementation
- Automatic deletion of legacy channels (`#azrael`, `#smok`, `#wb`, …)

## Public vs personal

- Public Hub: stable navigation, availability, non-sensitive common state.
- Personalized: ephemeral Discord, DM, V2 Inbox, WWW — never dump personal data into `#v2-centrum`.

## Surfaces

- Discord + WWW are equal members; same objects/permissions/profile/interests/Moje/Dla mnie.
- Admin is Control Center for Hub channel, modules, catalogs, mappings, diagnostics.
- Secrets stay in Zeabur; no Owner dependence on `.env` / raw JSON / DB edits for product config.

## Visual

Preserve accepted direction: dark premium, graphite, burnt amber, warm green.
Functionality > decoration. Missing artwork does not block shell.

## Checkpoint

`V2_HUB_CORE_CHECKPOINT_SHA` — set when Stage 3 implementation on tip is validated.

## Implementation assumptions requiring Owner review

The following **do not** reopen Accepted Hub Core decisions; they flag product copy/flows
where implementation got ahead of explicit Owner acceptance. See
`docs/ai/OWNER_DISCOVERY_GAPS.md`.

| Area | Risk |
| ---- | ---- |
| Hub Activities menu LFG ordering/copy | Assumes detailed #20 flow not fully discovered |
| “Dla mnie” example reasons | Assumes ranking/reason taxonomy |
| Deep links for unreleased modules | Placeholder paths must not imply released product |

Preserve Accepted shell, registry, reconcile, and public vs personal split. Do not delete
safe foundation.
