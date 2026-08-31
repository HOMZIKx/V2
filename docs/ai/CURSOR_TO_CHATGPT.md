# CURSOR → ChatGPT

## Status

**MODE:** Discovery prep only — **no product implementation**  
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-GUILD-CONTROL-AND-MEMBER-MONITORING-DISCOVERY-PREP-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: **#19** — do not merge

Checkpoint: **`GUILD_CONTROL_DISCOVERY_PREP_SHA`** — _(pin after commit)_  
Prior: **`DISCORD_OWNER_UX_CORRECTION_PACK_SHA`** — `2a90a437a048cb7f59cb5dbc88f5e653d4bb7ecf`

---

## Deliverable

Created `docs/ai/GUILD_CONTROL_DISCOVERY_PREP.md` with:

- `CURRENT_CAPABILITY_MATRIX` — authz sync, identity profile, activity admin, partial attendance, missing G8/Guild Control
- `MEMBER_DATA_MATRIX` — tables/APIs per data domain
- `DISCORD_EVENT_MATRIX` — consumed vs available (no new telemetry)
- `G8_IMPLEMENTATION_GAP_MATRIX` — Issue #21 vs P4.6 attendance separation
- `ADMIN_CONTROL_GAP_MATRIX` — reusable Admin vs missing authz/member UI
- `SECURITY_PRIVACY_GAPS` — intents, APPLY gate, retention, cross-guild
- `REUSABLE_FOUNDATION` + Marketplace #28 dependency map (reuse only)
- `OWNER_DECISIONS_REQUIRED` — **5** major decisions (bot-first boundary, G8 vs attendance, telemetry, role automation, Admin scope)

## Validation

| Check                   | Result                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Product code changed    | **NO**                                                                              |
| New telemetry enabled   | **NO**                                                                              |
| `gh issue view` #21–#28 | **Skipped** (CLI not authenticated) — reconcile Issue #21 body in ChatGPT Discovery |

## STOP

No Guild Control · No G8 · No Marketplace · No Reservations · No Community implementation.
