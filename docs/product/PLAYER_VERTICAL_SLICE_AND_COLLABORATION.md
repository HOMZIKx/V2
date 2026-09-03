# First player vertical slice and collaboration contract

- **Status:** OWNER ACCEPTED / READY FOR PRODUCTION SHELL
- **Date:** 2026-09-02
- **Decisions:** D-049, D-050, D-051, D-055, D-056, D-057, D-058, D-059
- **Scope:** member Web, private player teams and Cursor integration contract

## Purpose

This document closes the first coherent player journey before additional
features are expanded. It converts the accepted product ideas into interaction
and concurrency rules that production frontend code and backend integration must
preserve.

The first slice is deliberately narrow:

```text
Member dashboard
  -> My teams
  -> Team workspace
  -> Character board
  -> Equipment / named sets
  -> Progression timers / team actions / notes
  -> Change history
```

Cooperative maps, the Discord-connected market, AI screenshot import, detailed
guild analytics and bot administration remain separate later slices. Their
future presence must not complicate this first journey.

## Product and visual baseline

The active member-Web direction is:

- exact product and guild name: **DESTILED**;
- user-provided cracked metallic `D` logo with a red/blue crystal;
- black base with deep crimson and electric blue used in balanced proportions;
- metallic silver as the structural neutral;
- authentic, owner-approved Metin2 class and item references rather than generic
  fantasy or random AI-generated characters;
- restrained motion that never blocks interaction and respects reduced-motion
  preferences.

Red is part of the brand, so error, danger and destructive meaning must also use
clear text and an icon. Meaning must never depend on red or blue alone.

The current interactive prototypes are design validation material. They become
production source only after the accepted slice is implemented in the repository
frontend stack; Cursor must not recreate them from screenshots.

## Core domain objects

The first slice treats the following as separate resources:

- `Team`;
- `TeamMember`;
- `CharacterBoard`;
- `EquipmentItem`;
- `EquipmentSet`;
- `EquipmentPlacement` with last-confirmed location;
- `CharacterProgressionTimer`;
- lightweight `TeamAction`;
- `ReminderPreference`;
- `TeamNote`;
- `ChangeEvent`;
- ephemeral `WorkspacePresence`.

This separation is important for simultaneous use. Two people editing different
items or timers must not lock the whole team or character board.

An equipment item remains one stable team resource. Placing it on a character or
returning it to the team library changes its last-confirmed placement note; it
does not delete and recreate the item, represent a verified in-game transfer or
claim live client knowledge. Named sets reference exact items or planned
requirements without duplicating them.

## Human interaction rules

### Team and character context

The active team and selected character remain visible while working. A user
should never have to guess which team's shared data is being changed.

Changing character does not discard unsaved multi-field edits. The product must
either save safely, ask before leaving or keep the draft until the user returns.

### Equipment

Desktop supports drag-and-drop. Mobile and keyboard use the equivalent sequence:

1. select an item;
2. choose a compatible destination slot;
3. see the resulting placement;
4. receive save or error feedback.

Dragging is an accelerator, not the only available interaction.

A compatible drop is optimistic only when the frontend can restore the previous
state after rejection. The server response is authoritative and returns the
resulting placement revision, including any displaced item.

An incompatible slot explains the correct destination without changing data.

The character flip is triggered only by an explicit control or a safe art area.
Slot clicks, item selection and dragging never flip the card accidentally.

### Manual item editing

Manual create/edit remains the primary path. The editor may contain name,
enhancement, type, image, bonuses, tags, location note and a free-form team note.

A multi-field item editor uses an explicit save action. Autosave is reserved for
small atomic actions where the result is immediately understandable, such as a
placement or timer command.

### Timers

Timer duration is configuration data, not hard-coded presentation logic.
“Done now” is a single idempotent command evaluated with server time. Repeating
the same request must not create multiple resets.

The UI shows who last changed a shared timer and when. A ready state is announced
with text as well as color.

### Notes

Character and team notes are lightweight coordination text, not tickets.
A shared note uses explicit save and a resource revision. If another member
changed the same note, the product shows both versions and never silently
overwrites either one.

### History and recovery

Relevant mutations create append-only history entries with actor, server
timestamp, resource and human-readable action. A correction creates a new
change; history is not rewritten.

Destructive removal uses archive/recovery where practical. Moving equipment or
correcting its noted location is not deletion.

## Simultaneous-use model

### Presence is not persistent data

Presence answers:

- who is currently in this team/character workspace;
- which resource a person is viewing or editing;
- whether the connection is live or reconnecting.

Presence is ephemeral and does not grant permission, create history or become a
business record.

### Resource-level edit lease

Opening a multi-field editor requests a short edit lease for that resource only.

Example: if Mako edits one armor, Mateusz can still:

- move a different weapon;
- edit another item;
- reset a timer;
- change the team note;
- inspect history.

The lease displays the editor and expiry/reconnect state. It must expire after
disconnect or inactivity and must never lock the entire character board.

Read access remains available while another member edits. The first scope does
not allow two independent item forms to silently save over one another.

### Revisions and conflict response

Every mutable shared resource exposes a monotonically changing revision or
equivalent version token. A mutation includes the revision it was based on.

If the revision is current, the server accepts the command and returns the new
resource state and revision.

If it is stale, the server rejects the write with a structured conflict
response containing the current server version and enough information to show
what changed. The frontend then offers a specific resolution such as:

- reload current values;
- copy the user's draft;
- compare and reapply selected fields where supported.

There is no global last-write-wins behavior for shared player data.

### Realtime delivery

The first slice needs a team/character scoped realtime subscription for:

- presence changes;
- resource-updated events;
- equipment placement changes;
- timer resets;
- note and character updates;
- archive/restore events.

REST/OpenAPI remains the mutation and snapshot contract. WebSocket or the
repository-approved realtime transport delivers presence and invalidation/event
messages. Reconnect first restores an authorized snapshot, then resumes events
from a cursor when supported.

The baseline does **not** require a CRDT library. These are structured,
low-contention resources and versioned commands are easier to reason about and
test. CRDTs may be reconsidered only if a later slice introduces true
simultaneous rich-text or free-form canvas editing.

### Idempotency and server authority

Placement changes, timer resets and other retried commands carry an operation
ID. Duplicate delivery returns the earlier result instead of applying the
action twice.

Server time, authorization, revisions and resulting placements are
authoritative. The interface may update optimistically but must roll back and
explain a rejection.

## Connection states

The workspace has explicit states:

- **connected:** realtime events and mutations operate normally;
- **reconnecting:** current data remains visible, presence is marked uncertain
  and unsafe mutations wait;
- **offline/unavailable:** shared mutations are disabled in the first scope and
  local drafts may be copied, but the UI never pretends that team data was
  saved;
- **access revoked:** private data is removed from the active view and the user
  is returned to an allowed destination.

Silent offline queues are intentionally excluded from the first slice because
they create difficult-to-explain conflicts for casual players.

## Permission boundary

Team roles remain Team Owner and Team Member.

- both may use shared character, equipment, timer and note tools;
- only Team Owner manages team membership and the team itself;
- guild Leader, Technician or Owner capability does not bypass a private team's
  explicit membership;
- backend authorization is checked for the initial snapshot, every mutation and
  every realtime subscription;
- removal from a team revokes the subscription and subsequent access.

Presence information is visible only inside the private team scope.

## Frontend adapter boundary

UI components do not call backend endpoints directly. The production frontend
slice consumes stable adapters with operations equivalent to:

- `listTeams()`;
- `getTeamWorkspace(teamId)`;
- `getCharacterBoard(teamId, characterId)`;
- `createEquipmentItem(...)`;
- `updateEquipmentItem(itemId, expectedRevision, ...)`;
- `moveEquipmentItem(itemId, destination, expectedRevision, operationId)`;
- `listEquipmentSets(characterId)`;
- `saveEquipmentSet(setId, expectedRevision, ...)`;
- `getSetReadiness(setId)`;
- `resetProgressionTimer(timerId, expectedRevision, operationId)`;
- `completeTeamAction(actionId, expectedRevision, operationId)`;
- `updateReminderPreference(...)`;
- `saveTeamNote(noteId, expectedRevision, ...)`;
- `archiveResource(resourceId, expectedRevision)`;
- `subscribeTeamWorkspace(teamId, cursor?)`.

Mock adapters and real adapters return the same domain states, including loading,
empty, denied, unavailable, stale-revision and reconnecting behavior.

Cursor may adapt endpoint names and transport details, but must preserve these
observable semantics.

## Acceptance scenarios

The slice is not complete until automated and manual tests cover at least:

1. a member opens only explicitly joined teams;
2. two members edit different items at the same time without blocking each
   other;
3. a second editor sees who holds the lease on the same item;
4. a stale same-resource save produces a visible conflict and loses no draft;
5. moving an item never causes it to disappear from both character and team
   library;
6. repeating a timer-reset operation does not reset it twice;
7. realtime changes appear for another connected team member;
8. reconnect restores the current snapshot and presence;
9. revoked team access closes the private subscription;
10. desktop drag-and-drop, mobile tap destination and keyboard operation reach
    the same result;
11. reduced-motion mode preserves the complete equipment/timer workflow;
12. loading, empty, denied, disconnected and server-error states remain
    understandable;
13. a named set distinguishes exact ready items, items recorded elsewhere,
    planned requirements, missing items and stale confirmations;
14. one user's private item proposal cannot silently modify the global catalog;
15. a Discord reminder changes shared state only after a human confirmation;
16. no map boss/Metin SpawnTimer appears in or mutates character progression.

The exact catalog layers, set readiness, Discord reminder flow and strict
separation from cooperative-map SpawnTimers are defined in
[TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES](TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md).

## Ordered implementation checkpoint

1. Freeze the accepted player flow and shared visual tokens.
2. Implement the production application shell and first slice with mock
   adapters in the repository's approved frontend stack.
3. Review the complete responsive slice with the owner.
4. Freeze user-facing behavior and provide Cursor the adapter/concurrency
   contract.
5. Cursor connects real Identity, Authorization, API, Discord-driven services
   and realtime transport.
6. Run concurrency, permission, reconnect and end-to-end tests before enabling
   additional member modules.
