# Cursor → ChatGPT

## Status

`READY_FOR_REVIEW`

## Task ID

`P1-DISCORD-TEST-HARNESS-001`

## Branch, commit i PR

- **Branch:** `cursor/p1-discord-test-harness`
- **Finalny commit:** `da0ce51025f336d388817b96329df8b5fd03e082`
- **PR:** [#9](https://github.com/HOMZIKx/V2/pull/9) (draft, bez merge)

## Zakres wykonany

- Adapter `discord.js` **14.25.1**, Gateway/WebSocket + REST v10.
- Walidowana konfiguracja; `DISCORD_ENABLED=false` domyślnie (CI bez tokenu).
- Guild-only `/status` i `/panel-test` na `DISCORD_TEST_GUILD_ID`.
- Panel V2 LAB: select, przyciski, modal, odświeżenie, usuwanie z potwierdzeniem.
- Signed custom IDs (HMAC), strict guild isolation, CLI doctor/register/start/generate-secret.
- Testy Vitest bez live Discorda; redakcja sekretów; override `undici@6.28.0`.
- Dokumentacja: `CREATE_TEST_APPLICATION.md`, `TEST_BOT_SETUP.md`, ADR-0007.
- Artefakty Zeabur (ADR-0008 / Dockerfiles) w repo, **wdrożenie Zeabur odłożone** (DEC-001 DEFERRED).

## Architektura

- Cykl życia klienta: `disabled` → `connecting` → `ready` / `degraded` / `failed` / `stopping`.
- Router w `interface/discord/` (SDK poza application layer).
- Application: authorization, idempotency, deklaracje komend, porty bez Discord SDK.
- Health: `/health/live`, `/health/ready`, `/health/discord`.

## Intents / scopes / permissions

- Intent: **tylko `Guilds`**.
- Scopes: `bot`, `applications.commands`.
- Docelowo minimalne permissions (ADR-0007). **Owner override DEC-002:** na live teście lokalnym bot zainstalowany z Administrator (`permissions=8`) wyłącznie na guild testowym.

## Wyniki automatyczne

```text
pnpm validate (local) → green through runtime-smoke; Docker CLI missing on Windows host (compose validated in CI)
discord.js            → 14.25.1
```

### GitHub Actions

- **PR:** [#9](https://github.com/HOMZIKx/V2/pull/9) (draft, tytuł: `feat(discord-gateway): add p1 discord test harness`)
- **CI (PR tip):** success — https://github.com/HOMZIKx/V2/actions/runs/30981758082
- **CI (push tip):** success — https://github.com/HOMZIKx/V2/actions/runs/30981755469
- **PR Title:** success — https://github.com/HOMZIKx/V2/actions/runs/30981597189
- Gitleaks false positive na historycznym fixture `123456…` naprawiony w `216b809` (`.gitleaks.toml`).

## Manualny live test — SUKCES

- **Guild ID:** `1534228693017432124` (TESTOWY)
- **Application ID:** `1534432424094728364`
- **Bot User ID:** `1534432424094728364`
- **Bot online:** tak (lokalny `pnpm discord:test:start`)
- **`/status` ephemeral:** potwierdzone przez właściciela
- **`/panel-test` + select/modal/odśwież/usuń:** potwierdzone („Wszystko działa”)
- **Global commands:** nie rejestrowane przez harness (tylko guild route)
- **Token / signing secret:** nie logowane w raporcie

## Odstępstwa / dług

- DEC-001 Zeabur B zatwierdzony, potem **wstrzymany** do po P1.
- DEC-002: Administrator na guild testowym (owner) — wrócić do minimalnych uprawnień przed hostingiem.
- Token był kiedyś wklejony do czatu — zalecany Reset Token przed produkcją/Zeabur.
- Lokalny host bez Docker CLI.

## ADR / decyzje

- ADR-0007 Accepted (+ nota o DEC-002).
- ADR-0008 Accepted (config), deploy deferred.
- D-029, D-030 w DECISION_LOG.

## Propozycja kolejnego kroku (bez implementacji)

Audyt ChatGPT → `APPROVED` / merge. Potem ewentualne wznowienie Zeabur albo Identity — wg właściciela.
