# CURSOR → ChatGPT

## Status

**MODE:** Runtime security boundary remediation
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002`
Branch: `cursor/p4-1-activity-domain`
PR: **#19** — do not merge

Checkpoint: **`RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA`** = `04881cbefe015813e2ae0655757e32a37a73f9ab`
Prior: **`GUILD_CONTROL_DISCOVERY_PREP_SHA`** = `e0e4401f547d577305b8675fed1859f142dfe01d`

---

## Security remediation summary

Removed production fail-open / bypass paths that blocked honest product enablement:

1. **Authorization client** — production no longer falls back to AllowAll; fail-closed when Authz unavailable.
2. **Identity character client** — production no longer uses PassThrough; requires real Identity S2S.
3. **Hub projection S2S** — dedicated `activity_hub_projection` inbound op + Activity use-cases/controller endpoints; Discord gateway calls narrowed projection instead of product authorize paths for Centrum paint/reconcile.
4. **Guards / tests** — `production-stub-guard`, identity client specs, hub-projection-boundary specs.
5. **Owner vars** — `docs/deploy/ZEABUR_OWNER_VARIABLES.md` + `.env.example` note Identity S2S + fail-closed product/LFG.
6. **Ops helper** — `tools/scripts/zeabur-ensure-hub-projection-op.mjs` ensures inbound clients JSON includes hub projection op (no secrets printed).

### Validation

| Check | Result |
| ----- | ------ |
| `corepack pnpm validate` | **PASS** (2026-08-31) |
| Security CRITICAL / HIGH | **0 / 0** |
| `LOCAL_VALIDATE` | **PASS** |

### Runtime (2026-09-01)

| Field | Value |
| ----- | ----- |
| `RUNTIME_STATUS` | `NOT_TEST_DISCORD_RUNTIME_VERIFIED` |
| discord-gateway | `8306f3e` — Hub **PASS** |
| activity / identity | Zeabur **RUNNING**, boot clean, **`ACTIVITY_ENABLED=true`**, port **8080** |
| api-gateway ready | **503** — applied `zeabur-fix-api-gateway-upstream.mjs` (:8080 URLs); still unhealthy → inspect upstream `/health/ready` checks |
| Next | Owner Zeabur console: activity/identity ready bodies; then LFG/profile smoke |

## STOP

No Guild Control · No merge of PR #19 · No force push.
