# Cursor → ChatGPT

## 1. Status

`READY_FOR_REVIEW`

Discord Gateway → Authorization membership sync on `cursor/p3-authorization-foundation` (Issue #15).
**No merge by Cursor.**

## 2. Task ID

`P3-AUTHORIZATION-FOUNDATION-001` (Discord sync slice — P3-D1 / P3-D20)

## 3. Branch / PR / source of truth

- Branch: `cursor/p3-authorization-foundation`
- Tip: `a8ee615`
- Issue: #15 (OPEN, PLAN_APPROVED)
- PR: draft when opened (GitHub SoT for tip HEAD, CI)

## 4. What landed (Discord → Authz sync)

| Area | Change |
| --- | --- |
| Intents | `Guilds` + `GuildMembers` (ADR-0007 amended; MessageContent/Presences still forbidden) |
| Config | `DISCORD_AUTHORIZATION_SYNC_ENABLED` (default false) + Authz client env |
| Sync client | EdDSA `Authorization-Client-Assertion`; POST register / events / reconcile |
| Events | GuildCreate→register+reconcile; member add/remove/update; role CUD→roles_snapshot; GuildDelete/unavailable→guild_detach |
| Isolation | Unchanged — only `DISCORD_TEST_GUILD_ID` is synced |
| Default | Sync off → no Authz calls (P1 harness unchanged) |

## 5. New env (see `.env.example`)

- `DISCORD_AUTHORIZATION_SYNC_ENABLED`
- `AUTHORIZATION_BASE_URL`
- `DISCORD_TO_AUTHZ_CLIENT_ID` (default `v2.discord-gateway`)
- `DISCORD_TO_AUTHZ_PRIVATE_KEY_PEM` / `DISCORD_TO_AUTHZ_ACTIVE_KID`
- `DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS` (≤60)
- Reuses `AUTHORIZATION_ASSERTION_AUD` when set; otherwise per-path aud

## 6. Validation commands

``bash
pnpm --filter @v2/discord-gateway typecheck
pnpm exec vitest run --config apps/discord-gateway/vitest.config.ts
pnpm exec eslint apps/discord-gateway/src
``

Results: typecheck pass; 53 tests pass; eslint apps/discord-gateway/src pass.
- Commit SHA: `a8ee61567e772dee182e24e72455fc98a0583d18`

## 7. Notes / debt

- Register `v2.discord-gateway` public keys in `AUTHORIZATION_INBOUND_CLIENTS_JSON` when enabling sync.
- Enable **Server Members Intent** in Discord Developer Portal for live sync.
- No periodic reconcile timer in this slice (ready/join only).

## Last updated

2026-08-05 — Cursor (Discord Gateway → Authz sync)