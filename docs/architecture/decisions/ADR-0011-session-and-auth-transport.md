# ADR-0011: Session model and auth transport (P2)

- **Status:** Accepted
- **Data:** 2026-08-05
- **Task:** `P2-IDENTITY-FOUNDATION-001` (planning)
- **Owner decisions:** DEC-008 **A**, DEC-009 **A**; related D-020, DEC-006

## Kontekst

D-020 i NON_NEGOTIABLES wymagają: sesja serwerowa w bezpiecznym cookie; zakaz access
tokenów w `localStorage`; Redis na sesje; wewnętrzny krótkotrwały podpisany kontekst
tożsamości.

Decyzje właściciela 2026-08-05 rozdzielają transport przeglądarkowy od międzyusługowego.

## Decyzja

### Przeglądarka (`web`, `admin`) — DEC-008 A

1. **Opaque server-side session** — brak JWT jako sesji przeglądarkowej.
2. Cookie: `HttpOnly`, `Secure` (poza localhost), `SameSite=Lax` domyślnie, **host-only**
   (bez cookie na całą domenę, chyba że przyszły ADR jawnie zmieni), ograniczony `Path`.
3. Osobne nazwy cookies oraz osobne audience/scope sesji dla **Web** vs **Admin**.
4. **Zakaz** przechowywania access/refresh tokenów OAuth lub JWT użytkownika w
   `localStorage` / `sessionStorage`.
5. **Redis** (restrykcyjny ACL) = session **source of truth** dla szybkiej walidacji i
   unieważniania (aktywny token). Na start: **wyłączony** Better Auth cookie cache /
   stateless mode, aby natychmiastowy revoke nie miał okna ważności. Preferowany mechanizm
   w proof: oficjalne Better Auth `secondaryStorage` (ADR-0012); własny adapter tylko gdy
   proof wykaże konieczność.
6. PostgreSQL: User / Account / Verification oraz ewentualne **bezpieczne metadane/audyt**
   sesji; **database session copy disabled** w sensie używalnego tokenu — bez duplikowania
   tokenu do PostgreSQL bez uzasadnienia.
7. Wymagane: logout current, logout all, revoke by admin/system, **natychmiastowe**
   wygaśnięcie po revoke.
8. Honest storage: model przechowywania tokenu sesji Better Auth musi być udokumentowany
   zgodnie z faktycznym zachowaniem biblioteki (nie twierdzić o haszowaniu, jeśli BA tego
   nie zapewnia) — detal w ADR-0012 / PR implementacyjnym.

### OAuth / CSRF

9. State + **PKCE** dla OAuth; jednorazowe state; krótki TTL; ochrona replay.
10. Allowlista redirect URI / origin — **bez** wildcardów produkcyjnych.

### Provider tokens

11. Nie przechowuj access/refresh tokenów Discord/Google, jeżeli po logowaniu nie są
    potrzebne. Jeśli use case wymaga trwałego przechowania: szyfrowanie aplikacyjne,
    wersjonowane klucze, opisana rotacja. Better Auth nie może niejawnie zostawić surowych
    tokenów providera bez jawnej decyzji konfiguracji.

### Między usługami — DEC-009 A

12. Po walidacji sesji Identity wystawia **krótko żyjący internal JWT** (nigdy jako sesja
    przeglądarkowa):
    - TTL **≤ 5 minut**;
    - wymagane claimy: `iss`, konkretne `aud` per odbiorca, `sub` = V2 User ID, `jti`,
      `iat`, `exp`, `kid`;
    - asymetryczne podpisywanie i rotacja kluczy; **prywatny klucz wyłącznie w Identity**;
    - token **nie** zawiera pełnego RBAC ani danych wrażliwych — uprawnienia rozstrzyga
      Authorization (P3+).

### MFA-ready

13. Model sesji przewiduje przyszłe `amr` / `acr` / step-up **bez** implementacji MFA w P2.

## Odrzucone (dla przeglądarki)

- Czysty JWT access token w przeglądarce jako jedyny mechanizm sesji.
- Refresh token w JS.

## Konsekwencje

- Spójność z natychmiastowym unieważnianiem (DEC-006 C: P2 = revoke API; guild policy P3).
- Redis SoT vs domyślny adapter Better Auth wymaga jawnej warstwy adaptera w proof slice
  (ADR-0012).
