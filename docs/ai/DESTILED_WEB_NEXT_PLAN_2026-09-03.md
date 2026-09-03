# DESTILED Web — dalszy plan jakości i spięcia z botem

## Cel

Domknąć mock Web do poziomu „używalny zespół PH”, potem spiąć z Discord botem
i persistence (bez kopiowania architektury `dobry-temat`).

## Już na PR #48 (mock Web)

- Timery respawnu (`/timers`) vs postęp PH na karcie postaci
- Cykle PH z ikonami: księga, kamień duszy, dowodzenie, polimorfia, górnictwo,
  jazda 23 h, biolog ≥30
- EQ: konflikty, wiele setów (`Dodaj set`), lokalizacja, katalog
- Discord entry mock + zaproszenia (honest boundaries)

## Kolejność dalszej implementacji

1. **Persistence API** — wyjście z localStorage; workspace/character/EQ/timers
   jako kontrakty Application (bez Nest w domain).
2. **Discord bot reminders** — ephemeral/public post per ADR UX; mapowanie
   cykli PH + respawnów; idempotent complete.
3. **Auth / eligibility** — Better Auth / guild proof (ADR-0012); mock → real.
4. **Zeabur preview** — deploy z `preview/destiled-web` (owner redeploy);
   osobny projekt od starego stacka.
5. **Assety owner** — minimapy lochów małp z lokalnego dumpa; bez zgadywania.

## Poza zakresem bez decyzji właściciela

- Alchemy / sash (PH ich nie ma)
- Pełny live game scrape
- Merge do `main` bez `APPROVED`
