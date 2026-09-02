# Web product design and delivery workflow

- **Status:** OWNER ACCEPTED
- **Date:** 2026-09-02
- **Decision:** D-037
- **Scope:** `apps/web`, `apps/admin` and their shared frontend packages

## Objective

The owner and ChatGPT design and create the actual production frontend. Cursor
does not recreate a second website from screenshots or prose. After owner
approval, Cursor connects the approved frontend to real APIs, Identity,
Authorization, Discord, databases and deployment. The integrated frontend from
this repository is the interface ultimately deployed and used on Zeabur.

## Current freeze

Until an approved frontend slice exists, Cursor must not independently:

- design or redesign Web/Admin information architecture, navigation or layouts;
- create user-facing page copy, graphics, iconography, visual direction or
  animations;
- add new product screens based on database tables, endpoints or assumptions;
- treat the existing Web/Admin UI, the previous Sites demo or the legacy project
  as the design source.

Existing code is preserved as technical material and may contain reusable
plumbing. It is not automatically accepted product design and must not be
deleted merely because a new direction will be created.

Cursor may continue backend, API, database, Discord, Identity, Authorization,
testing, security, diagnostics and infrastructure work when it does not require
inventing Web/Admin behavior. A technical decision affecting the user experience
must be marked `OWNER_DECISION_REQUIRED`.

## Sources of truth

1. GitHub repository: production code, history and approved documents.
2. Owner-approved product map and information architecture.
3. Owner-approved frontend code in the V2 stack.
4. Backend contracts and service ownership defined by existing ADRs.
5. Sites may be used only as an optional preview. It is not the production
   source of truth and does not replace repository code.

The previous Sites demo, existing UI and legacy assets are not visual
requirements. D-024 still requires originality and prioritizes functionality,
but no palette, composition or style is assumed until the owner approves the
new visual direction.

## Responsibility split

### Owner

- defines real guild/community rules, priorities and acceptable behavior;
- provides the new product and visual direction;
- accepts or rejects maps, flows, screens and frontend slices.

### ChatGPT

- structures discovery and prevents page-first design;
- prepares product map, information architecture and user flows;
- designs UX/UI, copy, graphics and responsive behavior with the owner;
- creates production frontend code in the repository's approved stacks;
- uses mock data behind explicit frontend data adapters;
- documents required backend contracts and acceptance criteria;
- audits integration for design fidelity and behavior.

### Cursor

- preserves approved frontend behavior and visual design;
- implements or adapts backend services, API contracts and data flows;
- connects Identity, Authorization, Discord and databases;
- replaces mock adapters with real integrations;
- adds integration, security and deployment work;
- reports conflicts instead of redesigning the frontend independently.

## Ordered delivery gates

### Phase 0 — preserve and freeze

- checkpoint existing work;
- preserve current Web/Admin code;
- stop independent Web/Admin design and content changes;
- record D-037 and this workflow.

**Gate:** repository contains the directive. No product design is implied.

### Phase 1 — technical and product inventory

Inspect the current repository only to learn constraints and capabilities:

- frontend frameworks, routing, shared packages and build/deploy boundaries;
- existing APIs, domains, permissions and data ownership;
- completed, partial and placeholder functions;
- real user groups and operational jobs.

Do not inherit the current visual design.

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

### Phase 7 — Cursor integration per approved slice

Cursor receives the approved code and integration contract, then:

- replaces mock adapters with real APIs;
- connects sessions and Authorization decisions;
- connects Discord-driven state and background processes;
- adds migrations/backend behavior only where required;
- adds integration and contract tests;
- preserves approved frontend unless a documented conflict is accepted.

A conflict returns to owner/ChatGPT; it is not solved through an independent
redesign.

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

Cursor receives production frontend code plus an integration specification. It
does not receive only screenshots and a request to build a similar site.

Necessary technical integration may change adapters, contracts and internal
implementation. User-facing layout, behavior, copy and graphics change only
after owner approval.

## Current design checkpoint

The initial product map and access/team boundaries are now captured by D-038
through D-048. The active first player slice and collaboration contract are
defined by D-049 through D-051 in
[PLAYER_VERTICAL_SLICE_AND_COLLABORATION](PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md).

Interactive design validation currently covers the member dashboard, team
workspace and character/equipment/timer surface. These previews are not a second
application and are not yet production source.

## Immediate next step

Complete an owner coherence review of the first player journey, including mobile,
empty/error/access-denied and simultaneous-use states. After acceptance, proceed
to **Phase 5 — production application shell** and implement this first slice in
the repository frontend stack behind mock adapters.

Do not expand cooperative maps, market, AI import, analytics or bot
administration until this slice's production interface and adapter boundary are
stable.
