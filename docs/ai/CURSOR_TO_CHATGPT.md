# CURSOR → ChatGPT

## Status

**MODE:** Task 004 live acceptance loop (WIP — not checkpoint)
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-CURRENT-PRODUCT-LIVE-ACCEPTANCE-AND-REPAIR-004`
Branch: `cursor/p4-1-activity-domain`
PR: **#19** — do not merge
Tip: **`97e8f52cfb6aab2e0299815b91ddb10a9d2c9c10`**

---

## This session (2026-09-01 ~21:30 UTC+2)

### Green

| Gate               | Evidence                                                       |
| ------------------ | -------------------------------------------------------------- |
| OUTBOX_STUCK=0     | `v2-api.zeabur.app/health/ready` → failed=0, idle, delivered=7 |
| AUTO_SYNC_SMOKE    | Participation Może będę → delivered 5→7                        |
| PROFILE_LIVE_SMOKE | Discord hub Mój profil ephemeral                               |
| LFG_LIVE_SMOKE     | Discord hub Szukam ekipy wizard                                |
| RECOVERY_SMOKE     | discord-gateway restart → ready, single hub                    |
| ADMIN_* (prior)    | TESTOWY guild, authz link repaired, protected pages            |

### Red / pending

| Gate                    | Blocker                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| DM_LIVE_SMOKE           | No LFG discovery DM yet — needs watch + matching party (KurczakAp or 2nd user)              |
| WWW_MEMBER_SMOKE        | Live web @ `9d5fdcd` — `/profil`, `/dla-mnie`, `/szukam-ekipy` 404; Zeabur deploy API error |
| CI all green            | Local validate fix for `authorization-client.spec.ts`; gh not authed locally                |
| Identity link auto-sync | Tip identity not deployed; `IDENTITY_AUTHORIZATION_ENABLED` still off on live               |

### Code delta (unpushed at session start)

- `authorization-client.spec.ts` — lint (require-await), typecheck (PEM string), prettier
- `live-product-smoke.mts` — prettier (untracked acceptance script)

---

## Next

1. Push validate/CI fix → confirm GitHub Actions green.
2. Seed LFG watch + party → DM_LIVE with button proof.
3. Redeploy web (GitHub zeabur-deploy or Zeabur API recovery).
4. Full admin OAuth cold start after identity deploy.
5. When all markers PASS → `CURRENT_PRODUCT_LIVE_ACCEPTANCE_SHA` + STOP.

## STOP

No Guild Control · No merge of PR #19
