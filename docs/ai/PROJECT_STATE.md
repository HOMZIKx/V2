# PROJECT_STATE

## Status

`READY_FOR_OWNER_DISCORD_VISUAL_REVIEW`

## Explicit gates

- **NO MERGE**
- **NO P4.5**
- **NO P4.6**
- **NO RABBITMQ**
- Issue #20 **NOT IMPLEMENTED**
- **ADMIN REDESIGN NOT STARTED**
- **WWW REDESIGN NOT STARTED**
- Discord visual is **not** approved until owner reviews the live panel

## Active phase

`P4-DISCORD-FINAL-CLOSURE-AND-VISUAL-001`

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- Baseline HEAD: `885ee5789dd1440d7b883657db46aa4fa9e920a0`

## Delivered in this delta

### PHASE A

- Prettier on `docs/ai/CURSOR_TO_CHATGPT.md`
- Draft edit uses `deferUpdate` on the existing preview (no stacked ephemerals)
- Create/LFG still `deferReply` then HTTP; ACK before delayed ActivityHttpClient
- Edit modal prefill from signed preview snapshot (no HTTP before `showModal`)
- Unchanged draft fields merged on submit
- WWW 401: UnauthorizedState on Activities / Detail / My / Inbox; My Activities
  anonymous no longer stuck on loading

### PHASE B

- Hub rebuilt into **DZIAŁAJ** / **TWOJE** groups, short Polish copy
- Accent remains `#D48632` / `0xD48632`; hub buttons Secondary only
- Event post: title → termin → miejsca, then description/organizer, RSVP first
- Draft preview: Container + name/termin/opis + Edytuj/Publikuj
- No V2 LAB import; no decorative emoji; Issue #20 not claimed in copy

## Owner next

1. Review the live Discord Centrum panel (look, hierarchy, premium feel, copy,
   DZIAŁAJ/TWOJE, event post + preview consistency)
2. Run `/centrum-reconcile` on the test guild if the panel was not updated
   in place after local discord-gateway restart
3. Do **not** publish a second panel
4. Zeabur deploy only on owner signal

## Explicitly not done

- Merge to `main`
- P4.5 / P4.6 / RabbitMQ / Issue #20
- Admin / WWW redesign
- Owner Discord visual approval

## Last updated

2026-08-17 — P4-DISCORD-FINAL-CLOSURE-AND-VISUAL-001
