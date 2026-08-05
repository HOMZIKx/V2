# P2 Identity Foundation — Handoff (planning only)

- **Task ID:** `P2-IDENTITY-FOUNDATION-001`
- **Status:** `READY_FOR_RE-AUDIT` (planning package — **no implementation**)
- **Branch:** `planning/p2-identity-foundation`
- **PR:** [#10](https://github.com/HOMZIKx/V2/pull/10)
- **Date:** 2026-08-05

## 1. Cel

Zbudować **produkcyjny fundament Identity** dla całej platformy V2 — wspólne źródło
tożsamości dla WWW, Admin, Discord (OAuth użytkownika), przyszłego desktopu i API.

Identity **nie** jest projektowane wyłącznie pod Discorda. Discord jest jednym z
providerów. V2 User ma własny stabilny UUID.

Ten dokument jest **planem**. Implementacja kodu P2 jest zabroniona do czasu:

1. re-audytu / `APPROVED` tego planu (po zamknięciu DEC-003–009),
2. merge zatwierdzonego planu PR #10,
3. jawnego briefu implementacyjnego w `CHATGPT_TO_CURSOR.md` (`READY_FOR_CURSOR`),
4. osobnego PR implementacyjnego zaczynającego od proof slice Better Auth.

## 2. Stan wyjściowy (repo)

| Element                           | Stan                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| `services/identity-service`       | Szkielet Nest + health; **brak** OAuth, ORM, sesji, Better Auth |
| `services/authorization-service`  | Szkielet Nest + health; **brak** RBAC                           |
| Baza `identity` / `authorization` | Compose (ADR-0004); **bez** migracji biznesowych                |
| Redis                             | Compose; **niepodłączony** do identity-service                  |
| Pakiety auth (`better-auth`)      | **Brak** w lockfile (celowe — PR #10 docs-only)                 |
| P1 Discord harness                | **Merged** do `main` (PR #9 / `c82d6bd`); Components V2         |

## 3. Zakres P2 (zatwierdzony plan)

### 3.1 W zakresie

1. Centralny Identity Service — właściciel user/account/session/verification.
2. Discord OAuth2 + Google OAuth (user login platformy).
3. Pluginowi providerzy; V2 User UUID; jawne account linking / unlink.
4. Sesje opaque + Redis SoT; logout current / all; revoke admin|system.
5. Endpoint `me`; bezpieczne cookies; internal JWT między usługami.
6. Fundament MFA-ready **bez** MFA w P2.
7. Kontrakty/zdarzenia pod przyszłe Guild Membership — bez implementacji guild/RBAC.

### 3.2 Poza zakresem (twarde)

- RBAC, guild permissions / membership policy, sync ról Discord (P3);
- MFA passkey/TOTP (wymaganie przyszłe; nie blokuje minimalnego P2 jeśli Admin nieprod);
- Steam / inni providerzy poza Discord + Google;
- produkcyjny deploy Identity / Zeabur;
- funkcje biznesowe bota; Authorization Service poza konsumpcją `userId`.

## 4. Decyzje właściciela (2026-08-05) — ACCEPTED

| DEC     | Wybór | Skutek                                        |
| ------- | ----- | --------------------------------------------- |
| DEC-003 | **B** | Multi-provider; V2 UUID; supersede D-016      |
| DEC-004 | **A** | Better Auth + Fastify handler + ports         |
| DEC-005 | **A** | Tylko jawne linking; `disableImplicitLinking` |
| DEC-006 | **C** | P2 = revoke API; guild policy → P3            |
| DEC-007 | **A** | P1 merged; impl P2 po merge planu #10         |
| DEC-008 | **A** | Opaque cookie + Redis SoT; osobne Web/Admin   |
| DEC-009 | **A** | Internal JWT ≤5 min; asymetryczny; bez RBAC   |

Szczegóły: `PENDING_DECISIONS.md` (sekcja Rozstrzygnięte), `DECISION_LOG` D-031–D-033.

## 5. Granice usług

### 5.1 `identity-service` (właściciel)

**Owns:** User, Account/ExternalIdentity, Session, Verification, podstawowy profil,
credentiale OAuth **tylko jeśli** jawnie wymagane i zaszyfrowane, audit bezpieczeństwa,
konfiguracja providerów. Better Auth wyłącznie w Infrastructure za portami (ADR-0012).

**Exposes:** OAuth start/callback, link/unlink, session validate/revoke, `me`, health.

**Publishes (szkic):** `identity.user.created.v1`, `…linked.v1`, `…session.revoked.v1`, …

Inne usługi **nie** czytają bazy `identity` i nie importują Better Auth.

### 5.2 `authorization-service`

W P2: **zero** RBAC. Przyszła konsumpcja `userId` V2 + zdarzenia Identity.

### 5.3 Klienci

| Klient            | Rola w P2                                         |
| ----------------- | ------------------------------------------------- |
| `web` / `admin`   | Cookies sesji (osobne nazwy); BFF → Identity      |
| `api-gateway`     | Edge; nie SoT tożsamości                          |
| `discord-gateway` | P1 harness; P2 — przyszłe powiązanie user↔Discord |

## 6. Model danych

- **User.id** — UUID V2 (nie Discord snowflake; nie e-mail).
- **ExternalIdentity** — UNIQUE `(provider, providerAccountId)`; e-mail nullable snapshot.
- **Session** — opaque id w cookie; Redis SoT walidacji; PG metadane/audyt.
- **Verification** — state/PKCE / one-time.

Relacje guild — poza P2.

## 7. Przepływy (skrót)

- Login OAuth: state + PKCE → exchange → find/create User+Account → Session + Set-Cookie.
- Linking: tylko sesja; subject zajęty → reject; brak auto-merge po e-mailu.
- Unlink: zabroniony dla ostatniego providera.
- Revoke: one / all / admin|system → natychmiastowe wygaśnięcie (bez cookie cache).
- Internal: Identity wydaje JWT ≤5 min po walidacji sesji.

## 8. Security supplements (obowiązkowe)

1. **Provider tokens** — nie przechowuj access/refresh po loginie, jeśli zbędne; inaczej
   szyfrowanie aplikacyjne + wersjonowane klucze + rotacja; brak niejawnego raw storage BA.
2. **Sesje** — udokumentuj faktyczny model tokenu BA (bez fałszywego „hashed”); Redis ACL
   SoT; PG audyt; logout current/all/admin revoke.
3. **Cookies/CSRF** — HttpOnly, Secure poza localhost, SameSite=Lax, host-only, Path;
   state+PKCE; allowlista redirect — bez wildcardów prod.
4. **Dane** — UNIQUE provider+accountId; e-mail ≠ key; Discord bez e-maila OK; no unlink last.
5. **Granice** — tylko Identity owns tabele; gateway/web/admin/discord tylko kontrakty.

## 9. ADR-y

| ADR      | Status   |
| -------- | -------- |
| ADR-0009 | Accepted |
| ADR-0010 | Accepted |
| ADR-0011 | Accepted |
| ADR-0012 | Accepted |

## 10. Definition of Done (implementacja — przyszły PR)

- [ ] Proof slice: Node 24, Nest11+Fastify, PG, Redis, Discord, Google, linking, revoke
- [ ] Pin wersji Better Auth
- [ ] E2E lokalnie: login Discord/Google, link/unlink, logout one/all, `me`
- [ ] Cookies + Redis SoT + internal JWT
- [ ] Testy krytyczne; lint/typecheck/architecture
- [ ] Brak RBAC / guild policy / MFA / Zeabur w zakresie P2
- [ ] Raport + PR **bez** samodzielnego merge

## 11. Ten PR planistyczny — DoD

- [x] Sync z `main` (P1) bez cofania Components V2
- [x] DEC-003–009 ACCEPTED w docs
- [x] ADR 0009–0012 Accepted; NON_NEGOTIABLES; Decision Log
- [x] Handoff + IDENTITY_FOUNDATION + security supplements
- [x] Zero zależności Better Auth / kodu implementacyjnego
- [ ] Re-audit → `APPROVED` → merge planu (właściciel)
- [ ] Osobny PR implementacyjny

## 12. Zachowane ryzyka

- Redis SoT vs domyślny session adapter Better Auth — proof musi potwierdzić.
- Pin wersji BA odłożony do impl PR.
- Guild revoke policy (D-017 pełne) odroczona do P3.
- Honest hashing sesji — zależne od faktycznego zachowania BA.
- D-018 MFA admin — nie w minimalnym P2.
