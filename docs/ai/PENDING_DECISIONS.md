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

<<<<<<< HEAD
## Rozstrzygnięte (P3 Authorization — 2026-08-05)

Issue #15 **P3-D1–P3-D20** = `OWNER_ACCEPTED` (komentarze Issue + ADR-0013 / D-034).
Nie wymagają ponownego pytania. Implementacja fundamentu: draft PR #16
(`cursor/p3-authorization-foundation`) — final closure pass; merge tylko przez właściciela.
=======
## P4 Centrum Aktywności — status decyzji (SPEC-PREP 2026-08-06)

> Spec lokalna: `docs/ai/P4_CENTRUM_AKTYWNOSCI_HANDOFF.md`.
> Implementacja zabroniona do merge P3 (PR #16) + brief `READY_FOR_CURSOR`.
> Decyzje produktowe A–S: `docs/product/CENTRUM_AKTYWNOSCI.md`.
>>>>>>> 15cfebe (docs(community): complete P4 Centrum Aktywności implementable spec)

## Zamrożone (do merge P3)

<<<<<<< HEAD
### P4 / PR #17 — Centrum Aktywności

- **Status:** FROZEN
- **PR:** https://github.com/HOMZIKx/V2/pull/17 (docs-only planning)
- **Warunek wznowienia:** merge PR #16 + jawne `APPROVED` na start P4.
- Agent nie implementuje P4 ani nie rozszerza PR #17 w trakcie domknięcia P3.
=======
- **Status:** OWNER_ACCEPTED (superseded prior A/B/C options)
- **Decyzja właściciela:** Pełny model produktowy Centrum z etapami wdrożenia
  P4.1–P4.6 (domain → Discord one-shot → Admin → WWW → multi/resilience →
  extensions). Nie „hub only” i nie jeden twardo wybrany „typ” jako jedyny produkt.
- **Skutek:** Stare opcje A/B/C planu nie obowiązują jako wybór v1.

### P4-D2 — pierwszy typ aktywności

- **Status:** OWNER_ACCEPTED (superseded)
- **Decyzja właściciela:** Rodzaje aktywności konfiguruje administrator; aktywność
  należy do gry na serwerze; „Inna aktywność” per-serwer. Nie pojedynczy hardcodowany typ.
- **Skutek:** Katalog typów w Admin (P4.3); model w P4.1.

### P4-D3 — właściciel domeny / nazwa usługi

- **Status:** TECHNICAL_OPEN / ADR-0014 Proposed
- **Kontekst:** Osobna usługa + baza wymagane architektonicznie (ADR-0001).
- **Rekomendacja techniczna:** `community-service` + DB `community`.
- **Decyzja właściciela:** formalna nazwa = `OWNER_DECISION_REQUIRED` (nie blokuje
  spisu agregatów w docs). Opcja „trzymać w gateway/authz/identity” pozostaje odrzucona.

### P4-D4 — kanały w P4

- **Status:** OWNER_ACCEPTED (superseded „Discord only v1”)
- **Decyzja właściciela:** Discord (P4.2) + podstawowy Admin (P4.3) + pierwszy WWW
  browse/RSVP/Moje/powiadomienia (P4.4). Tworzenie na WWW odroczone względem Discorda.
- **Skutek:** Usunięta sprzeczność „Discord only” vs zatwierdzony WWW.

### P4-D5 — transport mutacji / projekcji

- **Status:** TECHNICAL_OPEN
- **Rekomendacja techniczna:** Sync HTTP + idempotency w P4.1–P4.2; porty pod Outbox/RMQ.
- **Decyzja właściciela:** brak — nie przedstawiać rekomendacji jako Accepted.

### P4-D6 — publikacja panelu Centrum

- **Status:** OWNER_ACCEPTED (partial) + TECHNICAL_OPEN (mechanizm publish)
- **Decyzja właściciela:** Stały panel; update in-place; jeden prywatny formularz
  (nie kreator); sekcje Utwórz / Szukam ekipy / Moje / Powiadomienia.
- **Uzupełnienie kontraktu (2026-08-06):** layout = Components V2 Container +
  Section z **accessory Button** przy każdej sekcji (nie Action Row oderwany
  pod spodem; nie PNG hotspot). Szczegóły:
  `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`.
- **TECHNICAL_OPEN:** slash operatora vs auto-publish przy starcie.

### P4-D7 — katalog permission IDs

- **Status:** TECHNICAL_OPEN + OWNER_DECISION_REQUIRED (finalne stringi)
- **Wymaganie produktowe:** mapowanie akcji→P3 permissions (architecture + traceability).
- **Propozycja TECH:** `permission.activity.event.*` / `….admin.configure` /
  `….panel.publish` (patrz architecture doc). Finalne ID = właściciel/ChatGPT.

### P4-D8 — checkpoint wizualny (Issue #12) vs kontrakt layoutu

- **Status layoutu interaktywnego:** CONTRACT_SPECIFIED (lokalnie) —
  component tree, custom_id, „Więcej”, in-place edit, testy payload —
  `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`. **Nie** wymaga Issue #12 do
  zamknięcia kontraktu interakcji.
- **Status assetów (Issue #12):** OWNER_DECISION_REQUIRED
  - kolory / accent Container;
  - emoji / ikony;
  - bannery Media Gallery;
  - typografia / ornamenty;
  - copy Text Display poza zaakceptowanymi etykietami funkcji.
- **Wzór właściciela:** modułowość i panelowość sekcji z akcją — **nie**
  wymóg klikalnych obszarów obrazu (Discord tego nie obsługuje).
- **Zakaz:** placeholdery lab jako produkt; golden-image całej wiadomości jako
  test interaktywności.

### P4-T1 — formalne Accepted ADR-0014 + nazwa usługi

- **Status:** BLOCKED / TECHNICAL_OPEN
- **Kontekst:** Boundary Proposed; produkt Accepted osobno.

### P4-T2 — OpenAPI ścieżki i event names

- **Status:** TECHNICAL_OPEN
- **Kontekst:** Szkic w architecture; stabilizacja przy P4.1.
>>>>>>> 15cfebe (docs(community): complete P4 Centrum Aktywności implementable spec)

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
