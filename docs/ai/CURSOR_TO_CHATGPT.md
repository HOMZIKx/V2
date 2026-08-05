# CURSOR_TO_CHATGPT

## Status

`READY_FOR_RE-AUDIT`

## Summary

Zamknięto planistyczny PR **#10** (`planning/p2-identity-foundation`) według
review właściciela „Decyzje właściciela i instrukcja zamknięcia planu P2”:

1. Zsynchronizowano gałąź z `main` zawierającym scalony P1 (`c82d6bd`, PR #9 /
   Components V2) — konflikty docs rozwiązane **bez cofania** zmian P1.
2. Zapisano decyzje właściciela **DEC-003–009** (2026-08-05) jako ACCEPTED;
   D-016 → SUPERSEDED; D-031 / D-032 / D-033; D-019/D-020 doprecyzowane.
3. ADR-0009 / 0010 / 0011 → **Accepted**; dodano **ADR-0012** (Better Auth
   engine behind Identity ports + oficjalny Fastify handler).
4. Zaktualizowano `NON_NEGOTIABLES` § Tożsamość, `IDENTITY_FOUNDATION.md`,
   handoff, `PENDING_DECISIONS`, Decision Log, SYSTEM/SERVICE/DATA ownership,
   ADR-0001 bullet OAuth.
5. Security supplements: provider tokens, Redis SoT, CSRF/PKCE/redirect
   allowlist, UNIQUE(provider, accountId), e-mail ≠ key, no unlink last,
   Identity owns user/account/session/verification.
6. **Zero** instalacji Better Auth, OAuth, sesji, DB, UI logowania — wyłącznie
   dokumentacja / ADR.

## Branch / PR

- Branch: `planning/p2-identity-foundation`
- PR: https://github.com/HOMZIKx/V2/pull/10
- Base: `main` (po merge P1 `c82d6bd`)
- Tip SHA: `c0bf0f36bea0025f16c333aea830270fd39d2b62` (zaktualizować po kolejnym push tip-align)
- PR title: `docs(identity): add p2 identity foundation planning package`
- Mergeable: `true` / `clean` (draft; **bez merge**)

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

| Check                      | Wynik                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm format:check`        | PASS                                                                                                 |
| `pnpm lint`                | PASS                                                                                                 |
| `pnpm typecheck`           | PASS                                                                                                 |
| `pnpm architecture:check`  | PASS                                                                                                 |
| `pnpm validate` (lokalnie) | FAIL tylko na `docker compose config` (brak Docker CLI); wcześniej PASS coverage/build/runtime-smoke |
| CI `@ c0bf0f3`             | **PASS** — Secret scan, Quality gates, Infrastructure integration, Conventional PR title             |

## Risks / debt

- Plan Accepted ≠ implementacja. Proof slice Better Auth wymaga osobnego PR.
- Session storage: Redis SoT (DEC-008) vs domyślny adapter Better Auth — ADR-0012.
- Guild revoke policy odroczona do P3 (DEC-006 C / D-017 zakres).
- Pin wersji Better Auth — w PR implementacyjnym.
- Honest session-token hashing — zależne od faktycznego BA.
- Lokalny brak Docker CLI — CI potwierdził compose.

## Questions for ChatGPT / owner

1. Re-audit i `APPROVED` przed merge PR #10?
2. Pin wersji Better Auth w review planu vs dopiero w PR implementacyjnym (DEC-004)?

## Last updated

2026-08-05 — Cursor
