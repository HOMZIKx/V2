# Core Foundation Integrated Review Prep

## Status

`READY_FOR_OWNER_AND_CHATGPT_CORE_FOUNDATION_REVIEW` — after Stage 3–7 checkpoints.

## Cross-module matrix (this continuous resume)

| Area | Status |
| --- | --- |
| Hub shell / registry / deep links | Stage 3 checkpoint |
| Profile / interests / role projection safety | Stage 3 + Stage 4 foundation |
| Notifications classes / prefs / DM+Inbox | Stage 4 checkpoint |
| Activity 2.0 LFG matching / intents | Stage 5 checkpoint |
| Reservations conflict + lifecycle | Stage 6 checkpoint |
| Marketplace offers + watches | Stage 7 checkpoint |
| Moje / Dla mnie / Discord / WWW / Admin | foundations + entry points |

## Outage / isolation checks (automated + local)

- Unit/domain: LFG matching, notification mute policy, reservation overlap, marketplace watch match
- Activity + Discord gateway vitest suites
- Outbox deliver paths include notification DM
- Cross-guild / org mismatch rejected in LFG ranker
- DB/Redis/Rabbit/Discord outage full soak: **follow-up on live Zeabur** (DEC-001)

## Explicit gaps for Owner/ChatGPT

1. Full Discord LFG multi-step modal wizard (character → roles → window) still thin vs matching API.
2. Reservation Admin CRUD UI + WWW pages not fully productized (API + schema present).
3. Marketplace Admin categories UI + WWW list pages thin (API + schema + matching present).
4. Interest→Discord role reconcile apply (safety compute exists; Discord role mutate wire pending).
5. GitHub issue comments not re-read live (repo private; agent lacks `gh` auth) — scope locks mirror Owner continuous task.

## Stop rule

STOP before Stage 8. Do not merge without APPROVED.
