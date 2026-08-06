# P4 Centrum Aktywności — Handoff (spec prep)

- **Task ID:** `P4-CENTRUM-AKTYWNOSCI-SPEC-PREP-001`
- **Status:** `P4_SPEC_READY_LOCALLY_WAITING_FOR_P3_MERGE`
- **Local branch:** `local/p4-centrum-aktywnosci-spec-prep`
  (based on `origin/cursor/p4-centrum-aktywnosci-plan-ea0a`)
- **Push:** **NO** (P3 PR #16 still open — do not pollute PR #17 / remote)
- **Date:** 2026-08-06
- **Depends on:** merge P3 Authorization foundation (PR #16) to `main` before
  any remote P4 update or implementation

## 1. Cel tego zadania

Kompletna **implementacyjna specyfikacja** Centrum Aktywności na podstawie
zatwierdzonych decyzji produktowych właściciela (A–S). **Bez** kodu
community-service, migracji, endpointów, komend Discord, WWW, Admin UI, assetów.

## 2. Stan P3 (sprawdzony na starcie zadania)

| Element    | Stan                                                        |
| ---------- | ----------------------------------------------------------- |
| PR #16     | **OPEN**, not merged (`cursor/p3-authorization-foundation`) |
| Tryb pracy | Lokalna gałąź spec; **bez push**; **bez** update PR #17     |

## 3. Dokumenty SoT (po tym prep)

| Dokument                                                                      | Treść                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [product/CENTRUM_AKTYWNOSCI.md](../product/CENTRUM_AKTYWNOSCI.md)             | Spec produktowa A–S                                         |
| [architecture/CENTRUM_AKTYWNOSCI.md](../architecture/CENTRUM_AKTYWNOSCI.md)   | Granice, agregaty, etapy P4.1–P4.6, permissions TECH        |
| [ADR-0014](../architecture/decisions/ADR-0014-centrum-aktywnosci-boundary.md) | Boundary Proposed (techniczne)                              |
| [ux/CENTRUM_AKTYWNOSCI_DISCORD.md](../ux/CENTRUM_AKTYWNOSCI_DISCORD.md)       | Discord UX skeleton                                         |
| [ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md](../ux/CENTRUM_AKTYWNOSCI_WWW_ADMIN.md)   | WWW P4.4 + Admin P4.3                                       |
| [P4_TEST_TRACEABILITY.md](P4_TEST_TRACEABILITY.md)                            | Macierz decyzja→…→test                                      |
| [GITHUB_ACTIONS_AUDIT.md](GITHUB_ACTIONS_AUDIT.md)                            | Audyt CI (bez zmian YAML)                                   |
| `PENDING_DECISIONS.md`                                                        | P4-D\* zmapowane / TECHNICAL_OPEN / OWNER_DECISION_REQUIRED |

## 4. Etapy wdrożenia (skrót)

1. **P4.1** Domain + contracts + migrations (no UI)
2. **P4.2** Discord one-shot events E2E
3. **P4.3** Basic Admin config
4. **P4.4** First WWW (browse/RSVP/my/inbox; no create)
5. **P4.5** Multi-Discord + operational resilience
6. **P4.6** Series, private events, attendance, stats

Szczegóły AC / rollback / markery: architecture doc §7.

## 5. Mapowanie starych P4-D1–P4-D8

Patrz product doc §22 oraz `PENDING_DECISIONS.md`. **Nie** wyglądają już jak
nierozstrzygnięte decyzje produktowe A–S; pozostałe otwarte = techniczne lub
wizualne.

## 6. Operacje zabronione nadal

1. Kod implementacyjny / migracje / UI.
2. Push na remote / update PR #17 przed merge P3.
3. Merge P3 lub P4.
4. Wymyślanie copy/assetów poza zaakceptowanymi etykietami.
5. Równoległy RBAC w community.
6. Cross-DB Identity/Authorization/Community.

## 7. Po merge P3

1. Świeża gałąź od `main`: `cursor/p4-centrum-aktywnosci-spec-v2`.
2. Przenieść wyłącznie te dokumenty (bez starej sprzecznej historii D1–D8 jako BLOCKED produktowych).
3. Draft PR do audytu → marker `READY_FOR_FINAL_P4_SPEC_AUDIT`.
4. Implementacja dopiero po `READY_FOR_CURSOR` brief.

## 8. Audyt GitHub Actions

Zobacz [GITHUB_ACTIONS_AUDIT.md](GITHUB_ACTIONS_AUDIT.md): brak zmiany YAML;
awarie Set up job = infra GitHub, nie repo.
