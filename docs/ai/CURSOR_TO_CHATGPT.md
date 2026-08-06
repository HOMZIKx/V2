# Cursor → ChatGPT

## 1. Status

`READY_FOR_FINAL_P4_SPEC_AUDIT`

P4 Centrum Aktywności — kompletna specyfikacja + kontrakt Discord Components V2
na świeżej gałęzi od `main` po merge P3. **Brak implementacji. Brak merge.**

## 2. Task ID

`P4-SPEC-TRANSPLANT-AFTER-P3-001`

## 3. P3 dependency (satisfied)

| Element       | Stan                                                             |
| ------------- | ---------------------------------------------------------------- |
| PR #16        | **Merged** → `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e` |
| Issue #15     | **Closed**                                                       |
| PR #17 (plan) | **Closed (superseded)** — replaced by this PR                    |
| P0–P3         | **Completed**                                                    |

## 4. Branch / deliverables

- Branch: `cursor/p4-centrum-aktywnosci-spec-v2`
- Transplanted commits (in order): product/architecture/UX spec + Components V2 contract

| Doc                                        | Rola                                             |
| ------------------------------------------ | ------------------------------------------------ |
| `docs/product/CENTRUM_AKTYWNOSCI.md`       | Spec produktowa A–S                              |
| `docs/architecture/CENTRUM_AKTYWNOSCI.md`  | Agregaty, P4.1–P4.6, permissions TECH            |
| `docs/architecture/decisions/ADR-0014-…`   | Boundary **Proposed**                            |
| `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`    | Components V2 component tree / custom_id / tests |
| `docs/ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md`  | WWW P4.4 + Admin P4.3                            |
| `docs/ai/P4_TEST_TRACEABILITY.md`          | Macierz decyzja→…→test                           |
| `docs/ai/P4_CENTRUM_AKTYWNOSCI_HANDOFF.md` | Handoff                                          |
| `docs/ai/PENDING_DECISIONS.md`             | P4-D\* open / Accepted                           |

## 5. Closed contradictions (vs early planning)

- Discord-only v1 → Discord + Admin + WWW (no WWW create in P4.4)
- Step wizard → one private form
- Hardcoded RSVP-only → configurable statuses + required counterparts
- No multi-Discord → multi for entitled; member = 1 guild
- Static PNG panel → Components V2 Section + accessory Button

## 6. Still open

- P4-D3 service formal name — OWNER_DECISION_REQUIRED
- P4-D5 Outbox/RMQ transport — TECHNICAL_OPEN
- P4-D6 panel publish mechanism — TECHNICAL_OPEN
- P4-D7 final permission ID strings — OWNER_DECISION_REQUIRED
- P4-D8 / Issue #12 visuals — OWNER_DECISION_REQUIRED
- ADR-0014 Accepted

## 7. Validation

| Check                                         | Result                                                                                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier (touched docs + repo `format:check`) | pass                                                                                                                                                                                                                                      |
| Relative links in touched docs (38)           | pass                                                                                                                                                                                                                                      |
| Traceability stages P4.1–P4.6                 | present                                                                                                                                                                                                                                   |
| `pnpm architecture:check`                     | pass                                                                                                                                                                                                                                      |
| `pnpm validate` (once)                        | **partial** — all steps through `test:runtime-smoke` passed; final `docker compose … config` failed with `spawnSync docker ENOENT` (**environment**: Docker CLI absent). Not a repository defect. No empty CI commit. No Actions changes. |

HEAD after transplant: see branch tip. Draft PR: #18.

## 8. Next

After audit APPROVED: **P4.1** domain/contracts (separate brief). No code in this PR.

## 9. Marker

`READY_FOR_FINAL_P4_SPEC_AUDIT`
