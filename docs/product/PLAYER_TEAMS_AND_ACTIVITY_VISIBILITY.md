# Player teams and Discord activity visibility

- **Status:** OWNER ACCEPTED
- **Date:** 2026-09-02
- **Decisions:** D-040, D-041, D-042, D-043, D-044, D-045, D-046, D-047

## Two separate data domains

The product must not mix private player/team tools with guild Discord analytics.

1. **Player and team workspace:** private character-management data used by a
   small, explicitly formed group.
2. **Guild Discord analytics:** activity measured by the bot for the approved
   guild Discord environment.

Leader access to guild analytics does not grant access to private player/team
equipment, timers or notes.

## First production player slice

The first closed player journey is:

`Member dashboard -> My teams -> Team workspace -> Character board ->
Equipment / timers / notes -> Change history`.

Its detailed human-interaction, realtime, conflict, responsive and adapter
contract is defined in
[PLAYER_VERTICAL_SLICE_AND_COLLABORATION](PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md).
Additional modules do not expand this slice until its production frontend and
integration boundary are accepted.

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

Team roles and editing rights are defined below. The remaining invitation UI
details and revocation copy are resolved inside the first player slice without
inferring access from a Discord guild rank.

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

### Two-sided fantasy character card

The selected character is presented as a designed fantasy trading-card-style
surface aligned with Metin2, not as a generic profile form.

The card uses a fixed, source-accurate character silhouette for the selected
Metin2 class. Generic AI-generated or merely similar fantasy characters are not
acceptable. The asset source and capture/preparation pipeline will be decided
before visual production, using owner-approved class references.

The character may have a subtle idle presentation such as gentle breathing,
small parallax, restrained light movement or an approved short loop. Motion must
not alter the source character, distract from equipment work or block users who
prefer reduced motion.

The card has two functional faces:

- **Front:** standing class character and the familiar functional Metin2-style
  equipment-slot area below it.
- **Back:** the character's configurable timers and their current states.

The transition is a polished card flip. Equipment slot interaction and dragging
must never trigger an accidental flip. The flip action is therefore attached to
the character/art area or an explicit affordance, with an equivalent accessible
control for keyboard and mobile use.

A central team item library remains the main working area. Manual item creation
is the primary and always-available path. Users may define an item's image, name,
enhancement level, bonuses and notes freely.

On desktop, equipment cards can be dragged between the central library, a
character's inventory and compatible equipment slots. The card persists after
the move. Mobile must provide an equivalent tap-and-select destination flow
rather than depend on precise drag-and-drop.

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

### AI-assisted screenshot import — later phase

AI-assisted import is an optional accelerator built after manual item creation
and editing work reliably. It is not a dependency of the initial equipment
workspace.

A user may upload one or multiple screenshots with a visible item tooltip. The
import process may extract the proposed item name, enhancement level, type,
requirements, bonuses and values into the normal item-card structure. Private
server terminology must remain editable and unknown lines may be preserved as
free-form data.

Every proposed item is shown in a review screen. The user can correct fields and
must explicitly confirm before the item is added. AI output is never committed
automatically as authoritative equipment data.

The preferred onboarding flow supports batch upload and review, with one visible
item tooltip per screenshot. A complete inventory screenshot without visible
tooltips cannot be expected to recover hidden bonuses.

Before implementation, the team must validate the approach on approximately
10–20 representative screenshots from the actual server, covering different
item categories, colors, resolutions and bonus layouts. Provider choice and
processing design follow that test; insufficient accuracy is a reason to defer
the feature without blocking manual equipment management.

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

### Simultaneous team use

Presence and persistent player data are separate. Members may work on different
items, timers and notes at the same time without locking the whole character.
Multi-field editing is protected per resource, mutations carry expected
revisions and a stale write produces a visible conflict instead of silently
overwriting another member.

The precise behavior, connection states, idempotency rules and acceptance
scenarios are specified in
[PLAYER_VERTICAL_SLICE_AND_COLLABORATION](PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md).

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

- whether members see their own detailed analytics or own position outside TOP
  10;
- exact ranking periods and metric catalog;
- retention periods and anonymization after leaving the guild;
- final invitation wording and notification channels.
