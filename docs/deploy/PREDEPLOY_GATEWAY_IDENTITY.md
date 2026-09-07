# PRE-DEPLOY — Gateway / Identity / Notify (Mateusz + Kuzyn)

**Scope:** New Bot stack only — `discord-gateway` (:4100), Identity OAuth (:4200), player-team (:4400), web notify hooks.
**Out of scope:** Technika UI audit (Kuzyn).
**Sources:** root `.env.example`, `docs/deploy/ZEABUR.md`, `ZEABUR_OWNER_VARIABLES.md`, `docs/product/TIMERS_DISCORD_NOTIFY.md`, `docs/identity/LOCAL_OAUTH_PROOF.md`, `docs/identity/WEB_DISCORD_LOGIN.md`, Dockerfiles/`zbpack.*.json`, gateway notify/health code.
**Rule:** names only — never paste secret values into chat/PR/logs.

Tonight ports (local defaults): **web :3000**, **discord-gateway :4100**, **identity :4200**, **player-team :4400**.
Zeabur: prefer platform `PORT`/`HOST` (`resolveHttpListen`); Dockerfiles set `PORT=4100|4200|4400` and `HOST=0.0.0.0`.

---

## 1. Smoke checklist

### A. discord-gateway (:4100)

| Check                 | Expect                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`    | `{"status":"ok"}` (Dockerfile HEALTHCHECK)                                                                                                                                                            |
| `GET /health/ready`   | `status:ok`, `discordEnabled:true`, `discordState:"ready"`; **503** if not ready / isolation fail                                                                                                     |
| `GET /health/discord` | `enabled:true`, `state:"ready"`, `isolationOk:true`, `joinedGuildCount` >= 1, `joinedGuildIds` includes TEST `1534228693017432124`, `commandsRegistered` as expected, `lastError:null`, sane `pingMs` |
| Bot online in Discord | Presence on TEST guild; optional `/status` / panel smoke per ZEABUR.md §6                                                                                                                             |

### B. identity (:4200)

| Check                      | Expect                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`         | ok                                                                                                                                            |
| `GET /health/ready`        | ok (Postgres + Redis + migration `001_better_auth`)                                                                                           |
| OAuth callback registered  | Discord Dev Portal redirect = `{IDENTITY_AUTH_BASE_URL}/api/auth/callback/discord` (local: `http://127.0.0.1:4200/api/auth/callback/discord`) |
| Web login path             | Web **Kontynuuj z Discord** → Identity web-oauth → Discord → web-bridge → `http://127.0.0.1:3000/auth/callback?...&discordAccountId=...`      |
| Cookie SameSite            | Use **127.0.0.1** consistently for web + identity (localhost vs 127.0.0.1 breaks cookies)                                                     |
| `IDENTITY_TRUSTED_ORIGINS` | Includes web origins (`http://127.0.0.1:3000`, `http://localhost:3000`, plus public web URL if hosted)                                        |

### C. player-team (:4400)

| Check                                  | Expect                                                                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live` (+ `/health/ready`) | ok (Zeabur table + Dockerfile)                                                                                                                                    |
| CORS                                   | `PLAYER_TEAM_CORS_ORIGINS` includes web origin(s)                                                                                                                 |
| Demo viewer                            | `PLAYER_TEAM_DEMO_VIEWER_HEADER=x-demo-viewer-id`; owner key = **bare Discord snowflake** (not UUID, not `discord:` prefix) — mismatch → Gotowe `timer_not_found` |
| Gateway reachability                   | Gateway `PLAYER_TEAM_BASE_URL` points at this service (default `http://127.0.0.1:4400`; on Zeabur use internal/public URL)                                        |

### D. Web hooks (:3000 → gateway)

| Check                      | Expect                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/discord-notify` | Server-only forwarder; needs `DISCORD_NOTIFY_SHARED_SECRET` (not `NEXT_PUBLIC_*`) + `DISCORD_GATEWAY_BASE_URL`                                   |
| Actions                    | `timer` → `/notify/timer`; `watch` → `/notify/timer-watch`; `reset` → `/notify/timer-reset`; `war-recipients` → `/notify/kingdom-war-recipients` |
| Header upstream            | `x-notify-secret` must match gateway `DISCORD_NOTIFY_SHARED_SECRET`                                                                              |
| notifyPrefs (HARD)         | Timer/war DMs only for **current team members** with `notifyPrefs.characterTimers` / `kingdomWar` (default true). Never guild roster fan-out     |

### E. Gotowe / Przypomnij / LIVE 1..N (character timer DM)

1. OAuth so `viewer.discordAccountId` = operator snowflake; player-team header uses same snowflake.
2. Character card → Start timer → PW with **Gotowe** / **Przypomnij później** (+ LIVE numbered list when multi-timer).
3. **Gotowe** → ephemeral OK; player-team revision↑ without opening WWW (`confirmCharacterProgressTimerFromBot`).
4. **Przypomnij później** → snooze persisted; queue survives gateway restart (file-backed).
5. After Gotowe, DM LIVE 1..N list updates in place.
6. Closed DMs → notify may return `{ ok:true, skipped:"dms_closed" }` (code 50007) — not a crash.

Optional (if Technika already applied tonight — do not deep-audit UI): guild module `characterTimers` + `discord.notify` right + Apply; else gateway may gate notify.
