import fs from 'node:fs';

const REMEDIATION_SHA = '04881cbefe015813e2ae0655757e32a37a73f9ab';
const today = '2026-08-31';

let ps = fs.readFileSync('docs/ai/PROJECT_STATE.md', 'utf8');

ps = ps.replace(
  /^# PROJECT_STATE\n\n## Status\n\n[\s\S]*?\n## Current execution\n/,
  `# PROJECT_STATE

## Status

\`V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002\` — code **\`LOCAL_VALIDATE PASS\`** · security CRITICAL/HIGH = **0** · runtime **partial** (deploy tip pending)

Product / merge: **NOT APPROVED** · **NOT MERGED** · **NOT CI GREEN** · **NOT RUNTIME VERIFIED AT HEAD**

LFG v1 code path: prior audits **\`READY_FOR_CHATGPT_APPROVAL\`** (\`LFG_CODE_STATUS\`) — **runtime on test Discord is a separate task**.

**STOP Stage 6/7 product expansion** until Owner Discovery closes (see \`docs/ai/OWNER_DISCOVERY_GAPS.md\`).

## Current execution
`,
);

ps = ps.replace(
  /\| CURRENT_TASK\s+\|.*\|/,
  `| CURRENT_TASK            | \`V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002\` (code committed; deploy tip next) |`,
);
ps = ps.replace(
  /\| REVIEW_POSTURE\s+\|.*\|/,
  `| REVIEW_POSTURE          | Security boundary remediation — fail-closed Authz/Identity; narrow hub projection S2S |`,
);
ps = ps.replace(
  /\| CODE_STATUS\s+\|.*\|/,
  `| CODE_STATUS             | \`SECURITY_REMEDIATION_COMMITTED\` — RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA pinned |`,
);
ps = ps.replace(
  /\| CURRENT_HEAD \/ PR_HEAD\s+\|.*\|/,
  `| CURRENT_HEAD / PR_HEAD  | \`${REMEDIATION_SHA}\` |`,
);
ps = ps.replace(
  /\| LOCAL_VALIDATE\s+\|.*\|/,
  `| LOCAL_VALIDATE          | \`PASS\` — format/lint/typecheck/coverage/arch/build/e2e/smoke (2026-08-31) |`,
);
ps = ps.replace(
  /\| RUNTIME_STATUS\s+\|.*\|/,
  `| RUNTIME_STATUS          | \`NOT_TEST_DISCORD_RUNTIME_VERIFIED\` — tip not yet live; prior hub on cbd67aa |`,
);
ps = ps.replace(
  /\| ZEABUR_LIVE_DISCORD_SHA\s+\|.*\|/,
  `| ZEABUR_LIVE_DISCORD_SHA | \`cbd67aaf996d7920a7cc6bb36bc29e6ff9e34beb\` (pre-remediation; redeploy tip) |`,
);
ps = ps.replace(
  /\| ZEABUR_DEPLOY\s+\|.*\|/,
  `| ZEABUR_DEPLOY           | Redeploy identity+activity+discord @ remediation SHA; enable ACTIVITY after Identity S2S healthy |`,
);

if (!ps.includes('RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA')) {
  ps = ps.replace(
    /(\| \*\*GUILD_CONTROL_DISCOVERY_PREP_SHA\*\*\s+\| `e0e4401f547d577305b8675fed1859f142dfe01d` \|[^\n]+\n)/,
    `$1| **RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA** | \`${REMEDIATION_SHA}\` | Fail-closed Authz/Identity; narrow hub projection S2S |\n`,
  );
}

ps = ps.replace(
  /## CRITICAL \/ HIGH\n\n[\s\S]*?(?=\n## LFG v1 delivery)/,
  `## CRITICAL / HIGH

| ID                              | Severity                 | Item                                                                                          |
| ------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| **Security (this remediation)** | **0 CRITICAL / 0 HIGH**  | Production Authz AllowAll + Identity PassThrough removed; hub projection S2S narrowed          |
| CI-BILLING-001                  | CRITICAL (CI green)      | GitHub Actions billing / spending limit — Owner must restore                                  |
| MARKETPLACE-DISC-001            | HIGH (scope)             | Issue #28 — do not treat Stage 7 as done                                                      |
| RESERVATIONS-DISC-001           | HIGH (scope)             | Discovery prep ready — do not expand Reservations product                                     |
| GOVERNANCE-001                  | HIGH (process)           | Owner Discovery gate — see \`OWNER_DISCOVERY_GAPS.md\`                                          |

`,
);

ps = ps.replace(
  /## Last updated\n\n[\s\S]*$/,
  `## Last updated

${today} — \`V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002\`: LOCAL_VALIDATE PASS; RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA=\`${REMEDIATION_SHA}\`; security CRITICAL/HIGH=0; live tip deploy pending.
`,
);

fs.writeFileSync('docs/ai/PROJECT_STATE.md', ps);

const cursor = `# CURSOR → ChatGPT

## Status

**MODE:** Runtime security boundary remediation
Product / merge: **\`NOT_APPROVED\`** · **\`NOT_MERGED\`**

Task: \`V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002\`
Branch: \`cursor/p4-1-activity-domain\`
PR: **#19** — do not merge

Checkpoint: **\`RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA\`** = \`${REMEDIATION_SHA}\`
Prior: **\`GUILD_CONTROL_DISCOVERY_PREP_SHA\`** = \`e0e4401f547d577305b8675fed1859f142dfe01d\`

---

## Security remediation summary

Removed production fail-open / bypass paths that blocked honest product enablement:

1. **Authorization client** — production no longer falls back to AllowAll; fail-closed when Authz unavailable.
2. **Identity character client** — production no longer uses PassThrough; requires real Identity S2S.
3. **Hub projection S2S** — dedicated \`activity_hub_projection\` inbound op + Activity use-cases/controller endpoints; Discord gateway calls narrowed projection instead of product authorize paths for Centrum paint/reconcile.
4. **Guards / tests** — \`production-stub-guard\`, identity client specs, hub-projection-boundary specs.
5. **Owner vars** — \`docs/deploy/ZEABUR_OWNER_VARIABLES.md\` + \`.env.example\` note Identity S2S + fail-closed product/LFG.
6. **Ops helper** — \`tools/scripts/zeabur-ensure-hub-projection-op.mjs\` ensures inbound clients JSON includes hub projection op (no secrets printed).

### Validation

| Check | Result |
| ----- | ------ |
| \`corepack pnpm validate\` | **PASS** (2026-08-31) |
| Security CRITICAL / HIGH | **0 / 0** |
| \`LOCAL_VALIDATE\` | **PASS** |

### Runtime (honest)

| Field | Value |
| ----- | ----- |
| \`RUNTIME_STATUS\` | \`NOT_TEST_DISCORD_RUNTIME_VERIFIED\` until tip is live + Hub/reconcile proven |
| Pre-deploy discord live SHA | \`cbd67aa…\` (PNG hub path; not remediation tip) |
| Next | Push tip → redeploy identity + activity + discord-gateway → set \`ACTIVITY_ENABLED=true\` only after Identity INTERNAL_JWT / S2S healthy |

## STOP

No Guild Control · No merge of PR #19 · No force push.
`;
fs.writeFileSync('docs/ai/CURSOR_TO_CHATGPT.md', cursor);

const report = `# TEST Discord live runtime report

Task: \`V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002\`
Date: **${today}**
Related: prior integrated review remediation, hub PNG paint
Guild: \`1534228693017432124\` (TEST Discord)

**No secrets in this document.**

---

## Summary

| Field | Value |
| ----- | ----- |
| **RUNTIME_STATUS** | \`NOT_TEST_DISCORD_RUNTIME_VERIFIED\` |
| **CODE_STATUS** | Security remediation committed @ \`${REMEDIATION_SHA}\` |
| **LOCAL_VALIDATE** | \`PASS\` (full \`pnpm validate\`, ${today}) |
| **Security CRITICAL/HIGH** | **0 / 0** |
| **Partial proof (pre-tip deploy)** | discord-gateway live @ \`cbd67aa\` — bot ready, commands registered, health ok |
| **Hard blockers for VERIFIED** | Tip SHA not yet on Zeabur; full Hub+LFG/profile smoke not re-proven after remediation |

---

## Git / deploy

| Field | Value |
| ----- | ----- |
| BRANCH | \`cursor/p4-1-activity-domain\` |
| PR | #19 — **do not merge** |
| RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA | \`${REMEDIATION_SHA}\` |
| REMOTE tip (at report write) | push pending / see post-deploy section |
| Pre-deploy DISCORD_GATEWAY_RUNNING_SHA | \`cbd67aaf996d7920a7cc6bb36bc29e6ff9e34beb\` |

---

## Running revision (verified ${today} pre-redeploy)

| Service | URL / source | \`gitCommitSha\` | State |
| ------- | ------------ | ---------------- | ----- |
| **DISCORD_GATEWAY_RUNNING_SHA** | \`https://v22.zeabur.app/health/live\` | \`cbd67aaf996d7920a7cc6bb36bc29e6ff9e34beb\` | live/ready/discord **PASS**; **not** remediation tip |
| discord bot | \`/health/discord\` | same | \`ready\`, guild match, \`commandsRegistered: true\`, \`isolationOk: true\` |
| **ACTIVITY_SERVICE_RUNNING_SHA** | pending tip redeploy | _(update post-deploy)_ | Identity S2S configured in prior work; \`ACTIVITY_ENABLED\` enable **after** identity+activity healthy on tip |
| Security bypasses | code @ remediation SHA | AllowAll / PassThrough **removed** in source | must be live after redeploy |

---

## Discord target

| Field | Value |
| ----- | ----- |
| GUILD_ID | \`1534228693017432124\` |
| HUB_CHANNEL_ID | \`1534228693449179146\` |
| HUB_MESSAGE_ID | \`1544034743614570589\` (from prior startup direct-paint log; **reconfirm after tip redeploy**) |
| COMMAND_REGISTRATION | **PASS** on pre-tip live |

---

## Security boundary (code)

| Item | Status |
| ---- | ------ |
| Production Authz AllowAll | **REMOVED** (fail-closed) |
| Production Identity PassThrough | **REMOVED** (requires S2S) |
| Hub projection inbound op | \`activity_hub_projection\` + Activity endpoints |
| Product/LFG without real Authz/Identity | **fail-closed** |

---

## HUB / LFG / profile (post-deploy — fill after tip live)

| Check | Result |
| ----- | ------ |
| Hub visible (single Centrum, PNG) | **PENDING** tip redeploy |
| Hub reconcile / direct paint | **PENDING** |
| Duplicate Centrum | **PENDING** |
| LFG / profile / DM smokes | **NOT VERIFIED** this pass |

---

## Post-deploy evidence

_(Updated in follow-up docs commit after Zeabur tip deploy + optional \`ACTIVITY_ENABLED=true\`.)_

| Field | Value |
| ----- | ----- |
| ACTIVITY_ENABLED | _(pending)_ |
| identity / activity / discord live SHAs | _(pending)_ |
| Hub message id confirmed | _(pending)_ |
| RUNTIME_STATUS | remains \`NOT_TEST_DISCORD_RUNTIME_VERIFIED\` until Hub visible + reconcile proven on tip |
`;
fs.writeFileSync('docs/ai/TEST_DISCORD_LIVE_RUNTIME_REPORT.md', report);

console.log('docs updated OK');
