# Pending Decisions — V2

## Aktywne

### DEC-001 — Deploy V2 na Zeabur (zakres i moment)

- **Status:** `OWNER_RESUME_REQUESTED` (2026-08-16) — właściciel jawnie prosi o
  deploy na Zeabur („niech działa na serwerze”). Wcześniej: DEFERRED (2026-08-05).
- **Blokery wykonawcze (agent nie omija):**
  1. brak sesji Zeabur CLI / API w środowisku agenta (wymagany `zeabur auth login`
     przez właściciela albo token w bezpiecznym kanale),
  2. sekrety Discord / JWT / DB wyłącznie w Variables Zeabur (właściciel wkleja),
  3. docs deploy P0/P1 nie obejmowały `activity-service` — Dockerfile dodany;
     pełna lista zmiennych P4 wymaga uzupełnienia przy pierwszym deployu Centrum.
- **ADR-0008:** nadal obowiązuje (osobny project, nie `dobry-temat`).
- **Zakres minimalny pod Centrum na Discord:** add-ony Postgres(activity) +
  Redis (+ Authz/Identity wg `ACTIVITY_ENABLED`) + serwisy `activity-service` +
  `discord-gateway` (+ gateway/web/admin wg potrzeb).
- **Następny krok właściciela:** zalogować Zeabur CLI **albo** utworzyć project
  w UI wg `docs/deploy/ZEABUR.md` i wkleić Variables z
  `docs/deploy/ZEABUR_OWNER_VARIABLES.md` (bez pastowania sekretów do czatu).

### DEC-002 — Uprawnienie Administrator dla bota testowego P1

- **Status:** ACCEPTED (owner override, test guild only)
- **Kontekst:** Właściciel instaluje bota z `permissions=8` (Administrator) na guild `1534228693017432124` i odmawia rotacji tokenu po wklejeniu do czatu. ADR-0007 / P1 wymagają minimalnych uprawnień bez Administrator.
- **Decyzja właściciela:** na etapie lokalnego live testu dopuszczony Administrator na serwerze testowym; kod harnessu sprawdza ViewChannel/SendMessages/EmbedLinks/AttachFiles/ReadMessageHistory oraz operator/ManageGuild.
- **Po teście:** odebrać Administrator i wrócić do `permissions=117760` (patrz `TEST_BOT_SETUP.md`). Override nie jest konfiguracją docelową.
- **Live test:** potwierdzony przez właściciela 2026-08-05 („Wszystko działa”); Components V2 live; PR #9 merged do `main`.
- **Ryzyko:** token był eksponowany w czacie — zalecany Reset Token; właściciel świadomie pomija.
- **Wznowienie zasady minimalnych uprawnień:** przed Zeabur / produkcją.

## P4 Centrum Aktywności — status decyzji

> SoT: PR #18 `cursor/p4-centrum-aktywnosci-spec-v2`. ADR-0014 **Accepted**.
> P4.1 implementation: branch `cursor/p4-1-activity-domain` —
> `READY_FOR_REVIEW_P4_1_ACTIVITY_DOMAIN` (no merge yet).

### P4-D1 — zakres pierwszej wersji Centrum

- **Status:** OWNER_ACCEPTED

### P4-D2 — pierwszy typ aktywności

- **Status:** OWNER_ACCEPTED

### P4-D3 — właściciel domeny / nazwa usługi

- **Status:** **OWNER_ACCEPTED**
- **Decyzja:** `services/activity-service`, `@v2/activity-service`, DB `activity`,
  domena/kontrakty `activity`. Odrzucone: `community-service` jako szeroki worek.

### P4-D4 — kanały w P4

- **Status:** OWNER_ACCEPTED

### P4-D5 — transport mutacji / projekcji

- **Status:** **OWNER_ACCEPTED**
- **Decyzja:** P4.1–P4.2 = sync HTTP + assertion/user context + idempotency +
  PG transactional outbox + claim/lease + retry/backoff. RabbitMQ nie w P4.1;
  od P4.5 (lub wcześniej przy multi-consumer). Brak runtime no-op workera;
  worker off do realnego consumer P4.2.

### P4-D6 — publikacja panelu Centrum

- **Status:** **OWNER_ACCEPTED** (layout + mechanizm ops z nonce/adopt)
- **Decyzja:** publish occurrence + Discord `nonce`/`enforceNonce` + reconcile
  adopt po `panel_id` w custom_id; crash-window tests; lease+UNIQUE; nie obiecywać
  braku duplikatu samym SELECT FOR UPDATE. Szczegóły architecture §10.

### P4-D7 — katalog permission IDs

- **Status:** **OWNER_ACCEPTED**
- **Katalog finalny:** patrz architecture §6. Usunięte konkurencyjne nazwy
  (`edit.self`, `cancel.self`, `manage.others`, `moderate.guild`,
  `participants.manage`, `panel.publish`, `admin.configure`).

### P4-D8 — checkpoint wizualny (Issue #12) vs kontrakt layoutu

- **Status layoutu interaktywnego (Components V2):** CONTRACT_SPECIFIED w
  `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`
- **Module accent Centrum:** OWNER ACCEPTED `#D48632` (D-038 /
  `P4-DISCORD-VISUAL-CORRECTION-001`); Centrum decoupled from V2 LAB purple.
- **Status screenshot-based visual interaction contract:**
  `REFERENCE_IMAGE_REQUIRED` — załącznik niedostępny w środowisku agenta w tej
  sesji; nie projektowano z pamięci; plik
  `CENTRUM_AKTYWNOSCI_VISUAL_INTERACTION_CONTRACT.md` **nie** utworzony.
- **Status assetów (Issue #12):** banner/emoji/pełny global DS nadal
  `OWNER_DECISION_REQUIRED`. Accent modułu Centrum **nie** czeka na pełne #12.
- **Issue #20** (dungeon LFG discovery-first): osobny etap — **nie** w tym tasku.

### P4-T1 — ADR-0014

- **Status:** **Accepted**

### P4-T2 — OpenAPI ścieżki i event names

- **Status:** TECHNICAL_OPEN (szkic Accepted w architecture; stabilizacja P4.1)
- Prefiks: `/activity/v1`, eventy `activity.*.v1`

### P4-UX-001 — Discord create: jeden spójny formularz (Owner Amendment)

- **Status:** OWNER_ACCEPTED (`P4-CLOSURE-REMEDIATION-001` / D-037)
- **Decyzja:** Utwórz aktywność → jeden formularz użytkownika → Podgląd →
  Publikuj. Zakaz sekcyjnych przycisków edycji. Docs product/architecture/UX
  zaktualizowane (§12 / §O). P4.4 WWW bez kreatora; P4.5 poza zakresem.

## Rozstrzygnięte (P3 Authorization — 2026-08-05 / merge 2026-08-06)

Issue #15 **P3-D1–P3-D20** = `OWNER_ACCEPTED`.
Implementacja: PR #16 **merged** do `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e`.
Issue #15 **closed**.

## Historia — PR #17 (superseded)

- PR #17 **zamknięty jako zastąpiony**. SoT = PR #18.
