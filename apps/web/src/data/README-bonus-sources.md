# Equipment bonus data sources

## Baseline (Metin2 PL wiki)

- Additional Zaczarowanie pools: metin2-additional-bonus-pools.json
  - Discrete steps from [Bonusy / Objaśnienie](https://pl-wiki.metin2.gameforge.com/index.php/Bonusy)
  - Existing bonus kinds only (no invented kinds)
- Builtin upgrade ladders: wiki-item-bonus-overrides.json (wikitext via pl-wiki API)
  - Preferred when dobry-temat wiki_upgrade is truncated (~201 chars)

## Projekt Hard overlay

- **ph-equipment-bonus-overrides.json** — presentation `items[*].plus9` + `requiredLevel`
  - At enhancement **+9**, `catalogBonusEntriesForItem` / display builtins prefer these Polish lines
  - `phRequiredLevel()` reads `requiredLevel` (then ph-item `requireLevelByTitle`)
  - Rules: weapons >25 gain Attack Value PvM / Magic Attack Value PvM (`valuesDocumented: false`); lv70 weapons require 85 and SAH +20% at +9
  - Source: [projekt-hard.eu/presentation](https://projekt-hard.eu/presentation)
- **ph-item-bonus-overrides.json** — mid-ladder `upgradeByTitle` applied after wiki (when full +0..+9 ladders are known)
  - See `skipped[]` for intentionally omitted numbers

## Characteristic weapon levels (30 / 75)

- metin2-weapon-characteristic-levels.json / wiki-weapon-characteristic-levels.json
- Editable Średnie Obrażenia + Obrażenia Umiejętności in Szczegóły for lvl 30/75
- PH: weapons above level 25 expose Attack Value PvM / Magic Attack Value PvM inputs (empty until observed)
