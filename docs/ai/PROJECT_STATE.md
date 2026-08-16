# PROJECT_STATE

## Status

`READY_FOR_OWNER_SINGLE_FORM_SCHEDULING_RETEST` — Discord single-form
scheduling UX on PR #19 (`cursor/p4-1-activity-domain`).

## Active phase

P4.1–P4.4 delivered earlier on same PR. **Do not start P4.5.** No merge.

This pass is a Discord create/edit UX correction (Prompt 1/3 closure), not P4.4 WWW.

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19

## Single-form scheduling (this task)

- Create / LFG → **one** Modal (Label + „Kiedy?” select + OD/DO + opis)
- Submit → **one** ephemeral preview [Edytuj | Publikuj | Anuluj]
- Edit → same modal prefilled; preview **update-in-place**
- Schedule model: `exact` | `range` | `flexible_period` + `periodKey`
  (`today` | `tomorrow` | `this_week` | `weekend` | `flexible`)
- Migration: `004_activity_schedule.sql`
- Public post prefers `scheduleLabel` (no ISO/enums)

## Owner UX note

Accepted architecture §12 sectional draft panel is **overridden for create**
by OWNER decision in this task (one full modal). Recorded for audit.

## Explicitly not done

P4.5, merge, Zeabur, WWW creator, palette rebrand.

## Last updated

2026-08-16 — P4 Discord single-form scheduling UX
