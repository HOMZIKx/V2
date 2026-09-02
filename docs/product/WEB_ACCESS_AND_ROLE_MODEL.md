# Web access and role model

- **Status:** OWNER ACCEPTED
- **Date:** 2026-09-02
- **Decisions:** D-038, D-039
- **Scope:** product access to Web/Admin experience

## Product rule

The platform is a closed tool for guild members and people explicitly admitted
by the owner. It is not open registration and not a public SaaS.

## Login eligibility

A Discord-authenticated user may enter when at least one condition is true:

1. the user is a member of an owner-approved Discord server; or
2. the owner has added that exact Discord User ID to the platform allowlist.

Everyone else is denied after Discord OAuth.

The allowlist comparison is server-side. The trusted identity is the Discord
user ID returned by OAuth, never an ID typed by the logging-in user.

## Owner invitation by Discord ID

- Only the owner may add or remove an allowlisted Discord User ID.
- An allowlisted person receives the complete standard Member experience, even
  when not present on an approved Discord server.
- Removing the allowlist entry revokes this admission path.
- Addition, removal, successful use and denial are auditable.
- The allowlist does not grant Leader, Technician or Owner privileges.

## Baseline access

Every eligible user receives the complete standard Member capability set
without requiring an additional elevated Discord role.

This baseline includes the future member platform modules approved during
product mapping. It does not include guild management, bot configuration or
platform security controls.

## Elevated capability groups

Elevated access comes from Discord roles manually assigned by the owner:

- **Leader and above:** guild operations and player-data management;
- **Technician:** safe functional bot configuration and diagnostics;
- **Owner:** access governance and owner-only controls.

The system never promotes users or assigns Discord roles on its own. It only
synchronizes the owner's Discord decisions.

Role names are not hardcoded as authorization logic. Discord Role IDs are mapped
to platform capability groups. Renaming a Discord role must not change access.

A person may hold multiple roles; capabilities may combine, subject to explicit
backend denies and owner-only restrictions.

## Owner-only security boundary

Technician access does not include:

- adding or removing allowlisted Discord IDs;
- mapping roles to Owner or changing owner identity;
- bot tokens, OAuth secrets, database URLs, signing keys or Zeabur secrets;
- bypassing backend Authorization decisions.

Safe runtime bot configuration may be broad, but infrastructure secrets remain
outside ordinary product configuration.

## Synchronization and revocation

- Adding an elevated Discord role makes the corresponding section available
  after synchronization.
- Removing the role removes elevated access.
- Leaving every approved Discord server removes the membership admission path.
  Access remains only if the owner's allowlist still admits that Discord ID.
- Removing the allowlist entry does not revoke a still-valid guild membership
  admission path.
- The backend is always the final access authority; hiding navigation is not
  authorization.

## Unified product experience

The user signs in once and enters one coherent platform experience:

- Member capabilities are the baseline;
- Leader capabilities appear as additional guild-management areas;
- Technician capabilities appear as additional bot-control areas;
- Owner capabilities appear as owner-only controls.

Users do not choose between separate product websites. The current technical
split between `web` and `admin` remains an implementation/deployment concern
until a dedicated architecture decision changes it. It must not produce a
fragmented user experience or require the product to be designed twice.

## Not decided here

This document does not define:

- sitemap, navigation or screen layout;
- visual direction, graphics or copy;
- the complete Member, Leader or Technician permission catalog;
- ordering of implementation slices;
- session-sharing implementation between technical frontend deployments.

Those decisions follow the ordered product workflow in
[WEB_PRODUCT_DESIGN_AND_DELIVERY.md](WEB_PRODUCT_DESIGN_AND_DELIVERY.md).
