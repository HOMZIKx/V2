# CURSOR → ChatGPT

## Status

`READY_FOR_OWNER_AND_CHATGPT_CORE_FOUNDATION_REVIEW`

Task: `V2-CORE-FOUNDATION-CONTINUOUS-RESUME-004`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19  
HEAD: `30ac1d87576fe8ae75d75bc05490e9edd72a3ba9`

## Immutable checkpoints

| Marker | SHA |
| --- | --- |
| CI_SECURITY_CLOSURE_SHA | `f4577fb0e5860c34e269fa3183eef17d4d6106a7` |
| V2_HUB_CORE_CHECKPOINT_SHA | `178a37e1bf3fb83d0ef080453c96da17aa14e5e5` |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA | `ea3e7b97719726aceb5226907a90ad270ca9783e` |
| ACTIVITY_2_LFG_CHECKPOINT_SHA | `24828b7ddee17212775e36be37d2d9edd24ca2d4` |
| RESERVATIONS_CHECKPOINT_SHA | `24828b7ddee17212775e36be37d2d9edd24ca2d4` |
| MARKETPLACE_CHECKPOINT_SHA | `24828b7ddee17212775e36be37d2d9edd24ca2d4` |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA | `24828b7ddee17212775e36be37d2d9edd24ca2d4` |

Stages 5–7 landed in one additive feature commit (`24828b7`) then docs tip (`30ac1d8`).

## Delivered

1. Hub Core finish: interest→role projection safety compute + tests.
2. Notifications Core: `@v2/notification-core`, prefs/mute, DISCOVERY≠TRANSACTIONAL policy, DM deliver + Inbox fallback, Activity cancel → transactional notify.
3. LFG matching domain + intents/watches APIs + discovery-first Hub copy.
4. Reservations schema + conflict detection + create API + transactional notify.
5. Marketplace schema + watch matching + create offer API + discovery notify.
6. Integrated review prep: `docs/ai/CORE_FOUNDATION_INTEGRATED_REVIEW_PREP.md`.

## Validation (local)

- `@v2/notification-core` tests PASS
- `hub-core` LFG matching tests PASS
- `activity-service` vitest 171 passed / 15 skipped
- `discord-gateway` typecheck + related UX tests PASS
- Full `pnpm validate` not re-run on final tip in this turn (targeted suites green)

## Constraints / gaps

- GitHub Issues #20/#24/#27 not re-fetched (repo private; no `gh` auth) — scope locks mirror Owner continuous task text.
- Discord LFG wizard UX still thinner than matching API.
- Reservation/Marketplace Admin+WWW surfaces are foundation, not full product UI.
- Interest role projection apply-to-Discord still pending.
- Live Zeabur outage soak deferred (DEC-001).

## STOP

Before Stage 8. No merge without APPROVED.
