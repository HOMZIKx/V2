# P4 Centrum Aktywności — Handoff (spec prep)

- **Task ID:** `P4-DISCORD-INTERACTIVE-LAYOUT-CONTRACT-001` (kontynuacja spec)
- **Prior:** `P4-CENTRUM-AKTYWNOSCI-SPEC-PREP-001` @ `15cfebe`
- **Status:** `P4_INTERACTIVE_LAYOUT_CONTRACT_READY_LOCALLY`
- **Local branch:** `local/p4-centrum-aktywnosci-spec-prep`
  (based on `origin/cursor/p4-centrum-aktywnosci-plan-ea0a`)
- **Push:** **NO** (P3 PR #16 still open — do not pollute PR #17 / remote)
- **Date:** 2026-08-06
- **Depends on:** merge P3 Authorization foundation (PR #16) to `main` before
  any remote P4 update or implementation

## 1. Cel

Kompletna **implementacyjna specyfikacja** Centrum Aktywności (A–S) **oraz**
dokładny kontrakt interaktywnych wiadomości Discord **Components V2**
(panel sekcji + accessory Button; post wydarzenia; prywatne „Więcej”).
**Bez** kodu community-service, migracji, endpointów, komend, WWW, Admin UI,
finalnych assetów.

## 2. Stan P3

| Element    | Stan                                                        |
| ---------- | ----------------------------------------------------------- |
| PR #16     | **OPEN**, not merged (`cursor/p3-authorization-foundation`) |
| Tryb pracy | Lokalna gałąź spec; **bez push**; **bez** update PR #17     |

## 3. Dokumenty SoT

| Dokument                                                                      | Treść                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [product/CENTRUM_AKTYWNOSCI.md](../product/CENTRUM_AKTYWNOSCI.md)             | Spec produktowa A–S + §12.1 Components V2                          |
| [architecture/CENTRUM_AKTYWNOSCI.md](../architecture/CENTRUM_AKTYWNOSCI.md)   | Granice, agregaty, etapy P4.1–P4.6, permissions TECH               |
| [ADR-0014](../architecture/decisions/ADR-0014-centrum-aktywnosci-boundary.md) | Boundary Proposed (techniczne)                                     |
| [ux/CENTRUM_AKTYWNOSCI_DISCORD.md](../ux/CENTRUM_AKTYWNOSCI_DISCORD.md)       | **Component tree, custom_id, wireframe, interakcje, test payload** |
| [ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md](../ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md)   | WWW P4.4 + Admin P4.3                                              |
| [P4_TEST_TRACEABILITY.md](P4_TEST_TRACEABILITY.md)                            | Macierz + testy layoutu V2                                         |
| [GITHUB_ACTIONS_AUDIT.md](GITHUB_ACTIONS_AUDIT.md)                            | Audyt CI (bez zmian YAML)                                          |
| `PENDING_DECISIONS.md`                                                        | P4-D\* / P4-D8 rozdzielenie layout vs assety                       |

## 4. Kluczowa korekta UX (ten task)

| Było mylone                          | Jest (kontrakt)                                              |
| ------------------------------------ | ------------------------------------------------------------ |
| Statyczny PNG + przyciski pod spodem | Container + Section + accessory Button per funkcja           |
| Klikalne obszary grafiki             | Zakazane — Discord tego nie obsługuje                        |
| Publiczne przyciski admin            | Tylko ephemeral po „Więcej” + P3                             |
| Golden-image całej wiadomości        | Snapshot payload JSON + testy interakcji; golden tylko asset |

## 5. Etapy wdrożenia (bez zmian numeracji)

1. **P4.1** Domain + contracts + migrations (no UI)
2. **P4.2** Discord one-shot — **implementacja wg kontraktu V2**
3. **P4.3** Basic Admin config
4. **P4.4** First WWW
5. **P4.5** Multi-Discord + resilience
6. **P4.6** Series, private, attendance, stats

## 6. Operacje zabronione nadal

1. Kod implementacyjny / migracje / UI.
2. Push / update PR #17 przed merge P3.
3. Merge P3 lub P4; modyfikacja PR #16.
4. Wymyślanie assetów/copy poza zaakceptowanymi etykietami.
5. Równoległy RBAC; cross-DB Identity/Authorization/Community.

## 7. Po merge P3

1. Świeża gałąź od `main`: `cursor/p4-centrum-aktywnosci-spec-v2`.
2. Przenieść dokumenty (w tym kontrakt V2).
3. Draft PR → `READY_FOR_FINAL_P4_SPEC_AUDIT`.
4. Implementacja dopiero po `READY_FOR_CURSOR`.
