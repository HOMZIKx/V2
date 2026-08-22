# Pending Decisions — V2

## Aktywne

### GOVERNANCE-001 — Owner Discovery gate (all new product functions)

- **Status:** `OWNER_PROCESS_ACCEPTED` (Issue #26 amendment + remediation task)
- **Rule:** IDEA → Owner+ChatGPT Discovery → Options → Owner Decisions → Accepted SoT →
  implementation prompt. Continuous execution does **not** override.
- **SoT:** `docs/ai/OWNER_DISCOVERY_GAPS.md`
- **Cursor action:** no Stage 6/7 product expansion; classify prototype code as
  `FOUNDATION_WIP`; do not treat API stubs as released product.

### CI-BILLING-001 — GitHub Actions jobs not started (billing / spending limit)

- **Status:** `OWNER_ACTION_REQUIRED` (CRITICAL for required CI green)
- **Evidence:** tip `e11c830` CI/PR Title annotations:
  “The job was not started because recent account payments have failed or your
  spending limit needs to be increased.”
- **Jobs:** Quality gates, Infrastructure integration, Secret scan, Conventional
  PR title — all failed with **0 steps** / empty runner (not a code failure).
- **Cursor action:** cannot obtain GitHub CI=GREEN until Owner fixes Billing &
  plans / spending limit; keep local `pnpm validate` green; re-run Actions after
  billing restored.
- **Do not** weaken CI workflows to fake green.

### MARKETPLACE-DISC-001 — Issue #28 Owner Discovery before Stage 7

- **Status:** `OWNER_DISCOVERY_REQUIRED` · `FOUNDATION_WIP_EXISTS` ·
  `NOT_ACCEPTED_FOR_PRODUCT_IMPLEMENTATION`
- **SoT:** Issue #28 — **DO NOT IMPLEMENT YET** (authoritative).
- **Prototype on branch:** migration 015, `offerMatchesWatch`, POST offer API — **do not
  expand**; do not delete.
- **Cursor action:** no further Marketplace product implementation until #28 Definition of
  Ready is Owner-Accepted. See `MARKETPLACE_SCOPE_LOCK.md` + `OWNER_DISCOVERY_GAPS.md`.

### RESERVATIONS-DISC-001 — Reservations Owner Discovery before Stage 6 product

- **Status:** `RESERVATIONS_OWNER_DISCOVERY_REQUIRED`
- **SoT:** No complete Owner Discovery pack recorded (unlike Hub #22 / Marketplace #28).
- **Prototype on branch:** migration 014, conflict domain, create/cancel API — **do not
  expand** product UX/semantics.
- **Cursor action:** run Owner Discovery before treating Reservations as Accepted.

### LFG-DISC-001 — LFG remaining UX and DoD (Issue #20)

- **Status:** `FOUNDATION_WIP` — direction partially Accepted (#20), details open
- **Accepted direction includes:** matching not board, DM-first, characters, class/spec,
  party roles, discovery-first, no public role-ping spam as primary UX.
- **Open:** Discord wizard, team-space, Admin/WWW, anti-spam, scoring display.
- **SoT:** `LFG_SCOPE_LOCK.md` governance matrix + `OWNER_DISCOVERY_GAPS.md`.

### NOTIFICATIONS-DISC-001 — Notification product catalog and timings

- **Status:** principles **Accepted** (#24 / ADR-0016); catalog/timings **open**
- **Open:** coalescing window duration, digest, quiet hours, retention, per-kind copy,
  preference UX on Discord/WWW.
- **SoT:** `NOTIFICATIONS_CORE_SCOPE_LOCK.md` + gap matrix.

### PROFILE-DISC-001 — Interest→role Discord mutation

- **Status:** `ROLE_PROJECTION_POLICY` implemented; `ROLE_PROJECTION_DISCORD_MUTATION`
  **pending**
- **Evidence:** `interest-role-projection.ts` computes desired state; no gateway apply loop.
- **Cursor action:** do not wire silent Discord role apply until Owner decides timing/UX.

### HUB-CORE-001 — Stage 3 V2 Hub Core discovery before implement

- **Status:** `OWNER_ACCEPTED` (2026-08-21) — task `V2-HUB-CORE-OWNER-SCOPE-LOCK-002`
- **SoT:** `docs/ai/HUB_CORE_SCOPE_LOCK.md` (+ architecture note
  `docs/architecture/V2_HUB_CORE.md`).
- **Accepted summary:** V2 = central operating layer; Discord = chat/voice/social;
  one Admin-configured `#v2-centrum` Hub message (edit-in-place, auto-reconcile);
  IA map GRA/RYNEK/GILDIA/TY; Hub Core = shell/registry/nav + profile/for_me/mine
  foundations + notifications entry; no auto channel delete (retirement model
  `LEGACY_ACTIVE`/`V2_READY`/`OWNER_CAN_RETIRE`); public Hub vs ephemeral/personal;
  WWW equal surface; Admin Control Center; class/spec ≠ party role; Interests #27
  SoT with role projection safety; interest ≠ role ≠ notification preference;
  durable V2 deep links; Overlay not in Stage 3.
- **Cursor action:** implement Hub Core per scope lock; do **not** reopen broad
  Hub discovery; do **not** invent Reservations/Marketplace/full LFG/Notifications.
- **Checkpoint:** `V2_HUB_CORE_CHECKPOINT_SHA` on validated tip.

### P4-OAUTH-SPLIT-ORIGIN — bounce WWW po Discord

- **Status:** `CODE_FIX` (ta gałąź) — nie blokuje właściciela, nie zastępuje
  ADR-0011.
- **Objaw:** ekran zgody Discord miga (`...`), brak kliknięcia, powrót do
  „Zaloguj przez Discord”. Live: `GET /aktywnosci` → 307 `/logowanie`.
- **Przyczyna:** cookie sesji jest host-only na API; WWW middleware brało brak
  cookie na `v2-web.zeabur.app` za wylogowanie. Drugi warunek: `SameSite=Lax`
  nie jedzie w credentialed fetch WWW→API (inne hosty na PSL `zeabur.app`).
- **Fix:** middleware odpuszcza gate gdy hostname WWW ≠ hostname API;
  Identity `SameSite=None; Secure` gdy trusted origin ma inny host.
  Lax zostaje lokalnie (ten sam hostname). Host-only bez `Domain=` — bez zmiany
  ADR-0011.

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
