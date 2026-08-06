# P4 Centrum Aktywności — Handoff

- **Task ID:** `P4-SPEC-TRANSPLANT-AFTER-P3-001`
- **Status:** `READY_FOR_FINAL_P4_SPEC_AUDIT`
- **Branch:** `cursor/p4-centrum-aktywnosci-spec-v2`
  (fresh from `origin/main` @ `1f23635` — PR #16 merge)
- **Source local commits (order preserved):**
  1. product/architecture/UX/traceability spec
  2. Discord Components V2 interactive layout contract
- **Old PR #17:** closed (superseded) — do not reopen / continue
- **Date:** 2026-08-06
- **Implements code:** **NO** — documentation audit only

## 1. Cel

Kompletna **implementacyjna specyfikacja** Centrum Aktywności (decyzje A–S)
oraz dokładny kontrakt interaktywnych wiadomości Discord **Components V2**.
**Bez** kodu community-service, migracji, endpointów, komend Discord, WWW,
Admin UI, finalnych assetów.

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
| [product/CENTRUM_AKTYWNOSCI.md](../product/CENTRUM_AKTYWNOSCI.md)             | Spec produktowa A–S + §12.1 Components V2                          |
| [architecture/CENTRUM_AKTYWNOSCI.md](../architecture/CENTRUM_AKTYWNOSCI.md)   | Granice, agregaty, etapy P4.1–P4.6, permissions TECH               |
| [ADR-0014](../architecture/decisions/ADR-0014-centrum-aktywnosci-boundary.md) | Boundary **Proposed** (techniczne)                                 |
| [ux/CENTRUM_AKTYWNOSCI_DISCORD.md](../ux/CENTRUM_AKTYWNOSCI_DISCORD.md)       | **Component tree, custom_id, wireframe, interakcje, test payload** |
| [ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md](../ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md)   | WWW P4.4 + Admin P4.3                                              |
| [P4_TEST_TRACEABILITY.md](P4_TEST_TRACEABILITY.md)                            | Macierz + testy layoutu V2                                         |
| `PENDING_DECISIONS.md`                                                        | P4-D\* / TECHNICAL_OPEN / OWNER_DECISION_REQUIRED                  |

## 4. Etapy wdrożenia (po audycie — nie rozpoczęte)

1. **P4.1** Domain + contracts + migrations (no UI)
2. **P4.2** Discord one-shot — Components V2 contract
3. **P4.3** Basic Admin config
4. **P4.4** First WWW
5. **P4.5** Multi-Discord + resilience
6. **P4.6** Series, private, attendance, stats

## 5. Operacje zabronione w tym PR

1. Kod implementacyjny / migracje / UI.
2. Merge do `main` przez agenta.
3. Wymyślanie assetów/copy poza zaakceptowanymi etykietami.
4. Równoległy RBAC; cross-DB Identity/Authorization/Community.
5. Reopen / kontynuacja PR #17.

## 6. Po audycie

Brief `READY_FOR_CURSOR` → start **P4.1** na osobnej gałęzi implementacyjnej.
