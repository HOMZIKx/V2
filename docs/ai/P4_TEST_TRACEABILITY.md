# P4 Centrum Aktywności — macierz śledzenia i testów

## Status

`P4.1 implemented — READY_FOR_REVIEW_P4_1_ACTIVITY_DOMAIN`

Kolumny: decyzja → domena → kontrakt → permission → etap → test.

| Decyzja                        | Domena                 | Kontrakt / API             | Permission                | Etap   | Test                                               |
| ------------------------------ | ---------------------- | -------------------------- | ------------------------- | ------ | -------------------------------------------------- |
| A create jednorazowe           | Activity.create        | POST drafts/{id}/publish   | `….event.create`          | P4.1   | unit max-4; infra concurrent create                |
| A brak cyklu zwykły            | ActivitySeries         | (deferred series API)      | `….create.recurring` deny | P4.6   | permission catalog wired; series API later         |
| A multi Discord                | Projection multi       | publish multi              | `….publish.multi_guild`   | P4.5   | shared/split lists                                 |
| B katalog rodzajów             | ActivityType           | guild config / defaults    | `….config.manage`         | P4.1/3 | ensure-defaults seeds types + StatusDef            |
| C kanały / ping ≤2             | GuildActivitySettings  | publish metadata           | create                    | P4.2–3 | channel id stored; Discord ping later              |
| D org auto confirmed           | Participation          | publish                    | manage.self               | P4.1   | organizerDefaultStatusId                           |
| E StatusDef.behavior           | ParticipationStatusDef | rsvp                       | join                      | P4.1   | confirmed/tentative/declined/custom domain tests   |
| E occupiesSlot                 | Participation          | rsvp                       | join                      | P4.1   | waitlist only occupiesSlot; unit + infra race      |
| E reconfirm on schedule change | confirmationState      | reschedule / reconfirm     | manage.self / join        | P4.1   | seat held; deadline release → FIFO promote         |
| F limit + waitlist FIFO        | Waitlist               | rsvp / resign              | join                      | P4.1   | Activity row lock; concurrent last seat (CI infra) |
| G horizon 14d                  | Activity               | publish                    | create (+ Authz extend)   | P4.1   | FixedClock unit; no SQL now()+14d CHECK            |
| H panel nonce/adopt            | PanelPublishOccurrence | panels                     | `….panel.manage`          | P4.1/2 | durable panel + occurrence state; Discord later    |
| I form draft 24h               | FormDraft              | drafts                     | create                    | P4.1   | draft TTL domain; Discord modals P4.2              |
| J Więcej private               | More menu              | ephemeral                  | manage.\* / join          | P4.2   | no public admin buttons                            |
| K report                       | Report                 | report                     | `….report.manage`         | P4.2–3 | reasons catalog                                    |
| L attendance                   | AttendanceRecord       | attendance                 | `….attendance.record`     | P4.6   | 24h window                                         |
| M stats                        | Stats                  | stats                      | `….stats.read.self/guild` | P4.6   | scope                                              |
| N private event                | Activity.privacy       | create                     | `….create.private`        | P4.6   | membership still required                          |
| O outbox                       | OutboxMessage          | outbox claim/complete/fail | —                         | P4.1   | TX outbox insert; claim/lease API; worker off      |

### P4.1 implementation notes (stabilized)

- Clock port for all time rules; migrations avoid `now()`-based business CHECKs for horizons.
- Concurrency via PostgreSQL row/advisory locks inside transactions (no Node process mutex).
- Idempotency: actor + operation + scope + key; concurrent duplicate covered in CI infra tests.
- Authorization: fail-closed S2S to P3; Discord User ID actor OK without WWW login when assertion/header context present.

## Layout / Components V2

Patrz UX Discord §K + §N. Screenshot visual contract: `REFERENCE_IMAGE_REQUIRED`.

## Poza zakresem testów P4.1

Discord UI; Zeabur; Issue #12 golden-image; RabbitMQ consumers; runtime outbox publisher.
