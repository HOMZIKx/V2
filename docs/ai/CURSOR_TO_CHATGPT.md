# Cursor → Owner

## 1. Status

`DESTILED_ASSETS_AND_CATALOG_TRUTH`

## 2. Internet-verified (Sura + miecze)

Źródła Gameforge (nie zgadywanie):

- https://en-wiki.metin2.gameforge.com/index.php/Sura/weapons — *Swords can be
  used by Warriors, Ninjas and Suras*; blades = Sura only
- https://pl-wiki.metin2.gameforge.com/index.php/Miecz_Bojowy — klasa: Wojownik,
  Ninja, Sura

Kod i testy to trzymają (`b4b67ce` + ten commit).

## 3. Assets — co jest / czego nie ma

| Co | Stan |
| --- | --- |
| Wygląd itemów EQ | **Pobrane** z oficjalnej pl-wiki → `public/game/items/wiki` (220/220) |
| Ulepszacze | **Pobrane** (157/157) |
| Metiny / bossy (nazwy, respawn) | **W dumpie** `dobry-temat-respawn-catalog.json` |
| Grafiki map (`map_m1.png` itd.) | **Nie** — tylko w Twoim lokalnym dobry-temat → **DEC-063** |
| Rendery klas×płeć | 3/8 → **DEC-062** |

Sync: `python3 tools/scripts/sync-wiki-item-icons.py`

## 4. Marker

`READY_FOR_OWNER_REVIEW` — wrzuć mapy PNG z lokalnego frontend/public.
