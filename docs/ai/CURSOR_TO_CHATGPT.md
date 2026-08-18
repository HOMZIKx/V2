# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_AND_CHATGPT_RUNTIME_REVIEW` — task
`P4-CONTINUOUS-RUNTIME-BRINGUP-AND-OPERABILITY-001`

ROLLING AUDIT MODE: **ACTIVE**

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 / #21 / #22 / #23 **NOT IMPLEMENTED** (planning context only)

TASK_STARTING_SHA: `c635bb9b909b316ef4241071370fa3d7f98ce618`  
FINAL_SHA: latest commit on `cursor/p4-1-activity-domain` (operability + Admin login)

## 2. Delta

- Admin: Identity Discord login CTA when session is cookie-mode and guilds
  401/empty. 401 copy is a login prompt, not raw fetch.
- WWW: `Failed to fetch` mapped to unavailable Polish copy.
- `/health/live` (Nest) and WWW `/health` return `gitCommitSha` + `appVersion`.
- Deployable service registry + CI drift check + `pnpm runtime:doctor` in
  `pnpm validate`. Optional `pnpm smoke:runtime` for public URLs (not PR CI).
- Docs: Zeabur §9 doctor/smoke/revision. Registry encodes **one** Postgres
  addon as actual topology.

## 3. Live probes (before this SHA redeploy)

- Admin loads; 401 “Nie udało się potwierdzić sesji.” (old bundle, no CTA yet)
- WWW `/logowanie` loads with Discord login button
- API guilds unauthenticated 401
- OAuth start 302 to Discord with production callback URI

## 4. Strategic guardrails

Do not implement #20–#23, Intent/Watch, Discord Activity, V2 Room, overlay,
Music, or extra microservices. Logical module ≠ deployable service.

## 5. Owner gates still required

- Redeploy this SHA to Zeabur (Admin CTA + revision health).
- Set `GIT_COMMIT_SHA` per APP to the image SHA.
- Discord visual: accent `#D48632`, DZIAŁAJ/TWOJE, no purple.
- Logged-in Admin (guild/channels/roles/save) and WWW (activities/RSVP/My/Inbox).
- Discord create/preview/publish/RSVP as a real user.

STOP.
