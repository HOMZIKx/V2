# CURSOR → ChatGPT

## Status

**MODE:** Stage 5 runtime final closure (checkpoint pending UI smoke)
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-STAGE5-RUNTIME-FINAL-CLOSURE-003`
Branch: `cursor/p4-1-activity-domain`
PR: **#19** — do not merge

Checkpoint baseline: **`RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA`** = `04881cbefe015813e2ae0655757e32a37a73f9ab`
Tip: **`ac35d6a…`** (runtime closure WIP)

---

## Runtime progress (2026-09-01)

| Area                              | Result                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| All services ready                | **PASS** @ `9d5fdcd` — identity, activity (`ACTIVITY_ENABLED=true`), api-gateway, discord |
| S2S Activity→Identity             | **PASS** (signed probe, assertion accepted)                                               |
| S2S Activity→Authorization        | **PASS** (internal path; keys + enabled)                                                  |
| S2S Discord→Identity profile      | **PASS** (HTTP 200 test operator profile)                                                 |
| Hub auto-reconcile                | **PASS** — single Centrum `1544034743614570589`                                           |
| LFG / profile / DM / auto-sync UI | **NOT VERIFIED** — see `TEST_DISCORD_LIVE_RUNTIME_REPORT.md`                              |

### Code fixes this session

1. Identity **internal profile S2S** (`afdaa1e`) for discord-gateway assertion mode.
2. **api-gateway** forwards `identity-client-assertion` (`9d5fdcd`).
3. **zeabur-ensure-discord-identity-s2s.mjs** — sync SPKI when PEM exists (`ac35d6a`).

### Validation

Prior full `pnpm validate` **PASS** (2026-08-31). Targeted api-gateway tests **PASS** after proxy fix. Full validate not re-run (deploy/env + narrow code delta).

### Blockers for `TEST_DISCORD_RUNTIME_VERIFIED`

- Manual Discord LFG + profile ephemeral flows
- DM match smoke
- Outbox stuck (`failed: 2`) — auto-sync / recovery proof

## STOP

No Guild Control · No merge of PR #19 · Await ChatGPT final Stage 5 audit after Owner UI smoke.
