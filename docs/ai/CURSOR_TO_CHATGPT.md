# CURSOR_TO_CHATGPT

## Status

`READY_FOR_RE-AUDIT`

## Summary

Poprawki po re-audycie właściciela „Re-audyt P2 — CHANGES REQUIRED przed merge”
(PR #10, wyłącznie planistycznie):

1. Zaktualizowano body PR #10 do stanu faktycznego (ADR-0009…0012 Accepted,
   DEC-003–009 Accepted, D-016 SUPERSEDED, NON_NEGOTIABLES zaktualizowane).
2. Naprawiono błędne odwołania w `PROJECT_STATE` (DEC-002/ADR-0007; DEC-006 C /
   D-017 / ADR-0010).
3. D-017 → status `SCOPE REVISED` (bez `ACCEPTED*`).
4. Rozdzielono ownership logiczny vs storage: PostgreSQL User/Account/Verification
   (+ audyt bez używalnego tokenu); Redis = session SoT; ADR-0012:
   `secondaryStorage` najpierw.
5. Naprawiono tabelę Session w `IDENTITY_FOUNDATION.md`.
6. Raporty bez pętli tip SHA — aktualny HEAD/CI = źródło prawdy w GitHub.
7. **Zero** implementacji Better Auth / OAuth / sesji / DB / UI.

## Branch / PR (stabilne odniesienia)

- Branch: `planning/p2-identity-foundation`
- PR: https://github.com/HOMZIKx/V2/pull/10
- Base: `main` (P1 `c82d6bd`)
- Plan-close merge: `42b0fa2449994e6f4b435700fcaf85913dcd6082`
- Aktualny tip SHA i numery workflow: **GitHub Checks / Actions** (komentarz PR
  po zielonym CI — bez commitowania tip w pętli)

## Rozstrzygnięte decyzje (2026-08-05)

| DEC     | Wybór | Skutek                                                    |
| ------- | ----- | --------------------------------------------------------- |
| DEC-003 | B     | Multi-provider; V2 UUID; supersede D-016                  |
| DEC-004 | A     | Better Auth + Fastify + ports; proof first; pin w impl PR |
| DEC-005 | A     | Tylko jawne linking                                       |
| DEC-006 | C     | P2 = revoke API; guild policy → P3                        |
| DEC-007 | A     | P1 merged; impl po merge planu #10                        |
| DEC-008 | A     | Opaque cookie + Redis SoT; osobne Web/Admin               |
| DEC-009 | A     | Internal JWT ≤5 min; asym; bez pełnego RBAC               |

## Validation

Uruchamiane lokalnie przed push: `pnpm format:check` (+ lint/typecheck/architecture
gdy adekwatne). Pełne CI i Conventional PR Title: zielone na **finalnym HEAD** —
potwierdzone w komentarzu PR z numerami workflow.

## Risks / debt

- Plan Accepted ≠ implementacja. Proof slice Better Auth wymaga osobnego PR.
- Preferencja `secondaryStorage`; własny adapter tylko po dowodzie z proof.
- Guild revoke policy odroczona do P3 (DEC-006 C / D-017 SCOPE REVISED).
- Pin wersji Better Auth — w PR implementacyjnym.
- Honest session-token hashing — zależne od faktycznego BA.

## Questions for ChatGPT / owner

1. Re-audit poprawek → `APPROVED` przed merge PR #10?
2. Pin wersji Better Auth w review planu vs dopiero w PR implementacyjnym (DEC-004)?

## Last updated

2026-08-05 — Cursor (re-audit CHANGES REQUIRED)
