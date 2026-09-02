# Project Hard dungeon run analyzer

- **Status:** OWNER DIRECTION CAPTURED / LATER PLAYER SLICE
- **Date:** 2026-09-02
- **Decisions:** D-052, D-053, D-054
- **Game context:** Project Hard
- **Privacy boundary:** private team workspace
- **Delivery boundary:** do not implement before the first player vertical slice is stable

## Objective

Give a private team a lightweight record of its Project Hard dungeon runs. A run
combines participants, characters, duration, screenshots, recognized and corrected
loot, prices, costs and notes. The product calculates transparent results and
builds useful team analytics without pretending to be connected to the game
client.

This is a cooperative notebook and analysis tool. It is not an anti-cheat tool,
a verified game ledger or an automatic Project Hard integration.

## Product Hard is the active game context

The initial catalog and terminology are prepared for **Project Hard**, not for
generic Metin2. However, dungeon names, entry rules, drops, limits and prices
must remain configuration data rather than frontend or service constants.

Official Project Hard patch notes show that gameplay rules change over time,
including dungeon level requirements, Yang and equipment drops, entry costs,
spawn behavior and weekly equipment limits. Every maintained game definition
therefore needs:

- a stable internal identifier;
- display name and optional difficulty;
- source URL and short source note;
- `effectiveFrom` and optional `effectiveTo`;
- definition revision;
- optional owner/team override;
- archival instead of destructive replacement.

Initial reference sources:

- https://projekt-hard.eu/?lang=pl
- https://projekt-hard.eu/posts/20?lang=pl
- https://projekt-hard.eu/posts/21?lang=pl
- https://projekt-hard.eu/posts/25?lang=en

A patch-note change creates a new effective revision. It must not rewrite the
meaning of already finalized historical runs.

## Scope boundary

### Included in the first analyzer slice

- manual start and finish of a run;
- Project Hard dungeon selection from a configurable catalog;
- private-team participant and character selection;
- one or more source screenshots;
- screenshot-assisted loot proposals;
- human review and correction before saving;
- manual loot entry as a permanent fallback;
- quantities, prices and explicit costs;
- duration and notes;
- gross value, total costs, net result and result per hour;
- run history and basic aggregate analysis;
- visible source, confidence and correction history;
- Discord bot shortcuts and reminders where they reduce manual work.

### Deferred

- automatic observation of the game client;
- automatic reading of Project Hard network traffic, memory or files;
- automated market scraping;
- predictive price recommendations;
- automatic profit sharing or settlements;
- guild-wide comparison of private teams;
- advanced OCR training UI;
- external export and accounting;
- public leaderboards based on dungeon income.

## Core workflow

1. A team member chooses **Start dungeon** in Web or a Discord command/button.
2. They select dungeon, optional difficulty, characters and expected participants.
3. The system records the start time and creates one shared draft.
4. Another team member may join or be added. A Discord voice-channel suggestion
   may be offered, but it always requires confirmation: presence in voice is not
   proof of participation.
5. A member finishes the run or enters duration manually.
6. Members upload one or more Project Hard screenshots of the drop/result.
7. The analyzer creates editable loot proposals with confidence and screenshot
   provenance.
8. A human confirms, corrects, removes or merges proposed entries.
9. Prices and costs are completed from a private team price book or manually.
10. A member reviews the summary and finalizes the run.
11. Finalization freezes price and optional exchange-rate snapshots and updates
    analytics.
12. A finalized run can be reopened only as an explicit correction, with an
    audit entry and recalculation.

## Run lifecycle

`DRAFT → OCR_REVIEW → READY_TO_FINALIZE → FINALIZED → REOPENED`

- **DRAFT:** participants, duration, screenshots and manual data may change.
- **OCR_REVIEW:** at least one image result awaits human confirmation.
- **READY_TO_FINALIZE:** no unresolved recognition entries or invalid money rows.
- **FINALIZED:** immutable snapshot for ordinary editing and included in analytics.
- **REOPENED:** visible correction flow; never silently edits history.

A run may be cancelled. Cancelled drafts remain recoverable for a short retention
period and are excluded from analytics.

## Screenshot-assisted import

AI/OCR is an input assistant, not the source of truth.

For every uploaded screenshot, retain:

- original private file reference;
- uploader and upload time;
- file hash;
- recognition model/parser version;
- recognized region and raw proposal;
- confidence per entry;
- final human correction;
- link from each accepted item row to its source.

Rules:

1. Low-confidence or unknown items are never silently accepted.
2. The user must be able to inspect the source image beside the proposal.
3. Duplicate upload hashes warn before import.
4. Overlapping item proposals across screenshots are flagged for merge review.
5. Quantities, item variants and upgrade levels are explicit fields.
6. A corrected value is never overwritten by a later recognition retry.
7. Manual entry is always available.
8. The initial parser is validated on at least 10–20 real Project Hard examples
   covering different resolutions, UI scales and dungeon/drop presentations
   before it can be labeled reliable.

The interface must clearly distinguish:

- recognized;
- recognized with low confidence;
- manually entered;
- manually corrected;
- unresolved.

## Data model

### DungeonDefinition

- `id`, `slug`, `displayName`, `difficulty`;
- optional level/entry and weekly-limit hints;
- source and effective revision fields;
- active/archive state.

### DungeonRun

- `id`, `teamId`, `dungeonDefinitionRevisionId`;
- status and expected revision;
- started/finished timestamps and effective duration;
- created by, finalized by and correction metadata;
- notes and optional tags;
- price-book snapshot and exchange-rate snapshot identifiers.

### DungeonParticipant

- run, V2 user and Discord identity reference;
- selected team character(s);
- participation note;
- source: manual, invited or voice suggestion;
- explicit confirmation state.

### DungeonEvidence

- private screenshot reference, hash and uploader;
- recognition status, parser version and error state;
- no public URL.

### LootEntry

- item catalog reference or free-form label;
- Project Hard variant, upgrade level and quantity;
- recognition confidence and evidence region;
- entry source and correction status;
- unit price, currency and calculated total.

### CostEntry

- type: entry/pass/key, consumable, buff, repair or other;
- label, quantity, unit price, currency and total;
- optional evidence and note.

### TeamPriceBook / PriceRevision

- private team catalog;
- item/variant, unit price, currency, source note and observed date;
- revision history;
- archived rather than overwritten.

### RunAuditEntry

- actor, timestamp, action, resource revision and safe change summary;
- enough detail to understand corrections without leaking credentials or files.

## Money and calculation rules

Project Hard uses more than one value type. The model must support at least
`YANG`, `GEM`, `SM` and an extensible custom currency/item-value type.

- Gross per currency = sum of `quantity × unit price`.
- Costs per currency = sum of cost rows.
- Net per currency = gross minus costs.
- Result per hour uses the explicit run duration.
- Different currencies are shown separately by default.
- A combined result is allowed only with an explicit exchange-rate snapshot.
- Changing a current price-book value never changes a finalized run.
- Missing price means **unpriced**, never zero.
- Calculations use integer minor/base units or fixed decimal values, never
  floating-point money arithmetic.

The UI always shows sample count next to averages. It does not call a route,
dungeon or group “better” based on a tiny sample.

## First analytics

For a selected team and date range:

- number of finalized runs;
- total and average duration;
- gross, costs and net by currency;
- net per hour;
- average result per run;
- most frequent drops and unresolved/unpriced value;
- results grouped by dungeon and difficulty;
- results grouped by day/time bucket;
- participant and character combinations;
- sample size and last price observation age.

Analytics are descriptive. They must not imply that one individual caused a
good or bad result from correlation alone.

## Multi-user collaboration

A run is one shared team resource, not four personal copies.

- show ephemeral presence and who is editing a section;
- use expected revisions for durable writes;
- lease only the edited item/cost/evidence row where helpful;
- use idempotency keys for create/finalize/import actions;
- show conflicts and preserve both submitted values;
- never use silent last-write-wins;
- make finalization one idempotent operation;
- allow uploads and row corrections from multiple participants;
- isolate runs by team membership on the server side.

The Leader role does not automatically bypass private-team membership. Existing
guild administration and Discord analytics permissions remain separate from
private player tools.

## Discord integration

Useful bot actions:

- **Start dungeon** and **Finish dungeon**;
- open the current shared run in Web;
- invite/select Discord participants;
- optional suggestion from the same voice channel, requiring confirmation;
- reminder to finish a stale draft;
- notification that loot recognition needs review;
- notification that a finalized run was corrected.

Reminders must be opt-in or team-configured, deduplicated and rate-limited. They
respect quiet hours and provide direct actions such as **Done**, **Open**, **Snooze**
and **Stop reminding**.

The bot may support the team's character/task reminders, including reading books,
horse medals and war preparation, but it cannot know that a game action happened
until a person confirms it.

## Project Hard weekly limits

The Project Hard catalog may attach optional weekly-limit hints to affected
dungeons/equipment. The official 2026-05-03 notes mention weekly equipment limits
for Public Demon Tower, Private Demon Tower, Azrael Catacombs and
Beran-Setaou's Lair, reset on Sunday.

These hints may later connect to character reminders and team planning. They are
versioned configuration, not permanent assumptions.

## Safe account metadata

DESTILED may optionally keep non-secret coordination metadata:

- account label or nickname;
- server/kingdom;
- characters associated with the account;
- who in the private team operates it;
- masked contact hint;
- whether 2FA is enabled;
- a free-form note that explicitly rejects secrets.

DESTILED must never store or transmit:

- Project Hard login or password;
- account PIN;
- mailbox password;
- email authorization/verification codes;
- recovery codes;
- session cookies or game/client tokens.

Encryption at rest would not remove the fundamental risk because the application
would need a reversible key to show or use those secrets. Shared credentials
belong in a dedicated password manager, outside DESTILED. All account-note fields
must warn and reject likely secret values.

## Failure and empty states

The design must cover:

- no configured dungeons;
- no team characters;
- no screenshots;
- unsupported/blurred image;
- no recognized loot;
- partial recognition;
- duplicate screenshot;
- offline/background processing delay;
- stale price;
- unpriced item;
- multiple currencies without exchange rates;
- zero/invalid duration;
- participant no longer in the team;
- edit conflict;
- finalize retry;
- lost team access;
- archived dungeon revision.

A processing failure keeps the original evidence and offers manual entry.

## Delivery order

### A. Specification and sample collection — now

- preserve this direction;
- gather real Project Hard dungeon/result screenshots later;
- enumerate actual dungeons and team price/cost habits;
- do not alter the active first player slice.

### B. Manual dungeon journal

- catalog, shared run, participants, characters and duration;
- manual loot, price book, costs and calculations;
- history, audit and collaboration behavior.

### C. Discord shortcuts and reminders

- start/finish/open actions;
- participant confirmation;
- stale draft and review reminders.

### D. Screenshot-assisted import

- evidence pipeline, recognition proposals and correction UX;
- measured accuracy on real Project Hard samples;
- duplicate detection and safe retries.

### E. Team analytics

- filters, summaries, comparisons and sample-size safeguards;
- price freshness and unresolved value visibility.

Manual recording ships before AI import. The useful product cannot depend on a
recognition model being perfect.

## Acceptance criteria for the first analyzer slice

1. A private team can create, edit, finish and finalize a Project Hard dungeon run.
2. Several members can contribute without silent data loss.
3. Participants and characters are explicit and editable.
4. Gross, costs, net and per-hour results are reproducible.
5. Multi-currency values are never combined without a visible rate snapshot.
6. Missing prices stay visibly unpriced.
7. Finalized history keeps its definition and price snapshots.
8. Every AI proposal requires a reviewable source and supports correction.
9. Private runs are inaccessible outside their team.
10. The module stores no Project Hard or email authentication secrets.
11. Bot suggestions and reminders never claim to observe the game client.
12. The implementation preserves the active first player slice and enters
    production only as a later approved vertical slice.
