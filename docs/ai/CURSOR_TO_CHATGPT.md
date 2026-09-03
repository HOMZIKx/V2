# Cursor → Owner

## 1. Status

`DESTILED_EQ_CATALOG_AND_RENDERS`

## 2. Task

Owner: use full dobry-temat catalog (items, bonuses, enhancers, graphics); every
character needs Metin2-correct class×gender art. Also: do not guess — Sura can
wear shared one-handed swords (verify online).

- Branch: `cursor/destiled-cursor-handoff-dfe5`
- Draft PR: **#48**
- Base: `preview/destiled-web`

## 3. Delivered

- **Swords:** `Ekwipunek — Wojownik — Bronie jednoręczne` = Warrior/Ninja/Sura
  (Gameforge Sura/Ninja/Warrior weapons wiki). Two-handed = Warrior only.
  Sura-only blades stay exclusive. Demo card: `Zatruty Miecz +8` on Sura.
- **Bonuses:** parse dobry-temat `wiki_upgrade` ladders; seed/create prefer
  catalog lines (e.g. Bojowa Tarcza `Obrona +57`, Krwawy Hełm `Obrona +41`).
  Truncated dump tokens skipped — no invention.
- **Icons:** wiki image map rebuilt from catalog `image_url` ∩ local files.
- **Ulepszacze:** still not EQ slots; helper `enhancerCatalogItems()`; UI copy
  clarifies.
- **Character art (D-047):** still only 3 approved PNGs; missing listed in
  `listMissingCharacterRenders()` + **DEC-062** (owner must supply from local
  dobry-temat — no AI substitutes).

## 4. Validation

- Unit (catalog/profile/store/equipment): PASS (19 in this set)
- `tsc --noEmit` (apps/web): PASS
- Full monorepo suite / e2e: deferred while owner follow-up queue was non-empty;
  run on next idle pass

## 5. Manual note

Wyczyść sesję / wczytaj demo ponownie — nowe karty i bonusy z katalogu.

## 6. Owner action

Drop missing `{class}-{gender}.png` into `apps/web/public/game/classes/`
(see DEC-062).

## 7. Marker

`READY_FOR_OWNER_REVIEW`
