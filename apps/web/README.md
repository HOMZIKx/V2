# V2 Web — P4.4 Activity WWW

Next.js 15 App Router member portal for Centrum Aktywności.

## URLs (local defaults)

| App         | URL                   |
| ----------- | --------------------- |
| Web         | http://127.0.0.1:3000 |
| API gateway | http://127.0.0.1:4000 |
| Identity    | http://127.0.0.1:4200 |

- `/` → redirects to `/aktywnosci`
- `/logowanie` — Discord OAuth CTA
- `/aktywnosci`, `/aktywnosci/[id]`, `/moje`, `/powiadomienia` — session-gated
- `/health` — technical health JSON

## Env

| Variable                            | Default                 | Purpose                               |
| ----------------------------------- | ----------------------- | ------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`          | `http://127.0.0.1:4000` | Gateway (session + `/activity/v1/*`)  |
| `NEXT_PUBLIC_IDENTITY_URL`          | `http://127.0.0.1:4200` | OAuth start + logout                  |
| `NEXT_PUBLIC_WEB_ORIGIN`            | `http://127.0.0.1:3000` | OAuth `callbackURL` origin            |
| `NEXT_PUBLIC_WEB_GUILDS`            | —                       | JSON `[{ "id", "name" }, …]`          |
| `NEXT_PUBLIC_DISCORD_TEST_GUILD_ID` | —                       | Fallback single guild when JSON empty |

If no guilds are configured, the UI shows an unavailable state (no fake guild).

Selected guild is stored in `sessionStorage` under `v2.web.selectedGuildId`.

## OAuth

Login button performs **top-level navigation** to:

```text
${IDENTITY}/identity/oauth/discord?callbackURL=${encodeURIComponent(WEB_ORIGIN + '/aktywnosci')}
```

Session probe: `GET ${API}/session/me` with `credentials: 'include'`.

Logout: `POST ${IDENTITY}/identity/logout` with credentials, then `/logowanie`.

Identity must allow `NEXT_PUBLIC_WEB_ORIGIN` in trusted origins / callback policy. WWW login requires Authz `permission.platform.login.www` (Identity gate).

## Scope notes

- No activity creator in P4.4 (Discord-only create).
- Business rules live in Activity Service; this app only calls the gateway.
- Type labels are omitted when the member API does not expose the types catalog (config returns statuses only).

## Scripts

```bash
corepack pnpm --dir apps/web dev
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web lint
```
