# ADR-0010: Multi-provider identity and account linking

- **Status:** Accepted
- **Data:** 2026-08-05
- **Task:** `P2-IDENTITY-FOUNDATION-001` (planning)
- **Owner decisions:** DEC-003 **B**, DEC-005 **A**, DEC-006 **C**

## Kontekst

Wcześniej obowiązywało:

- `NON_NEGOTIABLES`: logowanie wyłącznie Discord OAuth; konto związane z Discord User ID.
- D-016: konto oparte wyłącznie na Discordzie.
- ADR-0001: „logowanie przez Discord OAuth…”.

Decyzja właściciela 2026-08-05 (DEC-003 B): Identity dla całej platformy; Discord OAuth2
**oraz** Google OAuth; centralny użytkownik V2 niezależny od providera; wiele zewnętrznych
kont przy jednym Userze; architektura na kolejnych providerów.

## Decyzja

1. V2 utrzymuje **własny stabilny User UUID** jako klucz platformy — niezależny od Discord
   ID oraz adresu e-mail.
2. Discord i Google są **providerami** `ExternalIdentity` w P2 (Discord pozostaje kluczowym
   kanałem produktu, ale **nie** jest technicznym kluczem głównym użytkownika).
3. Rdzeń Identity jest **provider-agnostic** (strategia/plugin per provider).
4. **Unikalność** `(provider, providerAccountId)` / `(provider, providerSubject)` —
   subject zajęty przez innego Usera → reject (ochrona przed takeover).
5. **E-mail nie jest kluczem tożsamości** i **nie** uruchamia auto-link.
6. Account linking: **wyłącznie jawne** (DEC-005 A). W Better Auth:
   `disableImplicitLinking: true`. Dodatkowy provider linkuje tylko zalogowany użytkownik
   w jawnym flow. Kolizja istniejącego e-maila → kontrolowany komunikat, **bez** scalania.
7. Discord może **nie zwrócić e-maila** — login nadal musi być możliwy na podstawie
   provider account ID.
8. **Nie wolno odłączyć ostatniego providera** bez wcześniejszego dodania innej metody
   dostępu.
9. Utrata Discorda / członkostwa guild **nie** usuwa automatycznie globalnego V2 User ani
   konta Google (DEC-006 C). Guild-scoped revoke policy → P3; P2 dostarcza revoke API.

## Supersession

| Artefakt                    | Zmiana                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| D-016                       | **SUPERSEDED** → D-032 / ten ADR                                                    |
| NON_NEGOTIABLES § Tożsamość | Multi-provider; V2 User UUID; Discord + Google w P2; e-mail ≠ identity key          |
| ADR-0001 bullet OAuth       | Odniesienie do ADR-0010 + ADR-0011 + ADR-0012                                       |
| D-017 (zakres P2)           | P2 = revoke API only; pełna polityka guild → P3 (DEC-006 C)                         |

## Konsekwencje

- Użytkownik może istnieć z samym Google (polityka produktowa guild-scoped w P3).
- Moduły nie mogą zakładać „brak Discord ID = brak Usera”.
- Bot Discord (P1) nadal używa Application/Bot tokenu — osobny sekret od OAuth user login.
