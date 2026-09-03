# Pending Decisions — V2

## Aktywne

### DEC-064 — Mapy w nawigacji (owner: wygląd finalny teraz)

- **Status:** OWNER_DIRECTED → UX doprecyzowany (2026-09-03)
- **Kontekst:** D-049 trzymał mapy poza first-slice jako „później”. Właściciel
  wymaga wyglądu finalnego — `/maps` renderuje `MapHunting`.
- **Doprecyzowanie UX:** główna etykieta nawigacji = **Timery** (lista respawnów
  jak w starej app); atlas top-down to drugi widok. Panoramy lokalizacji nie są
  mapą nawigacyjną — trzymane w `public/game/map-banners/`.
- **Uwaga:** dokładne PNG z lokalnego dobry-temat nadal mogą nadpisać pliki w
  `public/game/maps/` 1:1 (szczególnie lochy małp).

### DEC-063 — Grafiki map polowania z lokalnego dobry-temat

- **Status:** PARTIALLY_SATISFIED
- **Kontekst:** Katalog respawn/metiny/bossy jest w
  `dobry-temat-respawn-catalog.json` (dane OK). UI map używa atlasów top-down
  512×512 (Interactive Map / Interaktive Karte / wiki) dla terenów otwartych.
  Loch Pająków V2 z pl-wiki; lochy małp = schematyczny atlas kolorystyczny.
- **Opcjonalnie:** nadpisz PNG 1:1 ze swojego lokalnego `frontend/public`.

### DEC-065 — Spójność wizualna poz class×gender

- **Status:** OPEN
- **Kontekst:** Komplet 8/8 plików jest, ale źródła mieszają dynamiczne portrety
  klas z innymi seriami (np. Desert costume). Właściciel wymaga podobnych poz /
  stylu charakterystycznego dla klasy.
- **Blokada:** bez lokalnego dumpa dobry-temat albo wskazania jednej oficjalnej
  serii wiki nie da się ujednolicić bez zgadywania.

### DEC-062 — Brakujące rendery klas×płeć Metin2 (asset z dobry-temat)

- **Status:** RESOLVED (2026-09-03)
- **Rozwiązanie:** komplet 8 plików `apps/web/public/game/classes/{class}-{gender}.png`
  (272×360, bottom-aligned) z oficjalnej en-wiki Gameforge: portrety klas +
  gendered costume renders dla brakujących płci. Zarejestrowane w
  `character-profile.ts`. `listMissingCharacterRenders()` = [].
  Spójność poz → DEC-065.

### DEC-061 — Przeniesienie prac DESTILED Web do Cursora

- **Status:** OWNER_ACCEPTED (2026-09-03)
- **Decyzja:** Ze względu na koszt ChatGPT dalszy rozwój aplikacji DESTILED Web
  prowadzi Cursor. Ref: `preview/destiled-web`. Hold UI zdjęty. D-038–D-060 bez
  zmian zakresu produktu. ChatGPT opcjonalny.
- **SoT:** D-061 w `docs/DECISION_LOG.md`,
  `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md`.
- **Otwarte (nie blokuje handoffu):** właściciel wskazuje następne konkretne
  zadanie kodowe (fix / dopięcie first-slice / inny priorytet).

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

> SoT: PR #18 `cursor/p4-centrum-aktywnosci-spec-v2`. ADR-0014 **Accepted**.
> Implementacja zabroniona do `READY_FOR_CURSOR`.

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
- **Status screenshot-based visual interaction contract:**
  `REFERENCE_IMAGE_REQUIRED` — załącznik niedostępny w środowisku agenta w tej
  sesji; nie projektowano z pamięci; plik
  `CENTRUM_AKTYWNOSCI_VISUAL_INTERACTION_CONTRACT.md` **nie** utworzony.
- **Status assetów (Issue #12):** `OWNER_DECISION_REQUIRED` dla produkcyjnego
  visual sign-off. **Nie blokuje** P4.1 ani testowego P4.2a (native V2 bez bannera).

### P4-T1 — ADR-0014

- **Status:** **Accepted**

### P4-T2 — OpenAPI ścieżki i event names

- **Status:** TECHNICAL_OPEN (szkic Accepted w architecture; stabilizacja P4.1)
- Prefiks: `/activity/v1`, eventy `activity.*.v1`

## Rozstrzygnięte (P3 Authorization — 2026-08-05 / merge 2026-08-06)

Issue #15 **P3-D1–P3-D20** = `OWNER_ACCEPTED`.
Implementacja: PR #16 **merged** do `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e`.
Issue #15 **closed**.

## Historia — PR #17 (superseded)

- PR #17 **zamknięty jako zastąpiony**. SoT = PR #18.
