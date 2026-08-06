# Cursor → ChatGPT

## 1. Status

`P4_BATCHED_TECHNICAL_PREP_READY_FOR_COMBINED_AUDIT`

Prior: `READY_FOR_FINAL_P4_SPEC_AUDIT` (transplant PR #18).

Docs-only technical closure + P4.1 plan on the same draft PR. **Brak
implementacji. Brak merge.**

## 2. Task ID

`P4-BATCHED-TECHNICAL-PREP-WHILE-OWNER-AWAY-001`

## 3. P3 dependency (satisfied)

| Element       | Stan                                                             |
| ------------- | ---------------------------------------------------------------- |
| PR #16        | **Merged** → `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e` |
| Issue #15     | **Closed**                                                       |
| PR #17 (plan) | **Closed (superseded)**                                          |
| P0–P3         | **Completed**                                                    |
| Draft PR      | **#18** `cursor/p4-centrum-aktywnosci-spec-v2`                   |

## 4. Deliverables (this batch)

| Doc / section     | Rola                                        |
| ----------------- | ------------------------------------------- |
| architecture §11  | P4-D5 transport comparison + recommendation |
| architecture §12  | P4-D6 panel record / states / reconcile     |
| architecture §13  | P4-D7 full permission ID proposal           |
| architecture §14  | P4-D3 name variants + TECH recommendation   |
| architecture §15  | P4.1 implementation sequence (≤8 commits)   |
| UX §N             | discord.js **14.25.1** Components V2 matrix |
| PENDING_DECISIONS | statuses + owner packets                    |

## 5. Recommendations (not owner decisions)

- **P4-D5:** wariant 5 — sync HTTP + PG transactional outbox; RabbitMQ later →
  `TECHNICAL_RECOMMENDATION_READY_FOR_AUDIT`
- **P4-D6:** durable panel row + state machine + lease/reconcile → same marker
- **P4-D3 TECH pick:** `community-service` / DB `community` (still
  `OWNER_DECISION_REQUIRED`)
- **discord.js:** no upgrade required for Section/`setButtonAccessory` /
  `IsComponentsV2` on 14.25.1; P4.2 uses API already in tree (P1 uses Container)

## 6. Still open for owner

- P4-D3 formal service name
- P4-D7 final permission ID strings
- P4-D8 / Issue #12 visuals
- Accept/reject P4-D5 & P4-D6 technical recommendations
- ADR-0014 Accepted

## 7. Validation

| Check                           | Result                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| Prettier / links / traceability | pass                                                           |
| `pnpm architecture:check`       | pass                                                           |
| `pnpm validate` (once, A+B)     | partial — green through runtime smoke; Docker CLI ENOENT (env) |

HEAD: branch tip on `cursor/p4-centrum-aktywnosci-spec-v2`. Draft PR: #18.

## 8. Marker

`P4_BATCHED_TECHNICAL_PREP_READY_FOR_COMBINED_AUDIT`
