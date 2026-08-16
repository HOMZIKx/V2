# P4 Centrum Aktywności — macierz śledzenia i testów

## Status

`SPEC — PR #18 merged; activity-service; permissions Accepted (no P4.1 code)`

Kolumny: decyzja → domena → kontrakt → permission → etap → test.

| Decyzja                        | Domena                 | Kontrakt / API               | Permission                | Etap   | Test                                               |
| ------------------------------ | ---------------------- | ---------------------------- | ------------------------- | ------ | -------------------------------------------------- |
| A create jednorazowe           | Activity.create        | POST /activity/v1/activities | `….event.create`          | P4.1–2 | unit max-4 TX lock; concurrent create              |
| A brak cyklu zwykły            | ActivitySeries         | POST series                  | `….create.recurring` deny | P4.1/6 | forbid without grant                               |
| A multi Discord                | Projection multi       | publish multi                | `….publish.multi_guild`   | P4.5   | shared/split lists                                 |
| B katalog rodzajów             | ActivityType           | config                       | `….config.manage`         | P4.3   | guild toggle                                       |
| C kanały / ping ≤2             | GuildActivitySettings  | publish                      | create                    | P4.2–3 | ping allowlist                                     |
| D org auto confirmed           | Participation          | create                       | manage.self               | P4.1–2 | organizerDefaultStatusId                           |
| E StatusDef.behavior           | ParticipationStatusDef | rsvp                         | join                      | P4.1–3 | confirmed/tentative/declined/custom                |
| E occupiesSlot                 | Participation          | rsvp                         | join                      | P4.1–2 | waitlist only occupiesSlot                         |
| E reconfirm on schedule change | confirmationState      | schedule                     | manage.self               | P4.1–2 | status kept; no waitlist promote; deadline release |
| F limit + waitlist FIFO        | Waitlist               | rsvp                         | join                      | P4.1–2 | Activity row lock; concurrent last seat            |
| G horizon 14d                  | Activity               | create                       | create (+ Authz extend)   | P4.1   | Clock inject; no SQL now()+14d CHECK               |
| H panel nonce/adopt            | PanelPublishOccurrence | panel ops                    | `….panel.manage`          | P4.2   | crash after send; adopt; dual worker; cleanup      |
| I form draft 24h               | FormDraft              | private panel                | create                    | P4.2   | section edit; modal≤5; no wizard; no draft loss    |
| J Więcej private               | More menu              | ephemeral                    | manage.\* / join          | P4.2   | no public admin buttons                            |
| K report                       | Report                 | report                       | `….report.manage`         | P4.2–3 | reasons catalog                                    |
| L attendance                   | AttendanceRecord       | attendance                   | `….attendance.record`     | P4.6   | 24h window                                         |
| M stats                        | Stats                  | stats                        | `….stats.read.self/guild` | P4.6   | scope                                              |
| N private event                | Activity.privacy       | create                       | `….create.private`        | P4.6   | membership still required                          |
| O outbox                       | OutboxMessage          | internal                     | —                         | P4.1–2 | claim/lease/retry; worker off until P4.2 handler   |

## Layout / Components V2

Patrz UX Discord §K + §N. Screenshot visual contract: `REFERENCE_IMAGE_REQUIRED`.

## Poza zakresem testów P4.1

Discord UI; Zeabur; Issue #12 golden-image; RabbitMQ consumers.
