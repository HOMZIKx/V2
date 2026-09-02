# Team loadouts, progression and timer-domain boundaries

- **Status:** OWNER ACCEPTED / PRODUCT CONTRACT
- **Date:** 2026-09-02
- **Decisions:** D-055, D-056, D-057, D-058, D-059
- **Active game:** Project Hard
- **Active slice impact:** clarifies team EQ, sets and character progression
- **Later-slice boundary:** cooperative map hunt timers remain separate

## Outcome

DESTILED has two different kinds of cooperation that must not be collapsed into
one timer or team model.

### Private character workspace

A stable private team jointly manages:

- character boards;
- real and planned equipment cards;
- saved equipment sets/loadouts;
- last-confirmed equipment locations;
- book, horse, biologist and other character progression timers;
- team actions such as war preparation;
- assigned Discord reminders and completion status;
- notes and change history.

### Cooperative map hunt session

A separately configured session manages:

- chosen Project Hard map and optional channel;
- participating players for this hunt;
- boss/Metin marker definitions;
- live marker state and reports;
- respawn timers;
- session-specific visibility and notifications.

The two domains share V2 users, Discord delivery infrastructure and common
technical primitives such as server time, idempotency and realtime transport.
They do not share ownership, timer records, configuration, membership or
permissions.

## One private workspace model

Every first-slice character board belongs to one private `Team` workspace.

- A solo player starts with a one-member private workspace.
- Inviting others later does not migrate or copy character data.
- A recipient receives no private data until they explicitly accept.
- A team invitation does not itself grant platform admission.
- Removing a member immediately revokes snapshots, mutations and realtime
  subscriptions for that workspace.

The UI may present a one-member team as **My workspace**. This is presentation
only; the backend uses the same authorization and history model for solo and
shared use.

## Equipment model

The product must separate three concepts.

### ItemDefinition

Reusable Project Hard knowledge:

- name and aliases;
- item category and compatible slots;
- icon/reference image;
- allowed enhancement range;
- known fixed properties;
- known bonus names and possible values where a reliable source exists;
- source URL/note, definition revision and effective dates.

An ItemDefinition is not proof that a team owns an item.

### TeamEquipmentItem

A concrete or hypothetical card created inside one private workspace:

- optional ItemDefinition reference;
- owner-entered name when definition is missing;
- enhancement;
- exact observed bonuses;
- stones and other editable properties;
- image/screenshot evidence;
- tags and notes;
- current/target/hypothetical state;
- last-confirmed location;
- actor and time of the last location confirmation;
- revision and archive state.

A TeamEquipmentItem may be real, planned or fictional. The UI labels this state
instead of pretending to verify the game.

### EquipmentSet

A saved purpose-specific loadout for a character, for example:

- dungeon;
- war/PvP;
- experience/farming;
- boss/Metin;
- resistance target;
- a freely named build.

A set may mix:

- exact TeamEquipmentItem references for equipment the team tracks;
- requirement/placeholders for items that are planned or interchangeable;
- empty intentional slots.

Each slot can contain a note explaining the desired bonuses or purpose. A set
does not duplicate the referenced item and does not automatically move it.

## Set readiness

Opening a set compares its expected slots with the latest team notes.

Per slot, the product shows:

- **ready:** expected exact item is confirmed at the character/destination;
- **available elsewhere:** exact item exists but its noted location differs;
- **missing/unassigned:** requirement exists without an item;
- **stale:** the item's location has not been confirmed within a chosen period;
- **conflict:** the same exact tracked item is required simultaneously by another
  selected plan;
- **planned:** hypothetical item/requirement, not a real readiness claim.

This allows teammates to prepare a character when the usual operator is absent.
It remains a coordination aid, not automatic knowledge of the game client.

## Manual equipment movement

When a person physically moves EQ in Project Hard, DESTILED changes only after a
human confirmation.

Supported quick flow:

1. select the item or open the active set;
2. choose **Mark as moved**;
3. choose or enter the new character/account/storage label;
4. review displaced or conflicting tracked items;
5. confirm;
6. save actor, server time, previous value and new value in history;
7. notify only team members who subscribed to relevant equipment changes.

The interface must say **last confirmed location**, not imply live inventory.

Bot shortcuts may open the Web action or use a constrained selection. A free-form
Discord message is never parsed as an authoritative movement unless the user
reviews and confirms the resulting command.

## Layered Project Hard item catalog

The screenshot conversation proposes that one entered item should help future
users. The useful part is retained, but unreviewed private input must not mutate
the global catalog.

### Layer 1 — sourced Project Hard catalog

Definitions imported or manually entered from reliable Project Hard sources,
including official patch notes and the server's in-game Wikipedia where
practically accessible.

Project Hard patch notes confirm that new weapons are added to its server
Wikipedia and that mechanics/bonuses change over time. The catalog therefore
stores sources and effective revisions; it is never a timeless copied table.

Initial official references include:

- https://projekt-hard.eu/posts/27
- https://projekt-hard.eu/posts/30
- https://projekt-hard.eu/posts/20?lang=pl

There is no assumption that the in-game Wikipedia exposes a public API.

### Layer 2 — DESTILED curated definitions

A proposed definition or correction reviewed by an authorized catalog curator.
Promotion records:

- proposer;
- reviewer;
- evidence;
- duplicate/alias resolution;
- revision;
- approval time.

### Layer 3 — private team definitions

Immediately usable custom items and bonuses visible only in that private
workspace. They can be proposed for curation but remain private until approved.

### AI rule

Screenshot recognition may:

- match an existing definition;
- create an editable private proposal;
- suggest an alias or correction;
- mark an unknown bonus line.

It may never silently create or modify a global definition. Human review is
mandatory because one incorrect recognition would otherwise poison every later
set and analysis.

## Character progression timers

A `CharacterProgressionTimer` belongs to a private workspace and character.

Examples:

- skill book;
- horse medal/action;
- biologist action;
- user-defined repeated activity.

It records:

- configurable name and duration;
- character;
- optional responsible member;
- last human-confirmed completion;
- next-ready time calculated from server time;
- reminder policy;
- current revision;
- completion history.

**Done now** is an idempotent human command. A notification never resets the timer.

## Team actions and Discord reminders

Not every reminder is a repeating timer. A `TeamAction` covers scheduled,
assigned cooperation such as:

- preparing war equipment/bonuses;
- checking a character before an event;
- completing a planned group action;
- moving a named set;
- another lightweight team request.

A TeamAction contains:

- workspace and optional character/set;
- description;
- responsible member(s);
- due time or trigger;
- status: `OPEN`, `DUE`, `DONE`, `SKIPPED`, `CANCELLED`;
- reminder and escalation policy;
- completion actor/time;
- history.

### Discord delivery

The responsible member may receive a private bot message with constrained
actions:

- **Done**;
- **Snooze**;
- **Cannot do**;
- **Open in DESTILED**.

Rules:

1. The team sees **done** only after a human confirmation.
2. The bot does not infer completion from Discord or game activity.
3. Reminders are deduplicated and rate-limited.
4. Each member can set quiet hours and disable optional classes of reminders.
5. An overdue action may notify the selected team audience only according to the
   team's explicit configuration.
6. Repeated clicks use one operation ID and never create duplicate completions.
7. Removal from the team cancels future private delivery from that workspace.

This is a lightweight coordination checklist. It does not become a general
project-management system in the first slice.

## Cooperative map hunt timers — separate domain

A map hunt uses different objects:

- `MapDefinition`;
- `SpawnTargetDefinition`;
- `HuntSession`;
- `HuntParticipant`;
- `MapMarker`;
- `TargetReport`;
- `SpawnTimer`;
- `HuntNotificationPolicy`.

Configuration is independent per map/session:

- boss/Metin types;
- marker positions;
- channel use;
- respawn duration or range;
- report statuses;
- participant/join rules;
- notification audience;
- session lifetime and visibility.

A `SpawnTimer` begins from a confirmed hunt report such as **killed now**. It
does not appear among character book/biologist timers and cannot reset them.

A person may join a hunt without joining another person's equipment team. A
private equipment team may start a hunt, but the hunt receives its own
participant list and access scope.

Project Hard itself demonstrates why this configuration is separate and
versioned: official notes changed a fixed boss respawn and added special Metins
with two-hour respawns across selected maps/channels:
https://projekt-hard.eu/posts/27

## Dungeon analyzer boundary

A dungeon run may use a private team as a convenient starting participant list,
but it remains a `DungeonRun` record. It does not reuse:

- CharacterProgressionTimer;
- TeamAction;
- SpawnTimer;
- MapMarker.

This preserves clear analytics and avoids a single ambiguous “timer” table.

## Contract and namespace boundary

Equivalent API/adapter areas remain separate:

- `teams/{teamId}/equipment`;
- `teams/{teamId}/sets`;
- `teams/{teamId}/characters/{characterId}/progression-timers`;
- `teams/{teamId}/actions`;
- `catalog/project-hard/items`;
- `hunt-sessions/{sessionId}/markers`;
- `hunt-sessions/{sessionId}/spawn-timers`;
- `dungeon-runs/{runId}`.

Exact endpoint names may change, but ownership and observable behavior may not
collapse.

## Concurrency rules

- exact item placement uses expected revision and idempotent operation ID;
- set editing leases only that set;
- progression timer reset leases no whole character and is idempotent;
- TeamAction completion is idempotent;
- marker reports and SpawnTimer transitions are session-scoped;
- realtime events carry the correct domain and scope;
- clients never accept a team event as a map-session event merely because the
  same user generated both.

## First-slice impact

The approved production player slice now includes, behind mock adapters:

- one-member/shared workspace model;
- accepted invitations;
- equipment cards and last-confirmed locations;
- named equipment sets;
- basic readiness states;
- character progression timers;
- lightweight TeamActions and reminder preferences;
- visible history and simultaneous-use states.

Actual Discord DM delivery is connected later by Cursor through the approved bot
and notification infrastructure. The frontend designs all delivery, opt-out,
failure and confirmation states now.

Cooperative map markers and SpawnTimers remain a later independent vertical
slice.

## Acceptance scenarios

1. A solo workspace becomes shared after an accepted invitation without moving
   its characters or equipment.
2. A team member saves a dungeon/PvP set containing exact and planned items.
3. Another member can see what to equip and which exact item is recorded elsewhere.
4. A manual movement updates one stable item and leaves an append-only history.
5. A stale location is visibly different from a live fact.
6. An unrecognized screenshot creates only a private editable proposal.
7. One team member cannot change the global catalog for everybody.
8. A curator can promote a sourced proposal without rewriting private history.
9. A book timer sends a reminder but changes only after **Done**.
10. The team sees a confirmed action status without receiving duplicate notices.
11. A hunt participant starts a boss/Metin SpawnTimer without affecting any
    character timer.
12. A map session uses its own participant list, configuration and permissions.
13. Removing a team member revokes team reminders but does not silently remove
    their unrelated hunt-session state.
