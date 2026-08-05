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

## Rozstrzygnięte (P3 Authorization — 2026-08-05)

Issue #15 **P3-D1–P3-D20** = `OWNER_ACCEPTED` (komentarze Issue + ADR-0013 / D-034).
Nie wymagają ponownego pytania. Implementacja fundamentu: branch `cursor/p3-authorization-foundation`.

## Rozstrzygnięte (P2 Identity — 2026-08-05)

### DEC-003 — Multi-provider Identity vs Discord-only

- **Status:** ACCEPTED — **B: multi-provider Identity architecture** with **P2 active OAuth = Discord only** (owner amendment)

### DEC-004 — Framework auth

- **Status:** ACCEPTED — **A: Better Auth** (z izolacją)

### DEC-005 — Account linking po emailu

- **Status:** ACCEPTED — **A: wyłącznie jawne linking**

### DEC-006 — D-017 przy multi-provider

- **Status:** ACCEPTED — **C w P2**

### DEC-007 — Sekwencja P1 vs P2

- **Status:** ACCEPTED — **A (warunek spełniony)**

### DEC-008 — Sesja przeglądarkowa

- **Status:** ACCEPTED — **A: opaque server session**

### DEC-009 — Kontekst wewnętrzny

- **Status:** ACCEPTED — **A: krótko żyjący internal JWT**

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
