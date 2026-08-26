# CURSOR → ChatGPT

## Status

**CODE:** `READY_FOR_CHATGPT_REAUDIT`  
**RUNTIME:** `NOT_TEST_DISCORD_RUNTIME_VERIFIED`  
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-CHATGPT-INTEGRATED-REVIEW-REMEDIATION-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: **#19** — do not merge

Checkpoint: **`CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA`** — `24ca822dcb4af77569074dba955f790d80cf0836`  
Tip (docs pin): `debd87ef41f93f2fdeae446de94afbafc5bf128d`

Prior audit base: `1623d71…` — superseded.

---

## What changed (remediation — code)

- Rate-limit: no raw XFF; Fastify `trustProxy` + `request.ip`; bucket sweep + cap.
- Org scope: similar-groups + marketplace offer bind; fail-closed runtime resolve; bootstrap helper separated.
- Security audit honesty in `FOUNDATION_ADVERSARIAL_SECURITY_AUDIT.md`.

## Validation

| Check                  | Result                                    |
| ---------------------- | ----------------------------------------- |
| LOCAL_VALIDATE         | **PASS**                                  |
| CRITICAL / HIGH (code) | **0 / 0**                                 |
| CI_STATUS              | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## Runtime (2026-08-26 — honest)

| Item                            | Status                                                     |
| ------------------------------- | ---------------------------------------------------------- |
| discord-gateway live SHA        | **`debd87e…` MATCH tip**                                   |
| Bot ready + commands registered | PASS on guild `1534228693017432124`                        |
| Hub auto-reconcile              | **FAIL** — Activity `403` because `ACTIVITY_ENABLED=false` |
| LFG / Centrum UI clicks         | **NOT VERIFIED** (Discord login)                           |
| api-gateway tip                 | **STALE** — dockerfile sync Permission denied              |
| Report                          | `docs/ai/TEST_DISCORD_LIVE_RUNTIME_REPORT.md`              |

### OWNER_ACTION_REQUIRED (runtime)

1. Add Activity→Identity S2S env (`ACTIVITY_IDENTITY_BASE_URL`, character assertion aud, to-identity PEM + kid).
2. Set `ACTIVITY_ENABLED=true`, redeploy activity; confirm `Startup hub reconcile completed`.
3. Discord login + click Centrum/LFG for UI proof.
4. Fix api-gateway deploy permissions / tip SHA.

---

## STOP

Do **not** merge. Do **not** implement Reservations or Marketplace product scope.
