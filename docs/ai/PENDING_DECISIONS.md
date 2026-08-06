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

## P4 Centrum Aktywności — status decyzji

> Spec SoT: `docs/ai/P4_CENTRUM_AKTYWNOSCI_HANDOFF.md` na gałęzi
> `cursor/p4-centrum-aktywnosci-spec-v2` (świeży `main` po merge PR #16).
> Implementacja zabroniona do briefu `READY_FOR_CURSOR` po audycie spec.
> Decyzje produktowe A–S: `docs/product/CENTRUM_AKTYWNOSCI.md`.
> Stary PR #17: **closed (superseded)** — nie jest źródłem prawdy.

### P4-D1 — zakres pierwszej wersji Centrum

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

- **Status:** `OWNER_DECISION_REQUIRED` (ADR-0014 nadal Proposed)
- **Kontekst:** Osobna usługa + baza wymagane (ADR-0001). Opcja „w gateway/authz/
  identity” odrzucona.
- **Pakiet decyzyjny (max 3 warianty):** szczegóły w
  `docs/architecture/CENTRUM_AKTYWNOSCI.md` §14.
  1. `community-service` / DB `community` — **rekomendacja TECH**
  2. `activity-service` / DB `activity`
  3. `centrum-service` / DB `centrum`
- **Rekomendacja techniczna:** wariant 1. **Nie** zamyka decyzji właściciela.

### P4-D4 — kanały w P4

- **Status:** OWNER_ACCEPTED (superseded „Discord only v1”)
- **Decyzja właściciela:** Discord (P4.2) + podstawowy Admin (P4.3) + pierwszy WWW
  browse/RSVP/Moje/powiadomienia (P4.4). Tworzenie na WWW odroczone względem Discorda.
- **Skutek:** Usunięta sprzeczność „Discord only” vs zatwierdzony WWW.

### P4-D5 — transport mutacji / projekcji

- **Status właściciela:** `TECHNICAL_OPEN`
- **Status rekomendacji TECH:** `TECHNICAL_RECOMMENDATION_READY_FOR_AUDIT`
  (`PROPOSED — READY_FOR_CHATGPT_AUDIT`)
- **Rekomendacja:** wariant 5 — sync HTTP + idempotency + PG transactional outbox
  dla projekcji Discord; RabbitMQ później (P4.5+ / multi-consumer). Analiza
  porównawcza: architecture §11. **Nie** oznacza Accepted.

### P4-D6 — publikacja panelu Centrum

- **Status produktu (layout):** OWNER_ACCEPTED (partial)
- **Status mechanizmu ops:** `TECHNICAL_OPEN` + rekomendacja
  `TECHNICAL_RECOMMENDATION_READY_FOR_AUDIT` (architecture §12)
- **Decyzja właściciela (layout):** Stały panel; update in-place; jeden prywatny
  formularz; sekcje Utwórz / Szukam ekipy / Moje / Powiadomienia; Components V2.
- **Rekomendacja TECH:** trwały rekord panelu, stany, lease, reconcile, anti-dupe,
  operator publish/refresh/repair/move/detach/inspect — bez publicznych copy.

### P4-D7 — katalog permission IDs

- **Status:** `OWNER_DECISION_REQUIRED` (finalne stringi)
- **Pakiet:** kompletna tabela propozycji w architecture §13 (read/create/edit/
  cancel/manage/RSVP/participants/panel/admin/multi/recurring/privacy/attendance/
  stats/moderate).
- **Nie** dodawać automatycznie do kodu Authz.

### P4-D8 — checkpoint wizualny (Issue #12) vs kontrakt layoutu

- **Status layoutu interaktywnego:** CONTRACT_SPECIFIED —
  component tree, custom_id, „Więcej”, in-place edit —
  `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md` (+ weryfikacja discord.js §N).
- **Status assetów (Issue #12):** `OWNER_DECISION_REQUIRED` (**bez zmian**)
  (kolory, emoji, bannery, typografia, copy poza zaakceptowanymi etykietami).
- **Wzór właściciela:** modułowość i panelowość — **nie** klikalne obszary obrazu.

### P4-T1 — formalne Accepted ADR-0014 + nazwa usługi

- **Status:** BLOCKED / TECHNICAL_OPEN
- **Kontekst:** Boundary Proposed; produkt Accepted osobno.

### P4-T2 — OpenAPI ścieżki i event names

- **Status:** TECHNICAL_OPEN
- **Kontekst:** Szkic w architecture; stabilizacja przy P4.1.

## Rozstrzygnięte (P3 Authorization — 2026-08-05 / merge 2026-08-06)

Issue #15 **P3-D1–P3-D20** = `OWNER_ACCEPTED`.
Implementacja: PR #16 **merged** do `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e`.
Issue #15 **closed**. Nie wymagają ponownego pytania.

## Historia — PR #17 (superseded)

- PR #17 (plan docs-only) został **zamknięty jako zastąpiony**.
- Nie kontynuować jego historii; SoT = `cursor/p4-centrum-aktywnosci-spec-v2`.

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
