# CURSOR → ChatGPT

## Status

`READY_FOR_CHATGPT_INTEGRATED_CODE_REVIEW`

Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-PR19-FINAL-STABILIZATION-AND-REVIEW-PACKAGE-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: **#19** (170 commits, 593 files, +70k/−882 vs `main`)

## PR #19 review package

Checkpoint: **`PR19_FINAL_STABILIZATION_SHA`** — _set after commit_

Full matrix: `docs/ai/PR19_REVIEW_PACKAGE.md`

### Branch facts (honest)

| Field                | Value                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| BASE (`origin/main`) | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                               |
| HEAD (pre-pin)       | `7e88eb8c8b8995b778cca7a29ee0616851c75c41`                               |
| Commits              | 170                                                                      |
| Scope                | P4.1–P4.6, Hub, Admin, WWW, LFG v1, audits — **large integrated branch** |

### What ChatGPT/Owner should review

1. Governance matrix vs accidental prototype APIs (Reservations/Marketplace).
2. LFG v1 audit chain vs explicit **non**-runtime-verified status.
3. Security + operability audits at checkpoint SHAs (see review package §10).
4. Open deploy/CI blockers — not code-only green.

### What is NOT true

- CI green (billing blocked)
- Live runtime verified at current HEAD (Zeabur SHAs stale)
- Product APPROVED or READY to merge
- Reservations/Marketplace accepted product

## Validation

| Check          | Result                                    |
| -------------- | ----------------------------------------- |
| LOCAL_VALIDATE | **PASS** (re-run at stabilization)        |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Do **not** merge. Do **not** rebase. Do **not** expand Reservations/Marketplace product scope.
