# DESTILED V2 — CURRENT PRODUCT HANDOFF

Last updated: 2026-09-09
Primary deployment branch: `preview/destiled-web`

This file is the durable handoff for any agent/developer continuing the project. Read it before changing product logic.

## Operating rule
Do not treat a screen, HTTP 200, or green unit test as proof that a feature works end-to-end. For important flows verify UI -> API -> persistence -> reload/restart/deploy behavior and, where relevant, Discord runtime.

## AI quality dataset — EQ + Economy
Implemented and merged via PR #110. Purpose is dataset collection for later manual analysis, not automatic training.

- Scope only: EQ screenshot analysis and Economy drop screenshot analysis.
- Persist AI result, confidence, model, prompt/parser version, image SHA-256 + MIME + size.
- Do not store raw screenshots.
- Do not store plain Discord IDs; use pseudonymous/hash identity in the dataset.
- Each analysis gets an `analysisId`.
- User confirmation/correction must resolve exactly that analysis by `analysisId`; never guess the "latest" analysis.
- Store final output, `accepted/corrected/rejected`, and changed fields.
- Dataset must remain durable in PostgreSQL.
- UI requirement from 2026-09-09: every AI-powered user-facing function must be labelled `AI (beta)` and show a short warning that the result may be wrong and must be verified before saving.

## Generals / Metins / Party — current product requirements

### Supported hunts
- Legendary Metin every 6h: 00:00, 06:00, 12:00, 18:00.
- General every 4h from 00:00.
- Maps: Red Las, V1, V2.
- Red Las: Legendary Metin only, CH1-CH3.
- V1/V2: Legendary Metin CH1-CH3; Generals on all concrete channels supported by the map.
- One room per hunt, not one room per channel.
- Different hunts/threads must be fully independent. Selections, rooms, markers and status must not leak between hunts.
- Multiple hunts may run simultaneously.
- Quick statuses include at least `Zbity`, `potrzebny PvP`, DPS, buff.

### Channel handling and map colors
- A marker must always belong to one concrete channel.
- Never create a marker with channel `Wszystkie`.
- If a `Wszystkie` control remains, it may be a read-only display/filter for showing all channels together, not a channel used to create markers.
- Every concrete channel has a stable distinct color.
- Channel button, active marker, marker entry/list and marker tooltip must use the same channel color.
- Goal: user can understand the map by color without reading every label.
- Do not use channel colors that are too visually similar.

### Marker interaction
Each active marker needs:
- marker type,
- channel,
- creator,
- relative age (`X min temu`),
- action `Idę`,
- action `Zbite`.

`Idę`:
- marker remains active,
- mark the user who is going/claiming the marker,
- show a subtle bubble/label next to the marker (e.g. `Idę · Mateusz`) for the hunter and visible to the party,
- do not count it as a kill.

`Zbite`:
- marker disappears from active map,
- event goes to session history,
- increment `Zbić w sesji`/session kill count,
- retain who completed it and completion timestamp.

Live marker history display may show only recent entries (currently 60 minutes), but filtering the view must never delete persisted history.

### Party roles
Session members can have a role:
- `scout`
- `hunter` / `bijący`

Roles must be visible in the party UI and switchable during the session. Role switching must not create a new room/session or lose existing markers.

### Party -> Economy
Party/session screen needs a clear action such as:
- `Dodaj drop z tej sesji`
- or `Przejdź do ekonomii`

When entering Economy from a party session, prefill/pass useful context where available:
- session id,
- hunt/activity/source,
- map,
- channel,
- participants.
Do not force the user to re-enter data already known by the session.

## Economy — major navigation/data architecture change

Economy must no longer be only a child page of Team.

### Top-level navigation
Add a top-level `Ekonomia` entry in the main application navigation.
Inside Economy provide two clearly separated scopes:
- `Prywatna`
- `Zespołowa`

### Private Economy
This is personal data for the authenticated user.
- Each user has their own private economy.
- Never create one shared guild-wide personal economy.
- One user's private drops/costs/history/summary must not be visible to another ordinary user.
- Server-side ownership isolation is mandatory; hiding UI is not sufficient.
- Must persist server-side across reload/restart/deploy.

Expected private features may reuse the existing Economy UX: drops, costs, history, summaries, AI screenshot recognition.

### Team Economy
Team economy remains shared within the selected team/workspace with its existing team permissions.
- It must be distinct from private economy in routing, API/data scope and UI.
- Do not accidentally aggregate private entries into team totals or vice versa.
- Party/session links should normally open team economy when the session belongs to a team.

## UI/mobile issue visible on 2026-09-09 screenshot
The current Party view displayed `Wszystkie` alongside CH1-CH8 and text mixing current map/channel with party target. Review and simplify labels so the current view, hunt/session name, map and channel are not contradictory.

## Discord activity ranking requirement
- Destiled and Projekt Sojusz count messages/VC independently.
- Independent Top 10 per guild.
- No summing points across guilds.
- User sees ranking for the guild from which that activity originates.
- Frontend passes `guildId`; backend/runtime still requires end-to-end verification when touched.

## Team PW / timers
- New system only; do not restore legacy system.
- Team owner sets team-wide DM send time in Europe/Warsaw.
- War DM appears 30 minutes before war.
- User selects characters they bring; team members can see the selections in the DM/workflow.

## Technik access
- Server-side gating, not UI-only.
- `/api/technik/access` controls visibility/access.
- Ordinary members must be denied direct Technik routes/API.
- Admin IDs come from env config, not hard-coded Discord IDs.

## Working order for the current 2026-09-09 package
1. Add `AI (beta)` + wrong-result warning to EQ and Economy AI UI.
2. Refactor Party channel presentation and assign stable per-channel colors.
3. Make markers inherit channel colors everywhere.
4. Add marker age + `Idę` + `Zbite` behavior with persisted session events/count.
5. Add scout/hunter role switching.
6. Add Party -> Economy session link/context handoff.
7. Promote Economy to top-level navigation.
8. Split Economy into Private and Team scopes.
9. Add/verify server-side private-economy ownership isolation and persistence.
10. Run CI plus targeted runtime verification before merging to `preview/destiled-web`.

## Merge discipline
- Work on a dedicated branch/PR when multiple agents may be pushing concurrently.
- Rebase/refresh against the actual latest `preview/destiled-web` before final merge.
- Do not weaken regression tests to make CI pass.
- After merge, verify CI on the actual preview head, because concurrent commits can reveal integration errors not present in the PR branch.
