# First player journey coherence review

- **Status:** OWNER ACCEPTED / READY FOR PRODUCTION SHELL
- **Date:** 2026-09-02
- **Scope:** first member-Web production slice
- **Depends on:** D-038–D-059
- **Does not start:** maps, market, AI import, dungeon analyzer, guild analytics or bot administration

## Review outcome

The owner accepted the coherence checkpoint. The first player slice is ready to
move into the production application shell. It must be experienced as one continuous
workspace rather than a collection of unrelated pages.

The usable path is:

`Discord entry → Member home → Workspace → Character → EQ / Sets → Progression / Team actions / Notes → History`

The next implementation must solve the complete path, including first use,
mobile operation, conflicts and loss of access. A polished happy-path mock alone
is not an acceptable production shell.

## Consolidated product rules

### One workspace ownership model

Every character board in the first slice belongs to a private `Team` workspace.

A person working alone receives the same model as a group: a private workspace
with one member. They can invite teammates later without migrating characters,
equipment, timers, notes or history into a different ownership model.

The UI may call this **My workspace** for a solo user and **Team workspace** after
other people join. The backend boundary remains one private team resource. This
avoids two competing authorization, history and realtime models.

### Invitations require acceptance

A team invitation does not immediately expose private data.

1. A Team Owner selects or enters the intended Discord identity.
2. The system shows the resolved Discord display identity for confirmation.
3. The invitation is created without granting workspace access.
4. The recipient accepts after Discord authentication.
5. Acceptance creates `TeamMember`, grants the scoped subscription and records
   an audit event.
6. Decline, expiry or owner cancellation grants no access.

Inviting a person does not automatically grant platform admission. The recipient
must independently satisfy the approved Discord membership rule or owner
allowlist.

### No secret-account workflow

Character and equipment notes never request Project Hard login, password, PIN,
email code, recovery code, cookie or client token. Likely secret values are
rejected with a direct explanation. Safe account labels remain a later optional
metadata feature.

## Primary journey

### 1. Discord entry

The user chooses **Continue with Discord**.

Possible outcomes:

- eligible membership/allowlist → enter the product;
- OAuth cancelled → return to a retryable entry state;
- Discord unavailable → preserve the intended destination and offer retry;
- authenticated but ineligible → explain that the tool is private and identify
  the owner as the person who grants access, without leaking guild configuration;
- access revoked during an existing session → close private subscriptions, clear
  private workspace state and return to an allowed destination.

Discord OAuth is the identity proof. The product never asks a user to type their
Discord ID as proof.

Reference: https://docs.discord.com/developers/topics/oauth2

### 2. Member home

The home answers three questions immediately:

- What needs my attention?
- Which workspace/character was I using?
- What can I do next?

The first-slice home contains only:

- ready or overdue timers across accessible workspaces;
- recent team changes relevant to the user;
- current invitations;
- last-opened workspace/character;
- create workspace action.

Later modules may add their own summaries without replacing these priorities.

### 3. First-use state

A new eligible user with no workspaces sees two clear paths:

- **Create my workspace**;
- **Accept invitation**, when an invitation exists.

Creating a workspace asks only for a name. Optional description, icon and member
invites follow after creation. Do not place character, team, permission and visual
configuration into one onboarding form.

After creation the next action is **Add first character**.

### 4. Workspace

The workspace always shows:

- active workspace identity;
- whether it is private solo or shared;
- member presence and connection state;
- character list;
- equipment library summary/search;
- ready timers;
- lightweight team note;
- recent changes.

Team management is visible only to Team Owner. It does not displace daily player
tools.

Empty workspace priority:

1. add first character;
2. optionally invite teammate;
3. optionally add an equipment item.

### 5. Character creation

Minimum required input:

- display name;
- Project Hard class/archetype reference.

Everything else is optional or can be added later:

- level;
- build/purpose;
- visual variant from owner-approved assets;
- notes;
- copied template.

A character may be real, planned or hypothetical. Creation copy must not imply
verification against Project Hard.

### 6. Character board

The selected workspace and character remain visible at all times.

The board exposes three daily tools without losing context:

- equipment;
- timers;
- notes/history.

The fantasy card is presentation around these tools, not a navigation trap.
Flipping the card is explicit. Equipment interactions never trigger the flip.

### 7. Equipment

The central library is the stable source of team item cards. A placement changes
an item's noted destination; it does not duplicate, destroy or prove an in-game
transfer.

Desktop:

- drag and drop is an accelerator;
- item selection exposes the same destination action;
- the inspector/edit form is explicit-save.

Touch and keyboard:

- select item;
- choose **Move/place**;
- choose a compatible destination;
- review the result;
- receive saved, rejected or conflict feedback.

This direct alternative is required because a web product must not rely only on
dragging. WCAG 2.2 SC 2.5.7 explicitly requires a non-drag single-pointer path:
https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html

Important touch controls target at least 44×44 CSS px in this product. The WCAG
2.2 Level AA floor is 24×24 px or sufficient spacing:
https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

### 8. Timers

Timer cards show:

- action name;
- character;
- ready/in-progress state in text;
- exact next-ready time;
- remaining duration;
- last confirmation actor and time;
- **Done now**;
- reminder setting when Discord delivery exists.

`Done now` is immediate and idempotent. Editing timer name/duration is an
explicit-save form. A reminder does not confirm the game action automatically.

### 9. Notes

There are two lightweight note scopes:

- character note;
- workspace note.

A note is one explicit-save resource with author/time/revision. An optional
mention/request may point at a teammate, but the first slice does not become a
ticket system.

### 10. History

History answers who changed what and when.

It includes:

- item created/edited/archived/restored;
- placement/location note changed;
- timer created/edited/reset;
- note changed;
- character created/edited/archived/restored;
- membership accepted/removed.

A filter may narrow by character, resource and actor. History is append-only; a
correction creates a new entry.

## Screen-state matrix

| Surface           | Loading                   | Empty                            | Reconnecting/offline                                                      | Denied/revoked                  | Conflict/error                                |
| ----------------- | ------------------------- | -------------------------------- | ------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| Entry             | progress and cancel path  | not applicable                   | retry Discord, preserve destination                                       | private-tool explanation        | stable error code and retry                   |
| Member home       | skeleton of known regions | create workspace / accept invite | cached labels may remain; no false live state                             | return to entry/allowed area    | retry each failed region                      |
| Workspace list    | stable card skeletons     | first-use path                   | show last snapshot as stale                                               | remove inaccessible card        | per-card retry                                |
| Workspace         | retain context header     | add first character              | data visible as stale; shared writes disabled                             | clear private data and redirect | failed region does not blank all              |
| Character board   | card/toolbar skeleton     | add first item/timer/note        | drafts copyable; no false saved state                                     | remove board and redirect       | rollback atomic action or preserve form draft |
| Equipment library | stable grid/list skeleton | explain and add item             | search snapshot allowed; moves disabled                                   | clear private items             | source/destination restored after rejection   |
| Timer side        | skeleton with labels      | add timer                        | countdown may display from last snapshot but marked stale; reset disabled | clear timers                    | duplicate reset returns prior result          |
| Notes             | preserve local draft      | helpful prompt                   | copy draft; save disabled                                                 | clear draft on revoke           | compare current and draft                     |
| History           | ordered skeleton          | no changes yet                   | last snapshot marked stale                                                | clear private entries           | retry pagination/filter                       |

## Simultaneous-use review

### Different resources

Two members may edit different items, timers or notes without blocking the
workspace. Realtime updates the affected resource and a small activity signal;
it does not interrupt unrelated forms.

### Same resource

When one member opens a multi-field editor, another sees who is editing and may
continue reading. A stale save never wins silently.

The second editor may:

- wait for the lease;
- copy values;
- reopen after expiry;
- compare their draft with the current server version.

### Atomic actions

Item placement and timer reset are optimistic only when rollback is reliable.
The UI shows a short pending state. Retry uses the same operation ID.

### Reconnect

1. Mark presence as uncertain.
2. Pause shared mutations.
3. Retain visible data and local explicit-save drafts.
4. Restore an authorized snapshot.
5. Resume events from a cursor if supported.
6. Reconcile or show a conflict before enabling writes.

There is no invisible offline mutation queue in the first slice.

## Responsive behavior

### Phone

- one primary content region at a time;
- persistent workspace/character context;
- item details and destination choices use a sheet/full-height panel;
- no precision dragging requirement;
- large touch controls and clear back behavior;
- card motion reduced when it competes with scrolling or selection;
- pending/conflict feedback stays attached to the affected resource.

### Tablet

- workspace/character list may remain beside the active tool when space permits;
- item library and character destination can be visible together;
- editing remains one resource at a time.

### Desktop

- library, active character destination and inspector may coexist;
- panels must collapse without losing selected item or draft;
- drag and drop plus click destination are both present;
- presence never obscures controls.

Responsive behavior changes layout, not permissions or available outcomes.

## Motion and visual safety

- honor `prefers-reduced-motion`;
- card flip has a non-animated state change alternative;
- no flashing logo, particles or idle animation near active fields;
- red/blue never carry status meaning without icon and text;
- source-accurate class assets are decorative around semantic controls;
- the functional equipment structure remains readable without the character art.

## Findings closed by this review

1. Solo and group characters use one workspace/team ownership model.
2. Team invitations require recipient acceptance.
3. Platform admission and team invitation remain independent checks.
4. First-use onboarding is split into workspace creation, then character creation.
5. The member home contains only first-slice priorities.
6. Mobile equipment operation is complete without drag and drop.
7. Every surface has loading, empty, disconnected, denied and conflict behavior.
8. Reconnect never pretends an unsaved team mutation succeeded.
9. Private data is cleared from active memory after access revocation.
10. The first slice never handles Project Hard account secrets.
11. A solo workspace and shared team use one ownership model; invitations require acceptance.
12. Named equipment sets show exact, planned, missing and last-confirmed items.
13. Character progression timers and lightweight assigned team actions share the private workspace.
14. Map hunt SpawnTimers remain a separate later domain with independent configuration.

## Deliberately later

- cooperative maps and Metin sessions;
- Project Hard dungeon analyzer;
- AI equipment/drop recognition;
- Discord-connected market;
- detailed Discord analytics;
- guild administration and bot configuration;
- advanced project/task management beyond lightweight team actions;
- public character/build sharing;
- automated Project Hard/client integration.

## Production-shell gate

The owner accepted this coherence checkpoint. The slice may enter production
frontend implementation.

The production shell then implements, behind mock adapters:

1. Discord entry states;
2. unified authenticated shell and permission-aware navigation;
3. member home;
4. solo/shared workspace model;
5. character board;
6. equipment library, placement and named set readiness;
7. character progression timers and lightweight team actions;
8. reminder preferences and mock Discord delivery states;
9. notes and history;
10. all state-matrix outcomes;
11. responsive and reduced-motion behavior.

The detailed loadout, reminder and timer-domain contract is defined in
[TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES](TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md).

Cursor still does not implement or redesign this UI. Cursor receives the approved
frontend code and adapters only after the production slice is reviewed and
frozen.
