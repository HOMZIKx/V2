# Player teams and Discord activity visibility

- **Status:** OWNER ACCEPTED
- **Date:** 2026-09-02
- **Decisions:** D-040, D-041, D-042, D-043, D-044

## Two separate data domains

The product must not mix private player/team tools with guild Discord analytics.

1. **Player and team workspace:** private character-management data used by a
   small, explicitly formed group.
2. **Guild Discord analytics:** activity measured by the bot for the approved
   guild Discord environment.

Leader access to guild analytics does not grant access to private player/team
equipment, timers or notes.

## Private player teams

The platform supports a team of several people jointly operating or developing
several characters.

A team:

- is created explicitly by a user;
- contains explicitly invited Discord-authenticated users;
- may contain multiple characters;
- provides a shared workspace for the team's character data;
- is not inferred from a guild rank, Discord channel or general guild
  membership;
- is invisible to other guild members unless the team explicitly shares a
  future public field.

The exact invitation flow, team roles and character ownership/editing rules are
not decided in this document.

## Team capability model

The first product scope has exactly two team roles:

### Team Owner

- creates the team;
- invites and removes team members;
- adds and removes characters from the team;
- manages the team itself.

### Team Member

- views every character shared with that team;
- edits shared character data, equipment, timers, tasks and notes;
- cannot manage team membership or delete/manage the team itself.

There is no viewer/observer role or additional team hierarchy in the first
scope. Guild Leader, Technician and platform access roles do not replace these
explicit team roles.

## Character boards are flexible planning notes

A “character” in this product is a user-created workspace card, not an
authoritative game-account entity.

A character board may represent:

- a character that already exists in the game;
- a planned future character;
- a hypothetical build used for theorycrafting;
- an equipment target or alternative setup;
- any other visual planning note useful to the player or team.

The platform does not verify the character against the game and does not require
proof of ownership. Character name, account ownership and in-game existence are
not identity or access-control inputs.

Users may create private character boards. Team members may create and
collaborate on character boards inside their shared workspace.

The product must not impose:

- global character-name uniqueness;
- a “one character belongs to one team” rule;
- a requirement that the character exists in the game;
- rigid account/character ownership semantics that do not help planning.

The purpose is practical support: visual equipment notes, current and target
builds, timers, tasks, goals and team coordination. Structure should guide the
user without preventing free-form planning.

## Lightweight character and equipment workspace

This workspace is a loose aid for people playing together. It is not an
authoritative inventory, ownership, lending or item-transfer system.

### Equipment cards and location notes

Users may create visual equipment cards and place them in current, target or
custom character layouts. A card may contain a name, image, enhancement level,
bonuses, tags and free-form notes.

The current location is a practical note such as a character, storage, account
or any user-entered label. Changing it means only “we noted where the item is
now”. It does not model a transfer between people and does not require a
recipient, acceptance, confirmation or proof of custody.

If useful, a card may be marked “borrowed” with a free-form player nickname.
This is only an optional annotation on the item card, not a separate lending
workflow.

The interface should make it easy to search cards and see their current noted
location without turning this feature into formal stock control.

### Timers

The workspace provides configurable timers for repeated game actions, including
book reading, horse medals and user-defined activities. A timer records the
last completion, calculates the next available time and can be restarted with a
simple “done now” action.

Timer names and durations must remain configurable rather than hard-coded.
Reminders may be shown in the product and, when integrated, sent through the
approved Discord notification flow.

### Notes and requests

Players may add simple internal notes or requests connected to a character,
equipment card or the team workspace. A request may optionally name a team
member and have a lightweight status. This remains a coordination note, not a
formal ticketing system.

### Layouts and reusable templates

Character boards support current, target and freely named equipment layouts.
A team member may prepare a reusable character or build template, and another
member may copy it as the starting point for their own character board.

Copying a layout does not create or move real items. Hypothetical equipment may
be used freely for planning.

### Change history

The product keeps a readable history of relevant edits, including equipment
location-note changes, timer resets and board edits. Accidental changes should
be reversible where practical, and deletion should prefer archive/recovery over
irreversible removal.

The history supports cooperation and correcting mistakes. It is not evidence of
ownership, custody or an in-game transaction.

## Private team data

Private by default:

- characters assigned to the team;
- equipment and equipment plans;
- book-reading and other progression timers;
- team tasks, notes and internal planning;
- future character-development data classified as team-private.

Access is limited to the player or explicitly admitted team members. Leader,
Technician and ordinary guild membership do not bypass this boundary. Any future
exception requires an owner-approved product decision and auditable consent.

## Discord activity analytics

The analytics scope is the guild activity measured by the platform's Discord
bot, following the existing Statbot-like project direction.

Examples include categories such as:

- voice time and voice sessions;
- message counts;
- attendance and other Discord activity metrics supported by the bot;
- time-range and channel breakdowns where approved.

The final metric catalog, collection rules, retention and reporting contract
will be consolidated from existing project materials during Phase 1 inventory.
This document does not create a second analytics design.

## Visibility levels

### All eligible members

Every eligible platform member may see:

- public **TOP 10** ranking for each approved activity category;
- the period and metric definition used by that ranking;
- only the data required to understand the ranking.

A public ranking does not expose the full activity record of every member.

### Leader and above

Leader and higher capability groups may inspect complete per-member Discord
activity available to the analytics module, including approved totals,
breakdowns, sessions, attendance and time ranges.

This access applies only to Discord/guild operational analytics. It does not
open the user's private player-team workspace.

### Technician

Technician access alone does not grant detailed member analytics unless the same
person also has a Leader-or-higher capability.

## Content boundary

Message activity may be counted and aggregated, but message content is not
stored as part of the analytics product. Private messages are outside scope.
Detailed analytics means metadata, counts, sessions and approved breakdowns,
not a searchable archive of what users wrote.

## Backend enforcement and audit

- The backend enforces every visibility decision.
- UI hiding is not authorization.
- Detailed member inspection by Leader+ must be auditable.
- Team membership changes and access revocation must be auditable.
- Analytics and team data remain logically separated in contracts and
  permissions.

## Not decided here

- edit versus read-only team permissions;
- whether members see their own detailed analytics or own position outside TOP
  10;
- exact ranking periods and metric catalog;
- retention periods and anonymization after leaving the guild;
- product screens, navigation and visual design.
