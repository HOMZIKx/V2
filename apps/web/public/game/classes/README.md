# Character class renders (DESTILED)

## Desert Warrior (default)

Series: **Desert Warrior** costume showcase from official en-wiki Gameforge
(`File:{Class} ({M|F}) Desert Warrior.png`).

Paths: `/game/classes/{class}-{gender}.png`

## Alternate looks

Additional costume lines live under `/game/classes/looks/{look}/`:

| Look id        | Wiki costume series                         | Path prefix                         |
|----------------|---------------------------------------------|-------------------------------------|
| `desert`       | Desert Warrior                              | `/game/classes/` (legacy root)      |
| `black-desert` | Black Desert Warrior / Desert Warrior (Black) | `/game/classes/looks/black-desert/` |
| `azrael`       | Azrael's Armour                             | `/game/classes/looks/azrael/`       |
| `ice-dragon`   | Ice Dragon Guard                            | `/game/classes/looks/ice-dragon/`   |

Each look has all **8** class×gender frames (`warrior|sura|ninja|shaman` × `male|female`),
sourced as `File:{Class} ({M|F}) {Series}.png`.

All frames are normalized to `272×360`, bottom-aligned on black for character cards.
UI uses `mix-blend-mode: lighten` on `img[src^='/game/classes/']` so the black
plate disappears into Destiled surfaces — characters read as standing without a frame.

Players pick a look in the character profile form; cards and EQ portraits use the
stored `appearanceLook` via `getApprovedCharacterRender(class, gender, look)`.
