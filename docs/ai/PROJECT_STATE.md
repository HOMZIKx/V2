# PROJECT_STATE

## Status

DESTILED Web: lokalny first-slice mock na `cursor/destiled-cursor-handoff-dfe5`
(PR **#48**). Atlasy map = top-down (nie panoramy). Nav wyprawy = **Timery**.

Uczciwy audyt luk: `docs/ai/DESTILED_GAP_AUDIT_2026-09-03.md`.

## Delivered (ten tor)

- 8/8 class×gender PNG @ 272×360 (DEC-062 resolved; spójność poz = open)
- EQ/ulepszacz ikony z pl-wiki; shared swords zweryfikowane
- **`/timers`** = główna powierzchnia respawnów (nav Timery); katalog 19 map /
  31 bossów / 55 metinów z dobry-temat; `/maps` = atlas + party
- Atlasy top-down 512²; panoramy w `map-banners/`
- Loch Pająków V2 z wiki; lochy małp = schematyczny atlas
- Pasek „Podgląd lokalny” (honesty localStorage vs API)

## Not production-ready

- Brak Identity OAuth, player-team API, sync, lease
- `discord-gateway` = P1 LAB only (bez reminderów timerów)
- Targ / P4 Activity = later; Zeabur = DEC-001 deferred

## Marker

`READY_FOR_OWNER_REVIEW` + `GAP_AUDIT_HONEST`
