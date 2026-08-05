# ChatGPT → Cursor

## Status

`READY_FOR_REVIEW`

## Task ID

`P2-IDENTITY-FOUNDATION-001`

## Nazwa

Pakiet planistyczny fundamentu Identity (bez implementacji).

## Cel

Audyt ChatGPT / właściciela ma ocenić komplet dokumentacji P2 Identity Foundation przygotowany przez Cursor na gałęzi `planning/p2-identity-foundation`.

**Implementacja P2 jest zabroniona** do czasu:

1. `APPROVED` tego planu,
2. rozstrzygnięcia DEC-003 … DEC-009 (lub świadomego odroczenia z wpływem na zakres),
3. wydania nowego briefu implementacyjnego w tym pliku ze statusem `READY_FOR_CURSOR`,
4. rekomendowane: `APPROVED` + merge P1 (`P1-DISCORD-TEST-HARNESS-001`) zgodnie z DEC-007.

## Dokumenty do audytu (obowiązkowe)

1. [P2_IDENTITY_FOUNDATION_HANDOFF.md](P2_IDENTITY_FOUNDATION_HANDOFF.md)
2. [IDENTITY_FOUNDATION.md](../architecture/IDENTITY_FOUNDATION.md)
3. [ADR-0009](../architecture/decisions/ADR-0009-identity-service-boundary.md)
4. [ADR-0010](../architecture/decisions/ADR-0010-multi-provider-identity.md)
5. [ADR-0011](../architecture/decisions/ADR-0011-session-and-auth-transport.md)
6. [PENDING_DECISIONS.md](PENDING_DECISIONS.md) — DEC-003 … DEC-009
7. [CURSOR_TO_CHATGPT.md](CURSOR_TO_CHATGPT.md)
8. [NON_NEGOTIABLES.md](../NON_NEGOTIABLES.md) — sekcja tożsamości (konflikt z briefem)
9. ADR-0001, D-016, D-017, D-019, D-020

## Zakres tego zadania (Cursor — wykonane)

- Wyłącznie dokumentacja i ADR Proposed.
- Zero kodu Identity / OAuth / ORM / sesji.

## Poza zakresem

- Implementacja P2 / P3
- Zmiana `NON_NEGOTIABLES` bez decyzji właściciela
- Merge do `main`
- Zeabur / funkcje biznesowe / RBAC / MFA

## Kryteria akceptacji planu

- Jasne granice Identity vs Authorization
- Model User / ExternalIdentity / Session
- Flow login + linking + session lifecycle
- Security i threat model z uzasadnieniami
- Lista PENDING z wariantami i rekomendacjami
- Definition of Done implementacji
- Brak ukrytego wyboru Better Auth / JWT jako „już zdecydowane” bez DEC

## Operacje zabronione dla Cursora do czasu APPROVED planu

- Implementacja identity-service poza szkieletem
- Dodawanie zależności auth do lockfile „na zapas”
- Rozpoczęcie P3
- Samodzielne uznanie DEC-* za rozstrzygnięte
