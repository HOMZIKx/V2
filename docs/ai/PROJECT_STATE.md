# PROJECT_STATE

## Status

`READY_FOR_OWNER_P4_4_WEB_TEST` — P4.4 member WWW on PR #19
(`cursor/p4-1-activity-domain`).

## Active phase

P4.1–P4.4. **Do not start P5 / P4.5.** No merge.

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19

## P4.4 WWW

- Routes: `/logowanie`, `/aktywnosci`, `/aktywnosci/[id]`, `/moje`, `/powiadomienia`
- Gateway: session cookie → actor + `GET /session/me` + CORS
- Identity: `GET /identity/oauth/:provider`
- Accent: `#7c3aed` (V2 panel embed)
- No WWW creator

## Live smoke (agent)

- Web: http://127.0.0.1:3000 (login CTA 200; protected → 307 `/logowanie`)
- Published activity `WWW Smoke Event` visible via gateway list; RSVP via gateway OK
- **OWNER_LOGIN_REQUIRED:** `IDENTITY_AUTH_ENABLED=false` in local `.env` —
  owner must enable Identity auth + Discord OAuth for full browser login

## Explicitly not done

P4.5, RabbitMQ cutover, Zeabur prod, merge, full owner OAuth visual pass.

## Last updated

2026-08-16 — P4.4 Activity WWW
