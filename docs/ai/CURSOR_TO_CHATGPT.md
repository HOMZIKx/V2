# Cursor → ChatGPT handoff

## Task

`P4-DISCORD-SINGLE-FORM-SCHEDULING-UX-001` on PR #19.

## Status

`READY_FOR_OWNER_SINGLE_FORM_SCHEDULING_RETEST`

## Branch

`cursor/p4-1-activity-domain` — do not merge; do not start P4.4/P4.5 work from here
(P4.4 WWW already on same PR; this pass only corrects Discord create scheduling UX).

## Schedule model

- `scheduleKind`: `exact` | `range` | `flexible_period`
- `periodKey` (flexible only): `today` | `tomorrow` | `this_week` | `weekend` | `flexible`
- Resolved `startAt` / `endAt` / `scheduledFinishAt` for sort + expiry
- UX label via `scheduleLabel` (Polish)

## „Kiedy?” options

Dokładny termin · Przedział OD–DO · Dzisiaj · Jutro · W tym tygodniu · W weekend ·
Do ustalenia

## Modal fields (one form)

Nazwa · Kiedy? · OD (opcjonalnie) · DO (opcjonalnie) · Opis

## Edit pre-filled

Yes — draft payload restores name/description/when/OD/DO defaults.

## Ephemeral policy

One preview message per create/edit session; edit uses modal `update` in place.

## Live API smoke (guild `1534228693017432124`)

- this_week publish: OK
- exact publish: OK
- weekend publish: OK
- range publish: OK
- reschedule flexible→exact: OK
- Owner Discord click-through (modal + ephemeral count) still required

## Explicitly not done

P4.5, merge, Zeabur.
