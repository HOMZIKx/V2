# Identity Foundation — model i architektura (P2 planning)

Dokument planistyczny. Nie stanowi jeszcze Accepted ADR bez DEC-003+.
Szczegółowy handoff: [P2_IDENTITY_FOUNDATION_HANDOFF.md](../ai/P2_IDENTITY_FOUNDATION_HANDOFF.md).

## Pozycja w systemie

```text
                    ┌──────────── web / admin / (future desktop) ────────────┐
                    │  cookie session (opaque)                                │
                    └─────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │   identity-service   │  owns DB `identity`
                               │  User / ExtId / Sess │  (+ Redis session store)
                               └──────────┬───────────┘
                                          │ signed internal context (DEC-009)
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
             api-gateway          domain services      authorization-service
             (edge)               (future)             (P3 RBAC — not P2)
```

## Encje

| Encja            | Znaczenie                            |
| ---------------- | ------------------------------------ |
| User             | Centralny podmiot V2                 |
| ExternalIdentity | Discord / Google / przyszły provider |
| Session          | Sesja logowania; revoke one / all    |

Guild Membership / Guild Profile / Permissions — **poza P2**.

## Providerzy P2

- Discord OAuth2 (user login)
- Google OAuth

Rozszerzalność: interfejs providera w Application layer; infrastruktura implementuje adaptery.

## Separacja od P1 Discord bot

| P1 harness         | P2 Identity                        |
| ------------------ | ---------------------------------- |
| Bot token          | OAuth client id/secret użytkownika |
| Guild-scoped slash | Browser OAuth redirects            |
| Operator allowlist | V2 User + sessions                 |

Sekrety nigdy nie są współdzielone między tymi trybami.
