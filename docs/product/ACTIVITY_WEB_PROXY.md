# Activity web proxy (DESTILED)

- SoT API: `services/activity-service` OpenAPI `openapi/activity-v1.yaml` (`/activity/v1/...`).
- Web Next rewrite: `/activity/:path*` → `ACTIVITY_PROXY_TARGET` (default `http://127.0.0.1:4400`).
- Client helper: `apps/web/src/activity-api.ts` (same-origin by default).
- Admin Technika bot health remains on discord-gateway `:4100` (`/health/discord`), not activity.

Note: local default activity port is **4400**, same as historical player-team local default. If both run locally, set distinct ports and `ACTIVITY_PROXY_TARGET` / `NEXT_PUBLIC_PLAYER_TEAM_BASE_URL` accordingly (player-team often uses Zeabur URL).
