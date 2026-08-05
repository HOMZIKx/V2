# Pending Decisions — V2

## Aktywne

### DEC-001 — Deploy V2 na Zeabur (zakres i moment)

- **Status:** DEFERRED
- **Decyzja właściciela (2026-08-05):** wariant B był zatwierdzony, następnie **wstrzymany**. Najpierw 100% działający bot lokalnie na guild testowym; Zeabur i 6 serwisów odłożone.
- **ADR-0008 / Dockerfiles:** pozostają w repo jako przygotowanie, **bez kontynuacji wdrożenia** do czasu jawnego wznowienia.
- **Warunek wznowienia (częściowo spełniony):** lokalny live test P1 na guild `1534228693017432124` potwierdzony; P1 scalony do `main` (PR #9). Wdrożenie Zeabur nadal wymaga jawnego wznowienia przez właściciela.

### DEC-002 — Uprawnienie Administrator dla bota testowego P1

- **Status:** ACCEPTED (owner override, test guild only)
- **Kontekst:** Właściciel instaluje bota z `permissions=8` (Administrator) na guild `1534228693017432124` i odmawia rotacji tokenu po wklejeniu do czatu. ADR-0007 / P1 wymagają minimalnych uprawnień bez Administrator.
- **Decyzja właściciela:** na etapie lokalnego live testu dopuszczony Administrator na serwerze testowym; kod harnessu sprawdza ViewChannel/SendMessages/EmbedLinks/AttachFiles/ReadMessageHistory oraz operator/ManageGuild.
- **Po teście:** odebrać Administrator i wrócić do `permissions=117760` (patrz `TEST_BOT_SETUP.md`). Override nie jest konfiguracją docelową.
- **Live test:** potwierdzony przez właściciela 2026-08-05 („Wszystko działa”); Components V2 live; PR #9 merged do `main`.
- **Ryzyko:** token był eksponowany w czacie — zalecany Reset Token; właściciel świadomie pomija.
- **Wznowienie zasady minimalnych uprawnień:** przed Zeabur / produkcją.

## Rozstrzygnięte (P2 Identity — 2026-08-05)

### DEC-003 — Multi-provider Identity vs Discord-only

- **Status:** ACCEPTED — **B: multi-provider Identity architecture** with **P2 active OAuth = Discord only** (owner amendment)
- **Decyzja właściciela (2026-08-05):** V2 User ze stabilnym UUID; Discord i Google jako ExternalIdentity; supersede D-016 / NON_NEGOTIABLES Discord-only.
- **Amendment właściciela (PR #11 / kontynuacja):** aktywny zakres P2 Identity OAuth = **wyłącznie Discord**. Google nie jest wymagany w konfiguracji, proof UI ani live checklist. Zachowane: V2 User UUID, porty ExternalIdentity, polityka explicit linking, sesje Redis, PostgreSQL, Discord `email=null`. Drugi provider można dodać później bez przeprojektowania.
- **Skutek:** ADR-0010 Accepted (architektura multi-provider-ready); aktywny socialProviders w proof = Discord; formalna aktualizacja NON_NEGOTIABLES/ADR pod „Google w P2” — po re-audycie jeśli właściciel potwierdzi.

### DEC-004 — Framework auth

- **Status:** ACCEPTED — **A: Better Auth** (z izolacją)
- **Decyzja właściciela (2026-08-05):** oficjalny handler Fastify w Identity; Better Auth tylko za portami/adapters; brak community Nest adaptera jako fundamentu; proof/integration slice przed pełną budową; pin wersji w PR implementacyjnym.
- **Skutek:** ADR-0012 Accepted; D-019 potwierdzone.

### DEC-005 — Account linking po emailu

- **Status:** ACCEPTED — **A: wyłącznie jawne linking**
- **Decyzja właściciela (2026-08-05):** zero auto-merge po emailu; `disableImplicitLinking: true`; kolizja email → kontrolowany komunikat.

### DEC-006 — D-017 przy multi-provider

- **Status:** ACCEPTED — **C w P2**
- **Decyzja właściciela (2026-08-05):** P2 = natychmiastowy revoke API; polityka guild/membership → P3 Authorization; utrata Discorda nie kasuje V2 User ani Google.

### DEC-007 — Sekwencja P1 vs P2

- **Status:** ACCEPTED — **A (warunek spełniony)**
- **Decyzja właściciela (2026-08-05):** P1 zatwierdzony i scalony (PR #9 / `c82d6bd`); plan P2 można zamknąć; implementacja P2 dopiero po merge planu PR #10, w osobnym PR.

### DEC-008 — Sesja przeglądarkowa

- **Status:** ACCEPTED — **A: opaque server session**
- **Decyzja właściciela (2026-08-05):** HttpOnly + Secure + host-only cookie; Redis SoT walidacji/revoke; wyłączony cookie cache/stateless Better Auth; osobne cookies Web vs Admin; zakaz JWT/localStorage jako sesji przeglądarki.

### DEC-009 — Kontekst wewnętrzny

- **Status:** ACCEPTED — **A: krótko żyjący internal JWT**
- **Decyzja właściciela (2026-08-05):** TTL ≤ 5 min; iss/aud/sub/jti/iat/exp/kid; asymetryczne podpisy; prywatny klucz tylko w Identity; bez pełnego RBAC w tokenie.

## Szablon

### DEC-XXX — Tytuł

- **Status:** BLOCKED
- **Kontekst:**
- **Wpływ:**
- **Opcja A:**
- **Opcja B:**
- **Opcja C:**
- **Rekomendacja techniczna:**
- **Decyzja właściciela:**

Agent nie może samodzielnie usuwać pozycji `BLOCKED` ani zastępować decyzji założeniem.
