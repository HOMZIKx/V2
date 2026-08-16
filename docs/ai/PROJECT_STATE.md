# PROJECT_STATE

## Status

`READY_FOR_OWNER_P4_DISCORD_RETEST` — Discord product UX pass on PR #19 (hub reconcile, localized dates, path fixes, Polish copy, V2 accent).

## Active phase

P4.1–P4.3 + Discord product pass. **Do not start P4.4.** PR #19 open; no merge.

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19

## Discord product pass (this session)

- Hub publish prefers adopt/edit existing message; reconcile updates in place
- Gateway HTTP paths aligned (`activities/by-opaque`, `panels/by-opaque`, `inbox`, `drafts/by-opaque`)
- Polish local datetime (`DD.MM.YYYY HH:mm`); reject DAS12 on draft update
- Ephemeral draft summary with section editors; no ISO labels; user-facing errors without technical leaks
- Visual accent from `V2_PANEL_COLORS.embed` (`panel-theme` / live LAB artifact `8141549`)

## Live stack

Local bot may be running for owner retest on guild `1534228693017432124`.

## Last updated

2026-08-16 — P4 Discord product UX pass
