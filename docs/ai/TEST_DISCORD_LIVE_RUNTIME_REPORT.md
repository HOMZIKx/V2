# TEST Discord live runtime report

Task: `V2-CURRENT-PRODUCT-LIVE-ACCEPTANCE-AND-REPAIR-004`
Date: **2026-09-01** (session ~21:30 UTC+2)
Guild: `1534228693017432124` (TESTOWY)

**No secrets in this document.**

---

## Summary

| Field                                | Value                                                                 |
| ------------------------------------ | --------------------------------------------------------------------- |
| **RUNTIME_STATUS**                   | `NOT_TEST_DISCORD_RUNTIME_VERIFIED` (004 acceptance loop in progress) |
| **CURRENT_PRODUCT_TECHNICAL_STATUS** | `ACCEPTANCE_WIP` — core Discord flows green; DM + WWW member pending  |
| **CODE_TIP**                         | `97e8f52cfb6aab2e0299815b91ddb10a9d2c9c10`                            |
| **ZEABUR_RUNNING_SHA**               | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4` (deploy drift vs tip)      |

---

## Acceptance markers (2026-09-01 ~21:30)

| Marker               | Result      | Evidence                                                                                                         |
| -------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| ADMIN_OAUTH_LOGIN    | **PARTIAL** | Prior session: OAuth + TESTOWY guild; this session admin session expired                                         |
| ADMIN_SESSION_RELOAD | **PASS**    | Prior session: reload kept guild combobox + protected pages                                                      |
| ADMIN_AUTHORIZATION  | **PASS**    | Authz identity link repaired; guild-list 200 with canonical pair                                                 |
| ADMIN_GUILD_LIST     | **PASS**    | TESTOWY selectable in admin combobox                                                                             |
| PROFILE_LIVE_SMOKE   | **PASS**    | Hub → Mój profil ephemeral @ 21:25; hub REST lists option                                                        |
| LFG_LIVE_SMOKE       | **PASS**    | Hub → Szukam ekipy wizard @ 21:30 (Zmień loch / Dodaj postać / …)                                                |
| DM_LIVE_SMOKE        | **FAIL**    | No discovery DM with Dołącz/Zobacz/Nie teraz/Wycisz in owner inbox yet                                           |
| AUTO_SYNC_SMOKE      | **PASS**    | Może będę click → outbox `delivered` 5→7 (no manual sync)                                                        |
| RECOVERY_SMOKE       | **PASS**    | discord-gateway restart → `discordState=ready`, single hub `1544034743614570589`                                 |
| WWW_MEMBER_SMOKE     | **FAIL**    | `/aktywnosci`, `/moje`, `/powiadomienia` OK; `/profil`, `/dla-mnie`, `/szukam-ekipy` 404 on live web @ `9d5fdcd` |
| OUTBOX_STUCK         | **0 PASS**  | `v2-api.zeabur.app/health/ready`: `failed=0`, `state=idle`, `delivered=7`                                        |
| CI_QUALITY           | **PENDING** | Tip `97e8f52` pushed; local validate fix in progress                                                             |
| CI_INFRA             | **UNKNOWN** | `gh` not authenticated locally                                                                                   |
| CI_SECRET_SCAN       | **UNKNOWN** | verify on GitHub after push                                                                                      |

---

## Outbox (resolved)

Prior stuck state (`failed=2`, `state=stuck`) came from invalid test payloads; archived/repaired earlier in 004.

Live snapshot @ 2026-09-01 ~21:36 UTC:

```json
{
  "pending": 0,
  "claimed": 0,
  "failed": 0,
  "delivered": 7,
  "retrying": 0,
  "state": "idle"
}
```

`OUTBOX_STUCK=0`

---

## Admin auth root cause (Identity ↔ Authorization)

When `IDENTITY_AUTHORIZATION_ENABLED=false`, OAuth login skipped `upsertIdentityLink` → Authorization returned **409 CONFLICT** for legitimate Discord/V2 pair.

Remediation:

1. Manual authz identity link for owner Discord `808066932753563668` + v2 user `828ad2f2-6f54-48c9-8fe5-1b5c2d18f9fa`.
2. Code path: identity login gate upserts link when authz enabled (`login-entitlement-gate.ts`).
3. Activity maps 409 → deny (fail-closed), not upstream error — **not** proof of fix alone.

Deploy tip identity fix + re-enable `IDENTITY_AUTHORIZATION_ENABLED=true` still blocked by Zeabur `deployFromSpecification` Internal Server Error.

---

## Hub

| Field          | Value                                  |
| -------------- | -------------------------------------- |
| HUB_CHANNEL_ID | `1534228693449179146`                  |
| HUB_MESSAGE_ID | `1544034743614570589`                  |
| Hub UI         | Single V2 Centrum panel, PNG assets OK |

---

## Remaining for 004 closure

1. **DM_LIVE**: create safe LFG watch + matching party (needs second organizer or KurczakAp) → verify DM buttons.
2. **WWW_MEMBER**: redeploy `web` to tip (Zeabur deploy API failing; GitHub zeabur-deploy workflow).
3. **CI**: confirm all GitHub Actions green on tip after validate/lint fixes pushed.
4. **ADMIN cold OAuth**: re-run login flow after identity deploy for automatic link sync proof.

---

## STOP

Do **not** merge PR #19. Do **not** start Guild Control.
