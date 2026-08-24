# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

Task: `V2-FOUNDATION-ADVERSARIAL-SECURITY-AUDIT-002`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Adversarial security audit

Checkpoint: **`FOUNDATION_ADVERSARIAL_SECURITY_AUDIT_SHA`** — (recorded after commit)

### Result

| Severity | Found | Fixed | Open |
| -------- | ----- | ----- | ---- |
| CRITICAL | 0     | 0     | 0    |
| HIGH     | 2     | 2     | 0    |
| MEDIUM   | 3     | 0     | 3    |
| LOW      | 4     | 0     | 4    |

Full report: `docs/ai/FOUNDATION_ADVERSARIAL_SECURITY_AUDIT.md`

### HIGH fixes

1. **H-SEC-01 — Org IDOR:** bind client `organizationId` to `guild_activity_settings.org_id` (`guild-organization-scope.ts`) on publish/LFG/admin composition paths.
2. **H-SEC-02 — Rate limits:** api-gateway in-memory sliding window on OAuth + LFG mutation routes (`rate-limit.ts`).

### Auth / tenant / Discord (reviewed, no new CRITICAL/HIGH)

Production fail-closed on client assertions, actor headers, authorization enabled flag. Discord signed IDs + server revalidation OK. No SSRF/XSS/open-redirect HIGH found.

## Validation

| Check           | Result                                    |
| --------------- | ----------------------------------------- |
| LOCAL_VALIDATE  | **PASS**                                  |
| pnpm audit high | **0** high/critical                       |
| CI_STATUS       | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace implementation.
