# ADR-0015: Game Service boundary and persistent web data

- **Status:** Accepted
- **Date:** 2026-09-03
- **Owner direction:** web application must stop using browser-local mock state and share data with V2 / Discord adapters.

## Context

DESTILED Web currently persists a first-player mock in browser localStorage. It cannot support shared teams, cross-device data, true Party sessions, or reliable bot integration. Existing V2 services own identity and authorization only; API Gateway exposes health checks but no game-domain API.

## Decision

Introduce `game-service` as the sole owner of the Project Hard gameplay workspace domain:

- team workspaces and members (subject to Authorization decisions);
- characters, equipment sets, items and item-location confirmations;
- character progression timers;
- respawn timers by map/channel and their map markers;
- Party hunt sessions, memberships, scout pins and session kill history.

`web`, `admin`, and `discord-gateway` are adapters. They do not persist this domain locally as a source of truth. They call versioned Game Service APIs through API Gateway.

The service owns a dedicated PostgreSQL database `game` and a dedicated database credential. It must not read Identity or Authorization databases. User identity and authorization are obtained only through their existing contracts.

Initial transport is REST/OpenAPI. WebSocket/realtime for Party is added only after the durable Party REST model is working. Party emits no Discord notifications unless a later, explicit product decision requires one.

## Consequences

- Existing browser mock data is test/demo-only and requires an explicit one-time import decision; it is not silently copied to the server.
- Zeabur requires a new `game-service` and isolated `postgres-game` add-on/database.
- Bot and Web will use the same state and rules without one owning the other.
- This ADR supersedes no existing service boundary and complements ADR-0001/0008/0014.
