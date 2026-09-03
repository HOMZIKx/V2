# Web product design and delivery workflow

- **Status:** OWNER ACCEPTED — **D-061 handoff (2026-09-03)**
- **Date:** 2026-09-02 (updated 2026-09-03)
- **Decisions:** D-037 (SCOPE REVISED by D-061), D-061
- **Scope:** `apps/web`, `apps/admin` and their shared frontend packages
- **Stable deployment / working ref:** `preview/destiled-web`

## Objective

The owner defines product direction and accepts slices. **Cursor** is the
primary implementation agent for DESTILED Web (D-061), continuing the
production frontend already started on `preview/destiled-web`. ChatGPT is
optional and no longer required for day-to-day frontend delivery.

Cursor does not invent a second website from memory. Work continues from the
repository frontend, approved brand (D-051) and product contracts D-038–D-060.
Backend, Identity, Authorization, Discord and Zeabur integration remain Cursor
responsibilities under existing ADRs. Owner approval is required for changes
that alter architecture, security, data ownership, product scope or accepted UX
contracts.

## Freeze status (D-061)

`HOLD_CURSOR_WEB_PRODUCT_UI` is **lifted**.

Cursor **may**:

- continue, fix and extend DESTILED Web on `preview/destiled-web`;
- implement owner-requested screens and flows within D-038–D-060;
- preserve DESTILED identity (D-051) and authentic Metin2 class/item references;
- replace mock adapters with real APIs when the owner authorizes that step;
- report conflicts in `docs/ai/PENDING_DECISIONS.md` instead of silently
  rewriting accepted contracts.

Cursor **must not**:

- discard the existing DESTILED frontend to “start over” without owner order;
- treat the previous Sites demo or the legacy monorepo as the design source;
- store Project Hard login secrets (D-054);
- expand maps/market/AI import/dungeon analytics/bot-admin ahead of the stable
  first-player slice unless the owner explicitly prioritizes that work;
- change architecture, security, data ownership or Discord P4 contracts without
  an owner decision.

A technical choice that changes user-facing behavior outside an accepted
contract remains `OWNER_DECISION_REQUIRED`.

## Sources of truth

1. GitHub repository: production code, history and approved documents.
2. Owner-approved product map and information architecture (D-038–D-060).
3. Frontend code on `preview/destiled-web` (DESTILED member Web).
4. Backend contracts and service ownership defined by existing ADRs.
5. Sites may be used only as an optional preview. It is not the production
   source of truth and does not replace repository code.

The previous Sites demo and legacy assets are not visual requirements. D-024
still requires originality and prioritizes functionality. Active brand for
member Web is DESTILED (D-051).

## Responsibility split

### Owner

- defines real guild/community rules, priorities and acceptable behavior;
- provides and accepts product and visual direction;
- accepts or rejects maps, flows, screens and frontend slices;
- prioritizes the next concrete task for Cursor.

### Cursor (primary delivery agent — D-061)

- implements and maintains DESTILED Web within accepted contracts;
- preserves approved brand, adapters and functional honesty;
- implements or adapts backend services, API contracts and data flows;
- connects Identity, Authorization, Discord and databases when authorized;
- replaces mock adapters with real integrations when authorized;
- runs quality gates and reports evidence in repository docs;
- records conflicts instead of inventing product decisions.

### ChatGPT (optional)

- may still help with product discovery or audits when the owner chooses;
- is **not** required for DESTILED Web delivery after D-061;
- does not block Cursor from continuing owner-directed work.

## Ordered delivery gates

### Phase 0 — preserve and freeze

- checkpoint existing work;
- preserve current Web/Admin code;
- stop independent Web/Admin design and content changes;
- record D-037 and this workflow.

**Gate:** repository contains the directive. No product design is implied.

**Update (D-061):** freeze against Cursor frontend work is lifted; preserve
DESTILED code and continue from `preview/destiled-web`.

### Phase 1 — technical and product inventory

Inspect the current repository only to learn constraints and capabilities:

- frontend frameworks, routing, shared packages and build/deploy boundaries;
- existing APIs, domains, permissions and data ownership;
- completed, partial and placeholder functions;
- real user groups and operational jobs.

Do not inherit the current visual design from legacy/Sites demos.

**Output:** factual inventory and a list of constraints, unknowns and reusable
technical elements.

### Phase 2 — product map

Before drawing pages, define with the owner:

- user groups and roles;
- jobs each group must complete;
- business modules and their boundaries;
- visibility and mutation rights;
- dependencies between Discord, Web, Admin and backend;
- first release versus later scope.

**Gate:** owner approves the product map. No sitemap or screen work before this
gate.

### Phase 3 — information architecture and flows

Define:

- boundary between public Web, member Web and Admin;
- sitemap and navigation model;
- cross-module user journeys;
- global search, notifications, profiles and context switching if justified;
- critical empty, loading, denied, unavailable and error paths.

**Gate:** owner approves information architecture and priority journeys.

### Phase 4 — interface foundations

Create a new direction with the owner, without copying prior prototypes:

- visual principles and brand direction;
- typography, color, spacing and design tokens;
- responsive and accessibility rules;
- shared component behavior;
- application shell and navigation behavior.

**Gate:** owner approves the foundations before module screens are coded.

### Phase 5 — production application shell

Implement the approved shell in the actual V2 frontend stack with mock data and
stable frontend adapters:

- layout and navigation;
- responsive behavior;
- authentication entry states and permission-aware presentation;
- loading, empty, error, unavailable and denied states;
- shared primitives needed by the first slice.

This is production frontend code, not a disposable mockup.

### Phase 6 — vertical slices, one at a time

Prioritize slices by user value and technical dependencies, not by sidebar
order. Every slice follows the same sequence:

1. problem, actors and acceptance criteria;
2. user flow and permissions;
3. required data and API contract;
4. complete screen states and responsive behavior;
5. production frontend implementation with mock adapters;
6. owner review and corrections;
7. explicit frontend approval and freeze.

No later slice silently changes an approved earlier slice.

### Phase 7 — integration per approved slice

Cursor (after owner authorization):

- replaces mock adapters with real APIs;
- connects sessions and Authorization decisions;
- connects Discord-driven state and background processes;
- adds migrations/backend behavior only where required;
- adds integration and contract tests;
- preserves approved frontend unless a documented conflict is accepted.

A conflict returns to the owner; it is not solved through an independent
redesign that breaks D-038–D-060.

### Phase 8 — end-to-end hardening

Validate the combined system:

- role and permission matrices;
- Discord/Web/Admin synchronization;
- concurrency and idempotency;
- security and session behavior;
- complete failure states;
- responsive layout, accessibility and performance;
- smoke and regression tests.

### Phase 9 — Zeabur release

Deploy the integrated repository services according to ADR-0008 after the owner
explicitly resumes DEC-001:

- Web and Admin use the approved frontend code;
- API and domain services provide real behavior;
- Discord Gateway runs as the bot process;
- persistent infrastructure and secrets remain isolated;
- stage smoke tests precede the production release.

## Non-negotiable handoff rule

Cursor works from production frontend code in the repository plus accepted
product contracts. It does not rebuild the site from screenshots alone.

Necessary technical integration may change adapters, contracts and internal
implementation. User-facing layout, behavior, copy and graphics that depart
from accepted DESTILED contracts change only after owner approval.

## Current design checkpoint

The initial product map and access/team boundaries are captured by D-038
through D-048. The active first player slice and collaboration contract are
defined by D-049 through D-051 in
[PLAYER_VERTICAL_SLICE_AND_COLLABORATION](PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md).

Production frontend for the DESTILED member path lives on
`preview/destiled-web` (dashboard, teams, characters, equipment, history,
maps/wyprawa previews and related routes).

D-052 through D-054 add a later Project Hard dungeon analyzer and a hard secret
storage boundary in
[PROJECT_HARD_DUNGEON_RUN_ANALYZER](PROJECT_HARD_DUNGEON_RUN_ANALYZER.md).
D-055 through D-059 accept the first-player coherence gate and clarify named
loadouts, catalog curation, team reminders and the separate map SpawnTimer
domain in
[TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES](TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md).

## Immediate next step

**D-061 active:** Cursor awaits the owner's concrete next task on DESTILED Web
(bugfix, UX polish, incomplete first-slice flows, or prioritized module).

Default backlog if the owner does not specify otherwise:

1. stabilize the first-player path already on `preview/destiled-web`;
2. complete real create/edit flows for named sets, items and progression
   timers behind existing adapters;
3. do **not** start API/Discord production integration until the owner asks.

Do not expand market, AI import, dungeon analytics or bot administration until
the owner prioritizes those slices.
