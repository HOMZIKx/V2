# ADR-0010: Multi-provider identity and account linking

- **Status:** Proposed
- **Data:** 2026-08-05
- **Task:** `P2-IDENTITY-FOUNDATION-001` (planning)
- **Depends on:** DEC-003 (owner + ChatGPT)

## Kontekst

Obowiązujące dziś:

- `NON_NEGOTIABLES`: logowanie wyłącznie Discord OAuth; konto jednoznacznie związane z Discord User ID.
- D-016: konto oparte wyłącznie na Discordzie.
- ADR-0001: „logowanie przez Discord OAuth…”.

Kierunek właściciela dla P2 (2026-08-05): Identity dla całej platformy; Discord OAuth2 **oraz** Google OAuth; centralny użytkownik V2 niezależny od providera; wiele zewnętrznych kont przy jednym Userze; architektura na kolejnych providerów.

To jest **zmiana konstytucyjna**. Cursor nie aktualizuje `NON_NEGOTIABLES` unilaterarnie.

## Decyzja (proponowana — po DEC-003)

1. V2 utrzymuje **własny stabilny User ID** jako klucz platformy.
2. Discord i Google są **równorzędnymi providerami** `ExternalIdentity` w P2.
3. Rdzeń Identity jest **provider-agnostic** (strategia/plugin per provider: authorize URL, token exchange, subject extraction).
4. Account linking: użytkownik w sesji może dowiązać kolejnego providera; **subject już zajęty przez innego Usera → reject**.
5. **Automatyczne łączenie kont wyłącznie po zbieżności emaila jest domyślnie zabronione**, dopóki DEC-005 nie stanowi inaczej.
6. Discord pozostaje ważnym providerem społecznościowym, ale **nie** jest centralnym kluczem całej platformy.

## Proponowane supersession (po akceptacji właściciela)

| Artefakt                    | Zmiana                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| D-016                       | Zastąpić: „Konto multi-provider; Discord nie jest jedynym IdP”                      |
| NON_NEGOTIABLES § Tożsamość | Usunąć „wyłącznie Discord”; zapisać V2 User + ExternalIdentity; Discord/Google w P2 |
| ADR-0001 bullet OAuth       | Zastąpić odniesieniem do tego ADR + ADR-0011                                        |
| D-017                       | Przeformułować w DEC-006 (sesje vs utrata membership Discord)                       |

## Konsekwencje

- Użytkownik może istnieć z samym Google (jeśli polityka produktowa na to pozwoli — DEC-006).
- Moduły nie mogą zakładać „brak Discord ID = brak Usera”.
- Bot Discord (P1) nadal używa Application/Bot tokenu — osobny sekret od OAuth user login.

## Status

**Proposed.** Bez DEC-003 Accepted implementacja multi-provider jest zablokowana.
