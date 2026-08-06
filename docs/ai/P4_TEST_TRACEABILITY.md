# P4 Centrum Aktywności — macierz śledzenia i testów

## Status

`SPEC — final audit after P3 merge (no implementation)`

Kolumny: decyzja produktowa → domena → kontrakt → permission (TECH proposal) →
etap → test.

Permission stringi = propozycja techniczna; finalne ID =
`OWNER_DECISION_REQUIRED`.

| Decyzja                             | Domena                     | Kontrakt / API        | Permission (TECH)         | Etap   | Test                                                   |
| ----------------------------------- | -------------------------- | --------------------- | ------------------------- | ------ | ------------------------------------------------------ |
| A create jednorazowe członek        | Activity.create            | POST activity         | `….event.create`          | P4.1–2 | unit max-4; 14d horizon; integration create            |
| A brak cyklu dla zwykłego           | ActivitySeries             | POST series           | `….create.recurring` deny | P4.1/6 | unit forbid without grant                              |
| A publikacja bez akceptacji moda    | Activity.publish           | publish               | create allow              | P4.2   | integration published immediately                      |
| A multi Discord uprawnieni          | ActivityProjection multi   | publish multi         | `….publish.multi_guild`   | P4.5   | integration shared/split lists                         |
| A Utwórz podobne → one-shot         | Activity.clone             | clone                 | create                    | P4.2/6 | unit not series                                        |
| B katalog rodzajów / Inna           | ActivityType               | admin config          | `….admin.configure`       | P4.3   | config toggle per guild                                |
| B pola obowiązkowe + szkic 24h      | FormDraft                  | draft save            | create                    | P4.2   | draft expiry; preview required                         |
| B pola z katalogu                   | ParticipantField           | rsvp fields           | —                         | P4.2–3 | reject freeform questions                              |
| C kanały / ping ≤2 / no everyone    | GuildActivitySettings      | publish               | create                    | P4.2–3 | unit ping allowlist                                    |
| D org auto Będę; co-org; handoff    | Participation / organizers | assign co-org         | manage.self               | P4.2   | leave org requires transfer/cancel                     |
| D leave Discord / block → moda      | ownership transfer         | system job            | moderate.guild            | P4.2/5 | integration transfer                                   |
| E statusy config + occupiesSlot     | StatusDef                  | rsvp                  | join                      | P4.1–3 | waitlist only occupiesSlot                             |
| E konflikt ostrzeżenie              | Participation              | rsvp                  | join                      | P4.2   | warn not block                                         |
| E po close tylko resign             | Participation              | rsvp                  | join                      | P4.2   | reject status change except leave                      |
| F limit + waitlist auto-promote     | Waitlist                   | rsvp                  | join                      | P4.1–2 | FIFO promote + notify                                  |
| F publiczna lista                   | Projection                 | get                   | —                         | P4.2   | public nick/class only                                 |
| G close/reopen registrations        | Activity                   | registrations         | manage.self               | P4.2   | history entries                                        |
| G zmiana terminu + reconfirm        | Activity.schedule          | reschedule            | manage.self               | P4.2   | status requires_confirmation; notify                   |
| H start → in_progress; edit subset  | lifecycle                  | start job             | —                         | P4.1–2 | domain transition                                      |
| H auto-end 2h                       | lifecycle                  | scheduler             | —                         | P4.1   | unit timer                                             |
| H delete only empty pre-start       | Activity                   | delete                | manage.self               | P4.2   | forbid with participants                               |
| H cancel + reason + history         | Activity                   | cancel                | manage.self               | P4.2   | notify all; audit                                      |
| I moda reason + audit; Zgłoś        | Audit / Report             | report                | moderate / —              | P4.2–3 | audit fields                                           |
| J DM + inbox; mute type/event       | Notification               | notify                | —                         | P4.2/4 | no public mention on DM fail                           |
| K panel 4 akcje; one form; in-place | UX Discord V2              | Components V2 payload | panel + join/manage       | P4.2   | payload snapshot; section accessory; no channel spam   |
| K VC istniejący; temp VC deferred   | Activity.voice             | update                | manage.self               | P4.2   | no temp VC                                             |
| K Więcej → ephemeral by P3          | UX Discord                 | more handler          | join/manage/moderate      | P4.2   | private menus participant/org/mod; no public admin row |
| K custom_id versioned               | Gateway adapter            | interaction map       | —                         | P4.2   | unique ids; map→command; no PII/secrets in id          |
| K edit same message                 | Projection                 | message edit          | —                         | P4.2   | same message id; no status spam                        |
| L privacy text fields               | Participation.private      | get                   | manage/moderate           | P4.2/6 | hide text from public                                  |
| L private event link                | Activity.visibility        | get                   | membership                | P4.6   | link no bypass Discord perms                           |
| M shared vs split lists             | MultiGuild                 | publish               | multi_guild               | P4.5   | shared cap                                             |
| N serie 90d; edit/cancel scopes     | ActivitySeries             | series API            | recurring                 | P4.6   | domain series rules                                    |
| O attendance 24h; no auto penalties | Attendance                 | attendance            | manage.self               | P4.6   | window; stats visibility                               |
| P Moje aktywności 4 buckety         | Query                      | my-activities         | —                         | P4.2/4 | filters                                                |
| Q WWW browse/RSVP/my/inbox          | Web adapter                | same API              | login.www + join          | P4.4   | parity with Discord                                    |
| R Admin config set                  | Admin adapter              | admin CRUD            | admin.configure           | P4.3   | config drives runtime                                  |
| S post repair; channel loss; leave  | Projection / resilience    | repair                | moderate                  | P4.2/5 | recreate message; drop future RSVP keep history        |

## Kryteria akceptacji etapów

Patrz markery w [CENTRUM_AKTYWNOSCI.md](../architecture/CENTRUM_AKTYWNOSCI.md) §7.

## Testy kontraktu Components V2 (P4.2) — bez golden-image layoutu

Źródło: [CENTRUM_AKTYWNOSCI_DISCORD.md](../ux/CENTRUM_AKTYWNOSCI_DISCORD.md) §K.

| #   | Test                                                   | Warstwa       |
| --- | ------------------------------------------------------ | ------------- |
| 1   | Snapshot payload Components V2 (panel + event)         | unit/contract |
| 2   | Limit komponentów (≤40) i Action Row                   | unit          |
| 3   | Unikalność custom_id w wiadomości                      | unit          |
| 4   | custom_id → command/handler                            | unit          |
| 5   | Permission P3 allow/deny per akcja                     | integration   |
| 6   | „Więcej” ephemeral: participant / org / moderator      | integration   |
| 7   | Edit tej samej message id                              | integration   |
| 8   | Brak podwójnej publikacji statusowej                   | integration   |
| 9   | Stale / expired interaction                            | integration   |
| 10  | Layout per status: planned/in_progress/cancelled/ended | contract      |

Golden-image: **tylko** zatwierdzone bannery/assety (Issue #12), nie interaktywność.

## Świadomie odroczone (nie defekty fundamentu)

Temporary VC; full platform Admin; WWW create (do osobnej decyzji po P4.4);
Desktop; Zeabur; Outbox/RMQ; Issue #12 assets (kolory/emoji/grafiki).
