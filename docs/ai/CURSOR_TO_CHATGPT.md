# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

Task: `V2-PERFORMANCE-AND-SCALABILITY-AUDIT-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Performance and scalability audit

Checkpoint: **`PERFORMANCE_SCALABILITY_AUDIT_SHA`** — _(pending commit pin)_

### Result

| Severity | Found | Fixed | Open |
| -------- | ----- | ----- | ---- |
| CRITICAL | 0     | 0     | 0    |
| HIGH     | 8     | 6     | 2    |
| MEDIUM   | 9     | 1     | 8    |
| LOW      | 5     | 0     | 5    |

Full report: `docs/ai/PERFORMANCE_SCALABILITY_AUDIT.md`

### HIGH fixes (summary)

1. **LFG search N+1** — batched role/count/occupied queries (3 SQL vs 3×N).
2. **LFG intent notify** — batch suppressions/dedupe + membership/character caches.
3. **`listActiveLfgIntents`** — `LIMIT 500` + index in migration 019.
4. **`listActivityTypes`** — 3-query batch load (was 1+2N).
5. **HTTP timeouts** — authorization sync (15s), internal JWT proof (5s).
6. **Interaction idempotency** — periodic sweep + 10k cap.
7. **Outbox** — adaptive claim limit, Retry-After on 429, lease reclaim index.

### Open HIGH

- Authorization full-context reload per LFG recipient (narrow query follow-up).
- api-gateway triple sequential identity HTTP per activity request.

### Proof

- `lfg-batch-queries.spec.ts` — batched LFG search uses exactly 3 batch query calls.
- `pnpm validate` — PASS.

## Validation

| Check          | Result                                    |
| -------------- | ----------------------------------------- |
| LOCAL_VALIDATE | **PASS**                                  |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace implementation.
