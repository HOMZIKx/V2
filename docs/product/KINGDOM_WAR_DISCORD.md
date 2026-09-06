# Kingdom war (wojna królestw) — Discord reminder (scaffold)

## Product

- Daily war at **18:00 Europe/Warsaw**.
- DM **30 minutes before** → **17:30** (`kingdomWar.notifyMinutesBefore`, default 30).
- Message includes character roster with Discord select to **claim** which character YOU take.
- Claims visible so others see what’s free / covered.
- Characters source of truth: **Kuzyn profile** — this scaffold uses `kingdomWar.characterRosterStub` only (no fake roster API).

## Technika / gateway config

Keys (versioned in-memory on discord-gateway, aligned with Technika draft):

```json
{
  "kingdomWar": {
    "enabled": false,
    "warAt": "18:00",
    "notifyMinutesBefore": 30,
    "messageTemplate": "Wojna królestw o {{warAt}} (Warszawa). Zostało {{minutes}} min — wybierz postać na wojnę.",
    "characterRosterStub": [{ "id": "stub-1", "name": "Postać A (stub)" }]
  }
}
```

- `GET/PATCH /notify/bot-config` with `x-notify-secret`.
- Scheduler: `KingdomWarScheduler` polls ~1/min; fires once per Warsaw day when local time equals `notifyAt`.
- Fan-out: DMs ONLY team members registered via POST /notify/kingdom-war-recipients from web notifyPrefs.kingdomWar (default true). Never whole guild / never operatorIds blast.
- Select `war_claim` signed customId; claims stored in-memory per Warsaw day.

## Out of scope (this slice)

- Technika Apply UI / OpenAPI persistence (draft already exists in admin).
- Real Kuzyn character list.
- Activity / EQ screens.
