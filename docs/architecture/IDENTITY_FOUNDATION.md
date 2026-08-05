# Identity Foundation — model i architektura (P2 planning)

Dokument planu P2 po decyzjach właściciela 2026-08-05 (DEC-003–009).
Status ADR: **Accepted** 0009–0012. Implementacja kodu — osobny PR po merge planu.

Szczegółowy handoff: [P2_IDENTITY_FOUNDATION_HANDOFF.md](../ai/P2_IDENTITY_FOUNDATION_HANDOFF.md).

## Pozycja w systemie

```text
                    ┌──────────── web / admin / (future desktop) ────────────┐
                    │  opaque HttpOnly host-only cookie (osobne Web vs Admin) │
                    └─────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │   identity-service   │  owns DB `identity`
                               │  User/Account/Sess/  │  Redis session SoT
                               │  Verification        │  Better Auth behind ports
                               └──────────┬───────────┘
                                          │ internal JWT ≤5 min (iss/aud/sub/…)
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
             api-gateway          domain services      authorization-service
             (edge)               (future)             (P3 RBAC — not P2)
```

## Encje (własność Identity)

| Encja / tabela  | Znaczenie                                                      |
| --------------- | -------------------------------------------------------------- |
| User            | Centralny podmiot V2 (UUID)                                    |
| Account / ExtId | Discord / Google; UNIQUE(provider, accountId)                  |
| Session         | Opaque; revoke one/all/admin/system; aktywny token w Redis SoT |
| Verification    | State/PKCE / one-time flow tokens                              |

Guild Membership / Guild Profile / Permissions — **poza P2**.

## Providerzy P2

- Discord OAuth2 (user login; działa bez e-maila)
- Google OAuth

Linking: wyłącznie jawne (`disableImplicitLinking: true`). E-mail ≠ identity key.

## Sesje i transport

- Browser: opaque cookie; Redis SoT; bez cookie cache BA; CSRF/PKCE/redirect allowlist.
- Inter-service: short-lived asymmetric JWT (DEC-009 A).
- Provider tokens: nie przechowuj po loginie, jeśli zbędne; inaczej szyfruj + rotacja kluczy.

## Separacja od P1 Discord bot

| P1 harness         | P2 Identity                        |
| ------------------ | ---------------------------------- |
| Bot token          | OAuth client id/secret użytkownika |
| Guild-scoped slash | Browser OAuth redirects            |
| Operator allowlist | V2 User + sessions                 |

Sekrety nigdy nie są współdzielone między tymi trybami.

## ADR-y

| ADR      | Temat                        | Status   |
| -------- | ---------------------------- | -------- |
| ADR-0009 | Granica Identity + ownership | Accepted |
| ADR-0010 | Multi-provider + linking     | Accepted |
| ADR-0011 | Sesje + internal JWT         | Accepted |
| ADR-0012 | Better Auth engine           | Accepted |
