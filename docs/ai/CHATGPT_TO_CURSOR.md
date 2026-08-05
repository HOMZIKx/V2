# ChatGPT → Cursor

## Status

`READY_FOR_RE-AUDIT`

## Task ID

`P2-IDENTITY-FOUNDATION-001`

## Nazwa

Zamknięcie planu P2 Identity Foundation po decyzjach właściciela (bez implementacji).

## Cel

Re-audit ChatGPT / właściciela pakietu planistycznego PR #10 po:

1. sync z `main` (P1 merged),
2. zapisaniu DEC-003–009 jako ACCEPTED,
3. ADR-0009…0012 Accepted + NON_NEGOTIABLES,
4. uzupełnieniach security w planie.

**Implementacja P2 nadal zabroniona** do czasu `APPROVED` + merge planu #10 + nowego
briefu `READY_FOR_CURSOR` i osobnego PR implementacyjnego (proof slice Better Auth).

## Dokumenty do re-audytu

1. [P2_IDENTITY_FOUNDATION_HANDOFF.md](P2_IDENTITY_FOUNDATION_HANDOFF.md)
2. [IDENTITY_FOUNDATION.md](../architecture/IDENTITY_FOUNDATION.md)
3. [ADR-0009](../architecture/decisions/ADR-0009-identity-service-boundary.md) — Accepted
4. [ADR-0010](../architecture/decisions/ADR-0010-multi-provider-identity.md) — Accepted
5. [ADR-0011](../architecture/decisions/ADR-0011-session-and-auth-transport.md) — Accepted
6. [ADR-0012](../architecture/decisions/ADR-0012-better-auth-engine.md) — Accepted
7. [NON_NEGOTIABLES.md](../NON_NEGOTIABLES.md) — § Tożsamość
8. [PENDING_DECISIONS.md](PENDING_DECISIONS.md) — DEC-003…009 ACCEPTED
9. [DECISION_LOG.md](../DECISION_LOG.md) — D-016 SUPERSEDED; D-031…033
10. [CURSOR_TO_CHATGPT.md](CURSOR_TO_CHATGPT.md)

## Zakres tego zadania (Cursor)

- Dokumentacja i ADR Accepted wyłącznie.
- Zero kodu Identity / OAuth / ORM / sesji / instalacji Better Auth.
- Bez merge do `main`.

## Kryteria akceptacji planu (re-audit)

- DEC-003–009 trwale w ADR / NON_NEGOTIABLES / Decision Log
- Security supplements (provider tokens, Redis SoT, CSRF/PKCE, data model, boundaries)
- Historia supersession D-016/D-019/D-020 zachowana
- PR mergeable z `main` (P1); zielone CI; docs-only
