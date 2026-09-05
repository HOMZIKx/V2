# DESTILED web — Discord login bridge (Identity)

Real Discord sign-in for pps/web goes through Identity Service (Better Auth).
The bot gateway (pps/discord-gateway) stays separate (panels/commands).

## Flow

1. Web **Kontynuuj z Discord** → top-level GET  
   IDENTITY/identity/web-oauth/discord?returnTo=.../identity/web-bridge?to=<web origin>
2. Identity sets OAuth state cookie and redirects to Discord.
3. Discord callback → Better Auth on :4200 → web-bridge.
4. web-bridge reads /identity/me + accounts (same-origin cookie) and redirects to  
   http://127.0.0.1:3000/auth/callback?viewerId=...&displayName=...&discordAccountId=...
5. Web callback calls inishAuth / completeDiscordAuth with real Discord-linked viewer  
   (PlayerIdentity.id prefers Discord snowflake for x-demo-viewer-id until JWT).

## Env (web)

pps/web/.env.local:

`
NEXT_PUBLIC_IDENTITY_AUTH_BASE_URL=http://127.0.0.1:4200
NEXT_PUBLIC_IDENTITY_AUTH_ENABLED=true
`

Offline Mateusz stub simulator (optional):

`
NEXT_PUBLIC_DISCORD_AUTH_SIMULATE=true
`

Identity (root .env) must have auth enabled, Discord credentials, and:

`
IDENTITY_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
`

Discord developer portal redirect:

http://127.0.0.1:4200/api/auth/callback/discord

## Run on BOBER (HMR)

1. Start infra (Postgres + Redis) for Identity.
2. Migrate + start Identity — see docs/identity/LOCAL_OAUTH_PROOF.md.
3. Start web on port 3000 (pps/web dev).
4. Open http://127.0.0.1:3000 → **Kontynuuj z Discord**.

## Stretch (not built)

Timers Discord notify via gateway can reuse discordAccountId later.

## Files

- pps/web/src/identity-auth-client.ts — thin browser client
- pps/web/app/discord-entry.tsx — entry UI
- pps/web/app/auth/callback/page.tsx — post-bridge hydrate
- services/identity-service/src/interface/web-oauth.controller.ts — web-oauth + web-bridge
- pps/web/src/player-store.ts — DiscordAuthViewerInput / completeDiscordAuth
