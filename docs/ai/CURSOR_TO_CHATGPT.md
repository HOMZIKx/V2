# Cursor → Owner

## Status

Rozszerzone cykle PH na karcie postaci (nie „tylko 3/4”), ikony zgodne z nazwami,
naprawione dodawanie kolejnych setów EQ. Branch `cursor/destiled-cursor-handoff-dfe5`
(PR **#48**).

## Co naprawione w tym torze

- **Postęp PH:** księga, kamień duszy, dowodzenie, polimorfia, górnictwo, combo (≥30),
  jazda (23 h), biolog (≥30). Czytania / biolog → wspólny reset o północy (PH).
- **Ikony** w `apps/web/public/game/progression/` (księga / kamień / Sun Zi /
  polimorfia / górnictwo / Art of Combo / medal / Chaegirab).
- **Sety EQ:** wcześniej po create był tylko 1 starter — brak `createEquipmentSet`.
  Teraz przycisk „Dodaj set” na karcie EQ.
- Ensure na otwarciu karty: brakujące cykle + backfill `iconPath`.

## Nadal open (plan jakości / bot)

1. Prawdziwe API + persistence (dziś localStorage mock)
2. Discord bot reminders ↔ cykle PH / respawny (`/timers`)
3. Zeabur deploy web + bot (osobny projekt od starego `dobry-temat`)
4. Minimapy lochów małp z lokalnego dumpa (owner asset)
5. Live Discord OAuth / eligibility (obecnie mock entry)

## Marker

`READY_FOR_OWNER_REVIEW`
