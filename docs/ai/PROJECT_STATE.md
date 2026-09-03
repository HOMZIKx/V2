# PROJECT_STATE

## Status

Web / DESTILED track: `DESTILED_MANUAL_TEST_READY` (D-061).

First-slice gotowy do ręcznych testów lokalnych (localStorage mock).
Branch `cursor/destiled-cursor-handoff-dfe5` (PR **#48**). Awaiting owner review.

## Active task

- Task ID: `DESTILED-MANUAL-TEST-READY-001`
- Branch: `cursor/destiled-cursor-handoff-dfe5`
- Draft PR: **#48**
- Base: `preview/destiled-web`
- Focus: frictionless manual testing of agreed first-slice; keep PH logic honest.
- Checklist: `docs/ai/DESTILED_MANUAL_TEST_CHECKLIST.md`
- Analysis: `docs/ai/DESTILED_HUMAN_UX_AND_GAME_LOGIC_2026-09-03.md`

## Manual-test readiness (this pass)

- Demo seed merges by default (does not wipe other workspaces)
- Session reset on entry + dashboard
- Outgoing invites persist with openable `/invitations/{id}` links
- Accept/decline keeps outcome; unknown invite no longer reseeds destructively
- Create-space + demo load feedback; pending invites under „Wymaga uwagi”
- Mobile: EQ slot labels + flip hint + breadcrumbs visible
- History conflict simulator in `<details>`

## Still blocked on owner assets

- Map PNGs from local `dobry-temat/frontend/public`
- Remaining class renders
- Verified weapon/armor sprites (no guessed vnums)

## Open

- Owner review of PR #48.
- Real Discord OAuth / API / bot (out of slice).
