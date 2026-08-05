# ADR-0011: Session model and auth transport (P2)

- **Status:** Proposed
- **Data:** 2026-08-05
- **Task:** `P2-IDENTITY-FOUNDATION-001` (planning)
- **Related:** D-020, DEC-008, DEC-009

## Kontekst

D-020 i NON_NEGOTIABLES wymagają: sesja serwerowa w bezpiecznym cookie; zakaz access tokenów w `localStorage`; Redis na sesje; wewnętrzny krótkotrwały podpisany kontekst tożsamości.

W rozmowach pojawiały się JWT / refresh token / rotation jako przykłady — **nie są automatycznie zatwierdzone** dla przeglądarki. Plan P2 musi rozdzielić:

- transport **przeglądarkowy** (BFF / cookie session),
- transport **między usługami** (internal context).

## Decyzja (proponowana)

### Przeglądarka (`web`, `admin`)

1. Utrzymać **opaque server-side session** (potwierdzenie D-020) — **DEC-008**.
2. Cookie: `HttpOnly`, `Secure` (środowiska TLS), `SameSite` uzgodnione per klient; osobne nazwy cookie dla `web` vs `admin` (`clientKind`).
3. **Zakaz** przechowywania access/refresh tokenów OAuth lub JWT użytkownika w `localStorage` / `sessionStorage`.
4. Logout one / logout all unieważnia rekord sesji po stronie serwera (natychmiastowa utrata dostępu).
5. OAuth provider tokens (jeśli w ogóle przechowywane) żyją wyłącznie po stronie Identity, zaszyfrowane; nie są wysyłane do przeglądarki.

### Między usługami

6. Po walidacji sesji Identity wystawia **krótkotrwały podpisany kontekst** (`userId`, `sessionId`, `clientKind`, `authTime`, ewentualnie `amr` placeholder pod MFA) — format w **DEC-009**.
7. Kontekst nie zastępuje sesji przeglądarki; nie trafia do localStorage.

### MFA-ready

8. Model sesji przewiduje przyszłe `amr` / `acr` / step-up **bez** implementacji MFA w P2.

## Odrzucone (dla przeglądarki) — rekomendacja

- Czysty JWT access token w przeglądarce jako jedyny mechanizm sesji — utrudnia natychmiastowe revoke, kłóci się z D-020.
- Refresh token w JS — ryzyko XSS / leakage.

(Jeśli właściciel wybierze inaczej w DEC-008, ADR zostanie zastąpiony.)

## Konsekwencje

- Spójność z natychmiastowym unieważnianiem (ważne też dla przyszłego D-017 / DEC-006).
- Redis: cache/store sesji pod kontrolą Identity; PostgreSQL pozostaje audytowalnym SoT unieważnień (lub pełnym SoT — detal implementacji).

## Status

**Proposed** do potwierdzenia DEC-008 / DEC-009.
