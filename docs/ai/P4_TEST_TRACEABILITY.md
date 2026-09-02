# P4 Centrum Aktywności — macierz śledzenia i testów

## Status

`P4.1–P4.4 implemented — READY_FOR_REVIEW_P4_1_TO_P4_4_CLOSURE`

Kolumny: decyzja → domena → kontrakt → permission → etap → test.

| Decyzja                        | Domena                 | Kontrakt / API             | Permission                | Etap   | Test                                                |
| ------------------------------ | ---------------------- | -------------------------- | ------------------------- | ------ | --------------------------------------------------- |
| A create jednorazowe           | Activity.create        | POST drafts/{id}/publish   | `….event.create`          | P4.1   | unit max-4; infra concurrent create                 |
| A brak cyklu zwykły            | ActivitySeries         | (deferred series API)      | `….create.recurring` deny | P4.6   | permission catalog wired; series API later          |
| A multi Discord                | Projection multi       | publish multi              | `….publish.multi_guild`   | P4.5   | shared/split lists                                  |
| B katalog rodzajów             | ActivityType           | admin types CRUD           | `….config.manage`         | P4.3   | admin use-case + Admin UI Types                     |
| C kanały / ping ≤2             | GuildActivitySettings  | admin channels/pings       | config.manage             | P4.3   | channel/ping put + revision; Discord uses allowlist |
| D org auto confirmed           | Participation          | publish                    | manage.self               | P4.1   | organizerDefaultStatusId                            |
| E StatusDef.behavior           | ParticipationStatusDef | rsvp + admin statuses      | join / config.manage      | P4.1/3 | domain + admin StatusDef CRUD                       |
| E occupiesSlot                 | Participation          | rsvp                       | join                      | P4.1   | waitlist only occupiesSlot; unit + infra race       |
| E reconfirm on schedule change | confirmationState      | reschedule / reconfirm     | manage.self / join        | P4.1   | seat held; deadline release → FIFO promote          |
| F limit + waitlist FIFO        | Waitlist               | rsvp / resign              | join                      | P4.1   | Activity row lock; concurrent last seat (CI infra)  |
| G horizon 14d                  | Activity               | publish + admin limits     | create (+ Authz extend)   | P4.1/3 | FixedClock unit; admin horizon bounds               |
| H panel nonce/adopt            | PanelPublishOccurrence | panels + admin hub         | `….panel.manage`          | P4.2/3 | scan/adopt/dup cleanup + crash-window unit          |
| I form draft 24h               | FormDraft              | drafts                     | create                    | P4.1   | draft TTL; single-form Discord (Owner Amendment)    |
| J Więcej private               | More menu              | ephemeral                  | manage.\* / join          | P4.2   | no public admin buttons                             |
| K report                       | Report                 | report + admin reports     | `….report.manage`         | P4.2–3 | reasons catalog + Admin resolve                     |
| L attendance                   | AttendanceRecord       | attendance                 | `….attendance.record`     | P4.6   | 24h window                                          |
| M stats                        | Stats                  | stats                      | `….stats.read.self/guild` | P4.6   | scope                                               |
| N private event                | Activity.privacy       | create                     | `….create.private`        | P4.6   | membership still required                           |
| O outbox                       | OutboxMessage          | outbox claim/complete/fail | —                         | P4.1   | TX outbox insert; claim/lease API; worker off       |
| P admin readiness              | Guild config           | GET admin/.../readiness    | config.manage             | P4.3   | evaluateAdminReadiness unit + Overview UI           |
| Q config revision              | Guild settings         | PUT admin/.../config       | config.manage             | P4.3   | conflict 409 unit                                   |
| R Admin UI                     | apps/admin             | Vite routes /activity/*    | session + Authz           | P4.3   | vitest routes + Playwright smoke                    |
| S Gateway BFF                  | api-gateway            | proxy /activity/v1/*       | cookies/headers           | P4.3   | activity-proxy unit                                 |

### P4.1 implementation notes (stabilized)

- Clock port for all time rules; migrations avoid `now()`-based business CHECKs for horizons.
- Concurrency via PostgreSQL row/advisory locks inside transactions (no Node process mutex).
- Idempotency: actor + operation + scope + key; concurrent duplicate covered in CI infra tests.
- Authorization: fail-closed S2S to P3; Discord User ID actor OK without WWW login when assertion/header context present.

### P4.2 notes

- Hub Components V2; custom_id includes opaque `panelId`; Zgłoś only via event/More.
- Projection delivery from outbox → discord-gateway internal API.

### P4.3 notes

- Admin is SoT for guild config; `ACTIVITY_ALLOW_TEST_SEED` bootstrap is no-op overwrite when config already admin-owned.
- Live Admin→Discord: `MANUAL_OWNER_TEST_REQUIRED`.

## Layout / Components V2

Patrz UX Discord §K + §N. Screenshot visual contract: `REFERENCE_IMAGE_REQUIRED`.

## Poza zakresem (świadomie)

P4.4 WWW; Desktop; RabbitMQ; Zeabur prod; final branding; merge.
