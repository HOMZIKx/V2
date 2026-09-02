# Player teams and Discord activity visibility

- **Status:** OWNER ACCEPTED
- **Date:** 2026-09-02
- **Decisions:** D-040, D-041

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

- whether a character may belong to more than one team;
- edit versus read-only team permissions;
- whether members see their own detailed analytics or own position outside TOP
  10;
- exact ranking periods and metric catalog;
- retention periods and anonymization after leaving the guild;
- product screens, navigation and visual design.
