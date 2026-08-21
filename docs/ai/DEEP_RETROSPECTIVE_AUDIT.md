# Deep Retrospective Audit — Auto Discord Sync & Polish

Task: `V2-DEEP-RETROSPECTIVE-POLISH-AND-AUTO-DISCORD-SYNC-001`  
Branch: `cursor/p4-1-activity-domain`  
Baseline HEAD (start): `7948da5d06758e43c0bc7aea6624cb5d8a4e9e29`  
Checkpoint: `DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA` (see PROJECT_STATE)

## Areas inspected

- activity-service (outbox, projections, mutations, Admin hub)
- discord-gateway (deliver, hub reconcile, secrets, config defaults)
- admin / web (idempotency keys, hub save UX)
- api-gateway / identity / authorization (spot checks from prior hunt; no CRITICAL authz fail-open found)
- Zeabur runtime revisions (discord `7948da5…` at audit start)

## Automatic Discord sync matrix

| Source object / event                           | Discord target | Expected auto result            | Status after fix                                                          |
| ----------------------------------------------- | -------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Activity published                              | Event post     | Create once, store `messageId`  | **FIXED** (enriched `PROJECTION_REQUESTED` + write-back)                  |
| Activity edited / reschedule                    | Same message   | Edit in place                   | **FIXED**                                                                 |
| RSVP / leave / waitlist promote / remove        | Same message   | Counts/buttons update           | **FIXED**                                                                 |
| Cancel / finish / start / enrollment open-close | Same message   | Status + disabled actions       | **FIXED** (enqueue gaps closed)                                           |
| Co-organizer / takeover                         | Same message   | Labels update                   | **FIXED**                                                                 |
| Permanent delete                                | Message        | Delete Discord message          | **FIXED** (`remove: true`)                                                |
| Deleted without prior post                      | —              | No-op                           | **FIXED**                                                                 |
| Domain CREATED/RSVP outbox rows                 | —              | Complete without Discord HTTP   | **FIXED** (filter)                                                        |
| Hub channel Admin save                          | Hub panel      | Reconcile/publish automatically | **FIXED** (Admin `updateHub` → reconcile)                                 |
| Hub startup                                     | Hub panel      | Auto reconcile                  | Already present (`DISCORD_AUTO_RECONCILE_HUB_ON_STARTUP`)                 |
| Manual `/centrum-reconcile`                     | Hub            | Emergency only                  | Remains emergency/recovery                                                |
| RabbitMQ-only transport                         | Event post     | Receipt before complete         | **HARDENED** (pure `rabbitmq` no longer marks delivered on publish alone) |

## Bugs found → fix

| Sev      | Finding                                                                                   | Fix                                                                        |
| -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| CRITICAL | Thin outbox payload ≠ gateway `eventPayloadSchema` → permanent fail; auto event sync dead | `buildEventProjectionPayload` + enriched `requestProjection`               |
| CRITICAL | No `messageId` write-back → would spam create                                             | Dispatcher writes projection `messageId`/`delivered` from deliver response |
| CRITICAL | Worker delivered all domain event types to Discord                                        | Only `PROJECTION_REQUESTED` (+ panel repair) hit Discord                   |
| HIGH     | Enrollment/start/takeover/co-org/delete skipped projection                                | Enqueue via `requestProjection`                                            |
| HIGH     | Admin hub channel save required manual publish                                            | `updateHub` auto-reconciles                                                |
| HIGH     | Fresh Idempotency-Key every click                                                         | Stable in-flight key (Admin + WWW)                                         |
| HIGH     | Hardcoded default guild snowflake                                                         | Empty default; snowflake required when Discord enabled                     |
| MEDIUM   | Projection secret `!==` on metadata/validation routes                                     | `timingSafeEqualUtf8`                                                      |
| MEDIUM   | In-memory deliver dedupe unbounded                                                        | Bounded LRU map                                                            |
| MEDIUM   | `rabbitmq` transport completed outbox before Discord apply                                | Fail-retry until http/dual receipt path                                    |

## Manual flows removed from normal ops

- Admin “save hub channel then separately publish” for ordinary channel change → save now syncs Discord.
- Operator restart / `/centrum-reconcile` **not** required for ordinary activity mutations (outbox path).

Emergency-only remaining: `/centrum-reconcile`, Admin reconcile/repair scan, slash bootstrap for first hub on new guild.

## Tests

- `event-projection-payload.spec.ts` — enrich / remove / skip
- `outbox-dispatcher.spec.ts` — domain skip + messageId write-back + secret header
- Existing `activity.use-cases.spec.ts`, projection controller specs — green

## Remaining debt (not CRITICAL/HIGH)

| Sev    | Item                                                                     |
| ------ | ------------------------------------------------------------------------ |
| MEDIUM | Hub message scan still last-100 (under-scan risk for ancient duplicates) |
| MEDIUM | Cross-process Discord interaction dedupe still in-memory                 |
| MEDIUM | Admin guild list N authorize calls                                       |
| LOW    | Hub Core product shell still gated (`HUB-CORE-001` / #22)                |
| LOW    | Owner Discord login still needed for Admin LIVE_GUILD_INVENTORY proof    |

## External blockers

- `HUB-CORE-001` — do not invent Hub Core IA
- Owner Discord login for Admin inventory live PASS (orthogonal)

## AUTO_DISCORD_SYNC_STATUS

**PASS** (code + unit proof). Live E2E on Zeabur for create→RSVP→edit same messageId recorded after deploy of this checkpoint SHA.
