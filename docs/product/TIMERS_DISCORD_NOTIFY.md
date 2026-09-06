# Timers postaci → Discord PW (produkt)

**Produkt:** powiadomienia Discord dotyczą **timerów postaci** z karty EQ/Timer
(Księga umiejętności, Kamień Duchowy, Dowodzenie, Polimorfia, Górnictwo, Jazda konna).

**Nie** dotyczy timerów map/metin (Zbite/Odłóż na `/timers`). Map-hunt może mieć osobny kod legacy, ale Technika i dokumentacja produktu = `characterTimers` + `kingdomWar`.

## Pętla end-to-end (publication)

1. **OAuth Discord** → `viewer.discordAccountId` (snowflake) w player-store; `viewer.id` preferuje ten snowflake.
2. **WWW Start** na karcie postaci (status Gotowe → Start) → `markTimerDone` + `notifyCharacterProgressTimer`.
3. **discord-gateway** `POST /notify/timer` → DM z przyciskami **Gotowe** / **Przypomnij później**.
4. **Gotowe w DM** → `confirmCharacterProgressTimerFromBot` mutuje `player-team /me/state` (bez WWW).
5. **Technika** `characterTimers.*` + `POST /discord/v1/config/test-dm` (Kuzyn UI).

### Owner identity (WWW ↔ bot) — CRITICAL

| Ścieżka | Klucz `x-demo-viewer-id` |
| --- | --- |
| Web → player-team | `resolvePlayerTeamDemoViewerId` = `discordAccountId` (bare snowflake) gdy znany |
| Bot Gotowe | `canonicalOwnerViewerId(interaction.user.id)` = bare snowflake |
| Legacy alias | `discord:<snowflake>` jest normalizowany w player-team `assertDemoAccess` oraz próbowany w confirm |

Bez zgodnego snowflake Gotowe zwraca `timer_not_found` (stan leży pod innym owner key).

## Technika (OpenAPI)

| Klucz | Znaczenie |
| --- | --- |
| `characterTimers` | Moduł docelowy (enabled, messageTemplate, reminderMinutesBefore, resetNotifyEnabled) |
| `timersNotify` | Alias tej samej semantyki (kompatybilność) |
| `kingdomWar` | Wojna królestw (bez zmian) |
| `notify-timer-enabled` | S2S gate na `/notify/timer` |
| `guilds[guildId].modules.characterTimers` | Per-guild enforce na notify + DM Gotowe (po Apply) |
| `guilds[guildId].rights` | Wymaga `discord.notify` gdy mapa guildii niepusta |

`notify-timer-dm-action-buttons` / Zbite/Odłóż **nie są** w katalogu capabilities Technika.

## Env (bez wartości sekretów)

| Zmienna | Gdzie | Uwagi |
| --- | --- | --- |
| `DISCORD_NOTIFY_SHARED_SECRET` | web server + discord-gateway | header `x-notify-secret` |
| `DISCORD_TECHNIKA_SHARED_SECRET` | web server + discord-gateway | header `x-technika-secret` (Apply / guilds PUT / test-dm) |
| `DISCORD_COMPONENT_SIGNING_SECRET` | discord-gateway | ≥32 bajty |
| `DISCORD_TEST_GUILD_ID` | discord-gateway | **1534228693017432124** (TEST only) |
| `DISCORD_TEST_OPERATOR_IDS` | discord-gateway | m.in. Mateusz `808066932753563668` |
| `PLAYER_TEAM_BASE_URL` | discord-gateway | domyślnie `http://127.0.0.1:4400` |
| `PLAYER_TEAM_DEMO_VIEWER_HEADER` / `NEXT_PUBLIC_…` | gateway + web | `x-demo-viewer-id` |
| `NEXT_PUBLIC_IDENTITY_AUTH_BASE_URL` | web | Identity `:4200` |
| Discord OAuth redirect | Developer Portal | `http://127.0.0.1:4200/api/auth/callback/discord` |

## Reminder durability (honest)

Przypomnienie ~`reminderMinutesBefore` przed końcem idzie z **lokalnego schedulera przeglądarki** (`scheduleCharacterTimerReminder`) — best-effort. Zamknięta karta / inna przeglądarka = brak reminder. Scheduler po stronie gateway = kolejny krok (nie udajemy E2E green).

## Deploy / smoke — TEST guild only (`1534228693017432124`)

Ports: web `:3000`, discord-gateway `:4100`, identity `:4200`, player-team `:4400`.

1. Restart **discord-gateway** + **Next web** po zmianie sekretów.
2. `GET http://127.0.0.1:4100/health/ready` → bot `ready`.
3. Zaloguj Discord OAuth w WWW — store: `viewer.discordAccountId` = Twój snowflake; player-team header = ten sam snowflake (nie UUID, nie `discord:` prefix).
4. `PUT /discord/v1/guilds/1534228693017432124` (header `x-technika-secret`) z `enabled:true`, `modules.characterTimers:true`, `rights` zawierające `discord.notify` → `POST /discord/v1/config/apply`.
5. Włącz global `characterTimers.enabled` + `notify-timer-enabled` → Apply. Opcjonalnie test-dm.
6. Karta postaci → Timery → **Start** → PW z **Gotowe** / **Przypomnij później**.
7. **Gotowe** w DM → ephemeral OK; odśwież kartę — timer w toku (player-team revision↑).
8. Main guild = później; `DISCORD_STRICT_GUILD_ISOLATION=true`.

Zamknięte DM: `{ ok: true, skipped: "dms_closed" }`.


## notifyPrefs (HARD)

Timer/war DM fan-out = **only** current team members with `notifyPrefs.characterTimers` / `kingdomWar` true (default true if missing). Never expands to a Discord guild roster.

## Pliki kluczowe

- `apps/web/src/character-timer-discord-notify.ts` — hook Start/reminder
- `apps/web/src/player-team-online-api.ts` — `resolvePlayerTeamDemoViewerId`
- `apps/discord-gateway/.../owner-viewer-id.ts` — kanoniczny snowflake + aliasy
- `apps/discord-gateway/.../confirm-character-timer.ts` — Gotowe bez WWW
- `apps/discord-gateway/.../guild-module-gate.ts` — enforce `guilds.*.modules`
- `apps/discord-gateway/.../capabilities.ts` — `characterTimers`
