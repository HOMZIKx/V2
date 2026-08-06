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

## P4 Centrum Aktywności — decyzje właściciela (2026-08-06)

> Pakiet planistyczny: `docs/ai/P4_CENTRUM_AKTYWNOSCI_HANDOFF.md`.
> Implementacja zabroniona do `OWNER_ACCEPTED` poniżej + merge P3 + brief.

### P4-D1 — zakres pierwszej wersji Centrum

- **Status:** BLOCKED
- **Kontekst:** Pierwszy pion produktowy po Authorization. P3-D3 wymienia wiele capability; jednoczesna budowa wszystkich eksploduje zakres.
- **Wpływ:** wielkość PR implementacyjnego, model danych, permissions, UX.
- **Opcja A:** Tylko hub (stały panel + nawigacja / puste stany) bez realnego typu aktywności — smoke produktowy UX.
- **Opcja B (rekomendacja techniczna):** Hub + **dokładnie jeden** typ aktywności end-to-end (create/join/leave/list/cancel-own).
- **Opcja C:** Hub + kilka typów z listy P3-D3 naraz (wydarzenia + wezwania + rezerwacje + głosowanie…).
- **Rekomendacja techniczna:** **B** — dowód pionu bez paraleli wielu domen.
- **Decyzja właściciela:**

### P4-D2 — pierwszy typ aktywności (jeśli D1 ≠ A)

- **Status:** BLOCKED
- **Kontekst:** Wybór jednej capability z katalogu produktowego.
- **Wpływ:** schemat DB, copy, permissions, testy live.
- **Opcja A:** Wydarzenie (event) — create/join/leave/cancel-own.
- **Opcja B:** Wezwanie wsparcia / call-and-response.
- **Opcja C:** Rezerwacja slotu (claim/release).
- **Opcja D:** Inny typ wskazany przez właściciela (opis wymagany).
- **Rekomendacja techniczna:** **A** lub **B** — najbliżej P3-D3 i Desktop Companion vision; unikać D bez specyfikacji.
- **Decyzja właściciela:**

### P4-D3 — właściciel domeny / nazwa usługi

- **Status:** BLOCKED
- **Kontekst:** ADR-0014 Proposed wymaga osobnej usługi i bazy. Robocza nazwa `community-service`.
- **Wpływ:** katalog usług, Compose DB, Dockerfiles, Nx project.
- **Opcja A (rekomendacja techniczna):** Nowa usługa `community-service` + baza `community`.
- **Opcja B:** Nowa usługa pod inną nazwą wskazaną przez właściciela (np. `activity-service`) + odpowiadająca baza.
- **Opcja C:** Odroczyć wydzielenie usługi i trzymać domenę w istniejącym serwisie — **koliduje z ADR-0001** (gateway/authz/identity nie są właścicielami aktywności).
- **Rekomendacja techniczna:** **A** (lub B z samą nazwą); **C odrzucić**.
- **Decyzja właściciela:**

### P4-D4 — kanały w P4 v1

- **Status:** BLOCKED
- **Kontekst:** Charter wymaga eventualnej równoległości Discord/WWW; P3-D3 pozwala Discord-first.
- **Wpływ:** scope frontendu, Identity na ścieżce, testy.
- **Opcja A (rekomendacja techniczna):** Discord only w P4 v1; WWW/Admin/Desktop później na tych samych kontraktach.
- **Opcja B:** Discord + read-only WWW lista aktywności.
- **Opcja C:** Discord + WWW + Admin konfiguracja panelu.
- **Rekomendacja techniczna:** **A**.
- **Decyzja właściciela:**

### P4-D5 — transport mutacji / projekcji

- **Status:** BLOCKED
- **Kontekst:** P3 v1 używa sync HTTP bez Outbox/RMQ. Charter wymaga Outbox dla krytycznych procesów długoterminowo.
- **Wpływ:** złożoność, niezawodność projekcji Discord, praca infrastrukturalna.
- **Opcja A (rekomendacja techniczna na v1):** Sync HTTP Gateway↔Community + idempotency; porty pod Outbox/RMQ bez implementacji brokera w pierwszym PR.
- **Opcja B:** Transactional Outbox + RabbitMQ quorum od pierwszego PR P4.
- **Opcja C:** Hybrid: mutacje sync, projekcje async od razu.
- **Rekomendacja techniczna:** **A**, potem B gdy drugi konsument (WWW/Desktop) lub niezawodność projekcji tego wymaga.
- **Decyzja właściciela:**

### P4-D6 — publikacja panelu Centrum

- **Status:** BLOCKED
- **Kontekst:** Standard UX wymaga stałego posta; P1 ma lab `/panel-test`.
- **Wpływ:** komendy Discord, persistence messageId, uprawnienia operatora.
- **Opcja A (rekomendacja techniczna):** Slash operatora publikuje/odświeża jeden stały panel; re-publish edytuje ten sam messageId.
- **Opcja B:** Auto-publish przy starcie bota na skonfigurowany channel ID.
- **Opcja C:** Tylko ephemeral / bez stałego posta publicznego.
- **Rekomendacja techniczna:** **A** (zgodne z D-023); B jako uzupełnienie konfiguracyjne później; C sprzeczne ze standardem hubu.
- **Decyzja właściciela:**

### P4-D7 — minimalny katalog permission IDs v1

- **Status:** BLOCKED
- **Kontekst:** P3 ma tylko techniczne IDs (`permission.platform.login.www`, policy.\*). Produktowe nazwy były poza P3. Cursor nie wymyśla finalnego katalogu.
- **Wpływ:** Authz grants, mapowanie ról, testy authorize.
- **Opcja A (rekomendacja techniczna):** Minimalny zestaw techniczny pod wybrany typ, np.:
  - `permission.activity.<type>.create`
  - `permission.activity.<type>.join`
  - `permission.activity.<type>.manage.self`
  - `permission.activity.panel.publish` (operator)
  - plus ewentualnie `permission.activity.<type>.manage.guild` dla kadry
- **Opcja B:** Szerszy katalog z góry pod wiele typów (nawet niewdrożonych).
- **Opcja C:** Na v1 polegać wyłącznie na membership bez granularnych permission IDs — **koliduje z P3-D4** długoterminowo.
- **Rekomendacja techniczna:** **A** po wyborze D2; B tylko jeśli właściciel chce stabilnych ID z wyprzedzeniem; C odrzucić.
- **Decyzja właściciela:**

### P4-D8 — checkpoint wizualny Centrum (Issue #12)

- **Status:** BLOCKED
- **Kontekst:** Widoczny panel Discord. Issue #12: Cursor nie dobiera palety/emoji/bannerów/copy.
- **Wpływ:** blokuje PR implementacyjny UI; docs mogą istnieć bez assetów.
- **Opcja A:** Właściciel + ChatGPT zatwierdzają przed briefem implementacyjnym: accent modułu, emoji selecta, banner (tak/nie + asset), tytuł/opis/footer PL, stany empty/error.
- **Opcja B:** Najpierw niewidoczny slice API community bez panelu Discord; UI w osobnym PR po checkpointie.
- **Opcja C:** Pozwolić Cursorowi użyć placeholderów lab z P1 — **zabronione** konstytucją / Issue #12 dla produktu.
- **Rekomendacja techniczna:** **A** jeśli D1 zawiera panel; **B** jeśli chcecie rozdzielić backend od UX; **C odrzucić**.
- **Decyzja właściciela:**

## Rozstrzygnięte (P2 Identity — 2026-08-05)

### DEC-003 — Multi-provider Identity vs Discord-only

- **Status:** ACCEPTED — **B: multi-provider Identity architecture** with **P2 active OAuth = Discord only** (owner amendment)
- **Decyzja właściciela (2026-08-05):** V2 User ze stabilnym UUID; Discord i Google jako ExternalIdentity; supersede D-016 / NON_NEGOTIABLES Discord-only.
- **Amendment właściciela (PR #11):** aktywny zakres P2 Identity OAuth = **wyłącznie Discord**. Google nie jest wymagany w konfiguracji, proof UI ani live checklist. Zachowane: V2 User UUID, porty ExternalIdentity, polityka explicit linking, sesje Redis, PostgreSQL, Discord `email=null`. Drugi provider można dodać później bez przeprojektowania.
- **Live gate (owner, 2026-08-05):** Discord OAuth PASSED (sign-in → me → accounts → logout → me 401).
- **Skutek:** ADR-0010 Accepted (architektura multi-provider-ready); aktywny socialProviders w proof = Discord.

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
