# P4 Centrum Aktywności — Handoff

- **Task ID:** `P4-BATCHED-TECHNICAL-PREP-WHILE-OWNER-AWAY-001`
- **Status:** `P4_BATCHED_TECHNICAL_PREP_IN_PROGRESS` → combined audit marker at end
- **Prior marker:** `READY_FOR_FINAL_P4_SPEC_AUDIT` (transplant done)
- **Branch:** `cursor/p4-centrum-aktywnosci-spec-v2`
  (fresh from `origin/main` @ `1f23635` — PR #16 merge)
- **Draft PR:** #18 (same PR; no second docs PR)
- **Old PR #17:** closed (superseded) — do not reopen / continue
- **Date:** 2026-08-06
- **Implements code:** **NO** — documentation / technical recommendations only

## 1. Cel

Kompletna **implementacyjna specyfikacja** Centrum (A–S), kontrakt Discord
Components V2, oraz **rekomendacje techniczne** P4-D5/D6 + pakiety właściciela
P4-D3/D7. **Bez** kodu community-service, migracji, endpointów, komend Discord,
WWW/Admin UI, finalnych assetów.

## 2. Stan fundamentów

| Element   | Stan                                                             |
| --------- | ---------------------------------------------------------------- |
| P0–P3     | **Completed**                                                    |
| PR #16    | **Merged** → `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e` |
| Issue #15 | **Closed**                                                       |
| PR #17    | **Closed (superseded)**                                          |

## 3. Dokumenty SoT

| Dokument                                                                      | Treść                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [product/CENTRUM_AKTYWNOSCI.md](../product/CENTRUM_AKTYWNOSCI.md)             | Spec produktowa A–S + mapowanie P4-D\*                             |
| [architecture/CENTRUM_AKTYWNOSCI.md](../architecture/CENTRUM_AKTYWNOSCI.md)   | Granice, etapy, §11–§14 TECH, **§15 P4.1 implementation sequence** |
| [ADR-0014](../architecture/decisions/ADR-0014-centrum-aktywnosci-boundary.md) | Boundary **Proposed** (techniczne)                                 |
| [ux/CENTRUM_AKTYWNOSCI_DISCORD.md](../ux/CENTRUM_AKTYWNOSCI_DISCORD.md)       | Component tree + **§N weryfikacja discord.js 14.25.1**             |
| [ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md](../ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md)   | WWW P4.4 + Admin P4.3                                              |
| [P4_TEST_TRACEABILITY.md](P4_TEST_TRACEABILITY.md)                            | Macierz + testy layoutu V2                                         |
| `PENDING_DECISIONS.md`                                                        | P4-D\* / TECHNICAL_OPEN / OWNER_DECISION_REQUIRED                  |

## 4. Rekomendacje TECH (nie Accepted)

| ID    | Status rekomendacji                        | Treść                                      |
| ----- | ------------------------------------------ | ------------------------------------------ |
| P4-D5 | `TECHNICAL_RECOMMENDATION_READY_FOR_AUDIT` | HTTP + PG outbox; RMQ później              |
| P4-D6 | `TECHNICAL_RECOMMENDATION_READY_FOR_AUDIT` | Rekord panelu + stany + reconcile          |
| P4-D3 | rekomendacja `community-service`           | nadal `OWNER_DECISION_REQUIRED`            |
| P4-D7 | katalog §13                                | nadal `OWNER_DECISION_REQUIRED`            |
| P4-D8 | —                                          | assety bez zmian `OWNER_DECISION_REQUIRED` |

## 5. Etapy wdrożenia (po audycie — nie rozpoczęte)

1. **P4.1** Domain + contracts + migrations (no UI) — plan §15 architecture
2. **P4.2** Discord one-shot — Components V2 (Section accessory) — **nie** blocker biblioteki
3. **P4.3** Basic Admin config
4. **P4.4** First WWW
5. **P4.5** Multi-Discord + resilience (+ ewentualnie RMQ)
6. **P4.6** Series, private, attendance, stats

## 6. Operacje zabronione w tym PR

1. Kod implementacyjny / migracje / UI.
2. Merge do `main` przez agenta.
3. Wymyślanie assetów/copy poza zaakceptowanymi etykietami.
4. Równoległy RBAC; cross-DB Identity/Authorization/Community.
5. Reopen / kontynuacja PR #17.
6. Oznaczanie ADR-0014 jako Accepted.

## 7. Po audycie

Brief `READY_FOR_CURSOR` → start **P4.1** na osobnej gałęzi implementacyjnej.
