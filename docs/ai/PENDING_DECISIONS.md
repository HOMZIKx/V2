# Pending Decisions — V2

## Aktywne

### DEC-001 — Deploy V2 na Zeabur (zakres i moment)

- **Status:** DEFERRED
- **Decyzja właściciela (2026-08-05):** wariant B był zatwierdzony, następnie **wstrzymany**. Najpierw 100% działający bot lokalnie na guild testowym; Zeabur i 6 serwisów odłożone.
- **ADR-0008 / Dockerfiles:** pozostają w repo jako przygotowanie, **bez kontynuacji wdrożenia** do czasu jawnego wznowienia.
- **Warunek wznowienia (częściowo spełniony):** lokalny live test P1 na guild `1534228693017432124` potwierdzony (2026-08-05). Wdrożenie Zeabur nadal wymaga jawnego wznowienia przez właściciela.

### DEC-002 — Uprawnienie Administrator dla bota testowego P1

- **Status:** ACCEPTED (owner override, test guild only)
- **Kontekst:** Właściciel instaluje bota z `permissions=8` (Administrator) na guild `1534228693017432124` i odmawia rotacji tokenu po wklejeniu do czatu. ADR-0007 / P1 wymagają minimalnych uprawnień bez Administrator.
- **Decyzja właściciela:** na etapie lokalnego live testu dopuszczony Administrator na serwerze testowym; kod harnessu nadal sprawdza tylko ViewChannel/SendMessages/EmbedLinks/ReadMessageHistory oraz operator/ManageGuild.
- **Live test:** potwierdzony przez właściciela 2026-08-05 („Wszystko działa”).
- **Ryzyko:** token był eksponowany w czacie — zalecany Reset Token; właściciel świadomie pomija.
- **Wznowienie zasady minimalnych uprawnień:** przed Zeabur / produkcją.

### DEC-003 — Multi-provider Identity vs Discord-only (konstytucja)

- **Status:** BLOCKED (wymaga właściciela + ChatGPT)
- **Kontekst:** D-016 / NON_NEGOTIABLES / ADR-0001 mówią: logowanie wyłącznie Discord; konto związane z Discord User ID. Brief P2 właściciela (2026-08-05): Discord + Google, V2 User niezależny od Discord ID, wielu providerów.
- **Wpływ:** architektura, model danych, UX, bezpieczeństwo, NON_NEGOTIABLES, przyszły desktop i API.
- **Opcja A — Utrzymać Discord-only (status quo):** zgodność z konstytucją; Google out of scope; P2 tylko Discord OAuth + User techniczny nadal „przyklejony” do Discord.
- **Opcja B — Multi-provider (kierunek briefu P2):** supersession D-016 + NON_NEGOTIABLES; ADR-0010 Accepted; Discord i Google w P2; V2 User ID jako PK.
- **Opcja C — Multi-provider z obowiązkowym Discord:** można dodać Google tylko jako link; pierwsze konto zawsze Discord.
- **Rekomendacja techniczna:** **B** — zgodna z briefem P2 i celem „Identity dla całej platformy”; C jako kompromis produktowy jeśli społeczność ma pozostać Discord-first.
- **Decyzja właściciela:** _(pusta)_

### DEC-004 — Framework / biblioteka auth dla Identity Service

- **Status:** BLOCKED
- **Kontekst:** D-019 Accepted = Better Auth, ale w repo **brak** zależności; brief P2 nakazuje nie traktować Better Auth / JWT / refresh jako automatycznie zatwierdzonych bez weryfikacji.
- **Wpływ:** vendor lock-in, bezpieczeństwo, tempo, dopasowanie do Nest/Fastify, sesje Redis, multi-provider, MFA późniejsze.
- **Opcja A — Better Auth (D-019):** szybki start, ekosystem pluginów; ryzyko dopasowania do Nest warstw i własności danych.
- **Opcja B — Auth.js (Auth.js / NextAuth):** silne w Next; Admin (Vite) i Nest Identity jako SoT wymagają starannego BFF.
- **Opcja C — Lucia / custom session + Arctic (OAuth):** większa kontrola, więcej kodu security-sensitive.
- **Opcja D — Własna implementacja OAuth+sesji na Nest bez frameworka auth:** maksymalna kontrola granic; najwyższy koszt i ryzyko błędów.
- **Rekomendacja techniczna:** Po DEC-003 przeprowadzić spike 1–2 dni (A vs C) względem: cookie sessions, Discord+Google, Nest isolation, testowalność. **Nie wybierać w planie „bo D-019” bez spika.** D odrzucić jako domyślną.
- **Decyzja właściciela:** _(pusta)_

### DEC-005 — Polityka automatycznego account linking po emailu

- **Status:** BLOCKED
- **Kontekst:** Ten sam adres email u Discord i Google nie dowodzi tej samej osoby (aliasy, przejęte skrzynki, niezweryfikowany email).
- **Wpływ:** bezpieczeństwo (account takeover), UX.
- **Opcja A — Tylko jawne linkowanie w sesji (rekomendowane na start):** zero auto-merge.
- **Opcja B — Auto-link gdy oba emaile verified i identyczne:** wygodniej; wyższe ryzyko.
- **Opcja C — Auto-link + obowiązkowy email challenge:** kompromis kosztowny.
- **Rekomendacja techniczna:** **A** w P2; B/C tylko po osobnej analizie.
- **Decyzja właściciela:** _(pusta)_

### DEC-006 — D-017 (utrata członkostwa Discord) przy multi-provider

- **Status:** BLOCKED
- **Kontekst:** D-017: utrata membership/roli Discord unieważnia sesje. Przy Google-only lub User bez Discord reguła jest nieokreślona.
- **Wpływ:** bezpieczeństwo, produkt „dostęp tylko dla członków gildii”.
- **Opcja A — D-017 dotyczy tylko zasobów/guild-scoped; login platformy niezależny od guild.**
- **Opcja B — Platform login nadal wymaga aktywnego Discord ExternalIdentity + membership (Google tylko jako 2FA/link).**
- **Opcja C — Per-organization policy (później); P2 tylko revoke API bez auto guild hooks.**
- **Rekomendacja techniczna:** **C w P2** (fund revoke); pełna polityka guild w P3+ Authorization. A lub B wymaga decyzji produktowej właściciela.
- **Decyzja właściciela:** _(pusta)_

### DEC-007 — Sekwencja: implementacja P2 vs APPROVED P1

- **Status:** BLOCKED
- **Kontekst:** Workflow: nie zaczynać kolejnego dużego etapu bez APPROVED poprzedniego. Właściciel zlecił **plan** P2 teraz; P1 ma PR #9 oczekujący audytu.
- **Wpływ:** ryzyko równoległych zmian na `main`, conflity.
- **Opcja A — Plan P2 teraz (ten PR); implementacja P2 dopiero po P1 APPROVED+merge oraz po APPROVED planu P2.**
- **Opcja B — Wolno implementować P2 równolegle do audytu P1.**
- **Rekomendacja techniczna:** **A**.
- **Decyzja właściciela:** _(pusta — brief planistyczny sugeruje A)_

### DEC-008 — Model sesji przeglądarkowej (opaque vs JWT)

- **Status:** BLOCKED (rekomendowane potwierdzenie D-020)
- **Kontekst:** Przykłady JWT/refresh w rozmowach vs D-020 / NON_NEGOTIABLES (cookie session + Redis).
- **Opcja A — Opaque server session + cookie (D-020) — rekomendacja.**
- **Opcja B — JWT access + refresh w cookies HttpOnly.**
- **Opcja C — JWT w localStorage (odrzucone przez konstytucję).**
- **Rekomendacja techniczna:** **A**; ADR-0011 Proposed.
- **Decyzja właściciela:** _(pusta)_

### DEC-009 — Format podpisanego kontekstu wewnętrznego między usługami

- **Status:** BLOCKED
- **Kontekst:** D-020 wymaga krótkiego podpisanego kontekstu; nie precyzuje formatu.
- **Opcja A — JWT (krótki TTL, `kid`, iss/aud) — powszechny tooling.**
- **Opcja B — PASETO / Branca.**
- **Opcja C — Opaque reference + synchroniczny introspect do Identity (więcej latency).**
- **Rekomendacja techniczna:** **A** z TTL ≤ 5 min i obligatoryjnym `aud` per usługa; unikać długich JWT jako sesji przeglądarki (to DEC-008).
- **Decyzja właściciela:** _(pusta)_

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
