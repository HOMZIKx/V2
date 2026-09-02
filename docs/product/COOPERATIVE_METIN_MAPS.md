# Cooperative Metin maps and live hunt sessions

- **Status:** OWNER ACCEPTED / DETAILS OPEN
- **Date:** 2026-09-02
- **Decisions:** D-048, D-059
- **Scope:** member Web, map-session SpawnTimers, events overlay and approved realtime transport

## Objective

The platform includes a practical companion for people hunting Metins together.
Authorized maintainers upload and configure game maps. Players select a map,
form or join a hunting party and share live map state while playing.

This feature extends the earlier map and Events direction, but its boss/Metin
respawns use a dedicated map-session `SpawnTimer` domain. It must never reuse
private character book/biologist timers or private team-action records. Shared
infrastructure primitives are allowed; data ownership, configuration,
membership and permissions remain separate.

## Core player flow

1. A player selects a configured map and, where relevant, a channel.
2. The player creates or joins a live hunt session with a party.
3. Participants see the same map and current markers in realtime.
4. A participant clicks the map or a configured spawn point to report a Metin.
5. The report shows its current field status, author and timestamp.
6. Marking a target as killed starts or updates its respawn timer.
7. Every connected participant receives the new marker and timer state without
   manually refreshing the page.

The map is a coordination aid. It is not an authoritative representation of the
game server and must show when information is old or uncertain.

## Configuration

Maps are uploaded by a capability-protected maintainer rather than hard-coded
into the frontend. Configuration may include:

- map image and display name;
- image dimensions and coordinate system;
- configured Metin or boss types;
- optional known spawn points or zones;
- default respawn range or timer configuration per target;
- channels available for the map;
- stale-state and expiry rules.

The backend owns configuration validation. Replacing a map image must preserve
or explicitly migrate existing marker coordinates.

## Live hunt session

A live hunt session has at least:

- selected map and optional channel;
- participating Discord-authenticated users;
- lifecycle state and last activity;
- shared target reports and timers;
- a realtime subscription scope.

The first design target is a party session: people intentionally hunting
together see and change the same state. Whether sessions may also be guild-wide,
discoverable or private-by-invite remains an explicit product decision; it must
not be inferred from a Discord rank.

## Reports and quick statuses

A target report records the target, map position, map/channel context, status,
reporter and server timestamp. Fast field statuses preserve the earlier timer
direction:

- **Pusto**;
- **Widziany**;
- **W trakcie**;
- **Ubity**;
- **Konkurencja**;
- **Niepewne**.

Clicking an existing marker opens concise actions instead of a large form.
Repeated reports update the shared event history rather than silently erasing
who reported what. Old or uncertain information visually expires.

## SpawnTimers and phases

A confirmed killed-target report starts or updates a session-scoped `SpawnTimer`.
Respawn timing is configured per map/target/session, not embedded in the map UI
and not inherited from a player's private team. The presentation may use
the previously defined phases:

- **Za wcześnie**;
- **Przygotuj się**;
- **Najlepszy moment**;
- **Końcówka**;
- **Niepewne**.

Where historical observations are later used to estimate respawns, the system
may expose sample count, median/range and confidence. Definitions and estimates
remain editable by authorized map maintainers and are versioned for Project Hard.

## Events and calendar

A game event is an organizational overlay on an existing target/timer, not a
separate event world. Organized hunts, guild events and non-game organizational
events remain in the shared Events/calendar capability with common reminders.

A SpawnTimer can remain informational, be attached to an organized hunt party
or support an approved public guild event without duplicating map/target data.
The calendar/reminder delivery service may be shared, but the record remains a
map-session SpawnTimer.

## Realtime and concurrency

- The server is authoritative for reports, timestamps and timer transitions.
- WebSocket or SSE may deliver session updates according to the repository's
  approved realtime constraints.
- Reconnect restores the current session snapshot and subsequent events.
- Duplicate clicks and retries must be idempotent where they start or update a
  timer.
- Conflicting reports remain understandable through timestamps, authorship and
  history instead of last-write ambiguity.

## Boundary from private player teams

- A player may join a hunt without joining another person's equipment team.
- Starting a hunt from a private team creates a separate participant/access list.
- Map notification settings do not change book/biologist/team-action reminders.
- Team removal does not automatically rewrite unrelated hunt history.
- The complete boundary is defined in
  [TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES](TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md).

## Permissions and privacy

- Platform access rules still apply.
- Map configuration requires an explicit capability such as `maps.manage`.
- Joining, viewing and reporting require session-scoped capabilities.
- Guild Leader or Technician status does not automatically open a private party
  session unless the approved Authorization policy grants that scope.
- All mutations are auditable at the operational level.

## Design requirements

The member experience must make the shared state readable during play:

- the map remains the dominant surface;
- party presence, selected map/channel and next relevant timers stay visible;
- adding or updating a marker takes very few actions;
- another participant sees the result immediately;
- marker meaning never depends on color alone;
- mobile offers large targets and a tap flow equivalent to desktop clicking;
- stale, disconnected and denied states are explicit.

## Open decisions before production implementation

- default session visibility and invite/join flow;
- exact role/capability assignment for map upload and editing;
- whether channel is mandatory or optional per map;
- exact marker clustering and overlap behavior;
- anti-spam/rate limits and correction rules;
- which existing legacy map/timer components and data can be reused after
  repository inventory;
- final map assets and server-specific timer catalog.

These details are resolved during the map slice. They do not block adding the
module to the product map or continuing the private-team slice.
