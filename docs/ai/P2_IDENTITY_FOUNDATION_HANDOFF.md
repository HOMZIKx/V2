# P2 Identity Foundation — Handoff (planning only)

- **Task ID:** `P2-IDENTITY-FOUNDATION-001`
- **Status:** `READY_FOR_REVIEW` (planning package — **no implementation**)
- **Branch:** `planning/p2-identity-foundation`
- **Date:** 2026-08-05

## 1. Cel

Zbudować **produkcyjny fundament Identity** dla całej platformy V2 — wspólne źródło tożsamości dla:

- WWW (`web`),
- panelu administracyjnego (`admin`),
- Discorda (`discord-gateway` i przyszłe flow OAuth użytkownika),
- przyszłej aplikacji desktopowej,
- przyszłych API i modułów.

Identity **nie** jest projektowane wyłącznie pod Discorda. Discord jest jednym z providerów tożsamości.

Ten dokument jest **planem i handoffem do późniejszej implementacji**. Implementacja kodu P2 jest zabroniona do czasu:

1. audytu ChatGPT tego pakietu planistycznego,
2. statusu `APPROVED` dla planu,
3. rozstrzygnięcia decyzji w `PENDING_DECISIONS.md` (DEC-003+),
4. jawnego zadania implementacyjnego (nowe `CHATGPT_TO_CURSOR.md`).

## 2. Stan wyjściowy (repo dziś)

| Element                           | Stan                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `services/identity-service`       | Szkielet Nest + health; **brak** OAuth, ORM, sesji, Better Auth    |
| `services/authorization-service`  | Szkielet Nest + health; **brak** RBAC                              |
| Baza `identity` / `authorization` | Przygotowane w Compose (ADR-0004); **bez** migracji biznesowych    |
| Redis                             | W Compose; **niepodłączony** do identity-service                   |
| Pakiety auth (`better-auth` itd.) | **Brak** w lockfile                                                |
| P1 Discord harness                | Osobna gałąź / PR #9; na `main` jeszcze nie (stan na moment planu) |

Źródła prawdy dziś: `NON_NEGOTIABLES.md`, ADR-0001, D-016–D-020. **Kierunek P2 właściciela częściowo z nimi koliduje** — patrz sekcja 12 i `PENDING_DECISIONS.md`.

## 3. Zakres P2 (po zatwierdzeniu planu)

### 3.1 W zakresie

1. Centralny **Identity Service** jako właściciel danych tożsamości.
2. Uwierzytelnianie platformy (WWW + Admin; kontrakty pod Discord/desktop/API).
3. **Discord OAuth2** (login użytkownika platformy — nie mylić z bot install scopes P1).
4. **Google OAuth**.
5. Architektura **pluginowych providerów** (kolejne OIDC/OAuth bez przebudowy rdzenia).
6. Centralny **V2 Identity User** niezależny od ID providera.
7. **Account linking** wielu `ExternalIdentity` → jeden User.
8. Sesje użytkownika + bezpieczne zarządzanie.
9. Wylogowanie jednej sesji.
10. Wylogowanie wszystkich urządzeń / sesji.
11. Podstawowy profil użytkownika (minimalny).
12. Fundament pod przyszłe MFA (**bez** implementacji MFA w P2).
13. Relacja modelowa: `ExternalIdentity` → `User` → (przyszłe) Guild Membership / Profile / Permissions — **tylko przygotowanie kontraktów/zdarzeń**, bez implementacji guild/RBAC.

### 3.2 Poza zakresem (twarde)

- RBAC, guild permissions, synchronizacja ról Discord;
- system gildii / sojuszy / eventów / rezerwacji / party / kalendarza;
- właściwe funkcje bota biznesowego;
- MFA (passkey/TOTP) — tylko hooki/model „MFA-ready”;
- aplikacja desktopowa jako produkt;
- Steam / inni providerzy poza Discord + Google (tylko rozszerzalność);
- rozbudowany profil gracza / panel użytkownika jako produkt;
- Authorization Service poza kontraktami konsumującymi Identity (P3).

## 4. Granice usług

### 4.1 `identity-service` (właściciel)

**Owns:** User, ExternalIdentity, Session (metadane + unieważnianie), podstawowy profil, credentiale OAuth (tokeny providera jeśli przechowywane), audit zdarzeń bezpieczeństwa tożsamości, konfiguracja providerów.

**Exposes (synchronicznie, OpenAPI):**

- rozpoczęcie / callback OAuth (per provider),
- link / unlink providera,
- sesja: create (po login), validate (wewnętrzne), revoke one, revoke all,
- profil: get/update podstawowych pól,
- health/live/ready (w tym zależność DB + Redis gdy wymagane).

**Publishes (asynchronicznie, wersjonowane zdarzenia — szkic):**

- `identity.user.created.v1`
- `identity.user.updated.v1`
- `identity.external_identity.linked.v1`
- `identity.external_identity.unlinked.v1`
- `identity.session.revoked.v1`
- `identity.session.revoked_all.v1`

Inne usługi **nie** czytają bazy `identity`.

### 4.2 `authorization-service` (poza P2 implementacyjnie)

W P2: **zero** reguł RBAC. Może jedynie zostać udokumentowany kontrakt przyszłej konsumpcji `userId` V2. Zakaz mieszania modeli uprawnień w Identity.

### 4.3 Klienci

| Klient            | Rola w P2                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `web`             | BFF / route handlers wywołujące Identity; cookies sesji                                    |
| `admin`           | To samo; MFA dopiero później (D-018 — nie w P2)                                            |
| `api-gateway`     | Routing / edge; nie jest SoT tożsamości                                                    |
| `discord-gateway` | P1 harness bez platform login; P2 tylko przygotowanie pod przyszłe powiązanie user↔Discord |

## 5. Model danych (propozycja)

Identyfikatory: stabilny **V2 User ID** (UUID v7 lub ULID — decyzja implementacyjna po zatwierdzeniu; nie Discord snowflake).

### 5.1 `User`

- `id` (PK, V2)
- `displayName` (opcjonalnie na start)
- `primaryEmail` (nullable; zweryfikowany dopiero gdy provider to potwierdzi)
- `status` (`active` \| `disabled` \| `pending_deletion`)
- `createdAt` / `updatedAt`
- pola MFA-ready: `mfaEnabled` default false; bez sekretów TOTP w P2

### 5.2 `ExternalIdentity`

- `id`
- `userId` → User
- `provider` (`discord` \| `google` \| … enum rozszerzalny)
- `providerSubject` (stabilne ID u providera; dla Discord = user snowflake)
- `providerEmail` (nullable, snapshot)
- `emailVerified` (bool z claimów providera)
- `linkedAt`
- `rawProfileHash` / last sync metadata (bez zbędnego PII w logach)
- **UNIQUE** (`provider`, `providerSubject`)

### 5.3 `Session`

- `id` (losowy, wysokiej entropii; cookie niesie tylko opaque id lub podpisany uchwyt — patrz DEC-008)
- `userId`
- `createdAt` / `lastSeenAt` / `expiresAt`
- `revokedAt` (nullable)
- `ipHash` / `userAgentHash` (opcjonalnie, privacy-aware)
- `clientKind` (`web` \| `admin` \| `desktop` \| `api`) — przygotowanie pod desktop

**Źródło prawdy sesji aktywnej:** Identity DB (+ opcjonalnie cache Redis zgodnie z D-020; Redis nie zastępuje audytu unieważnień).

### 5.4 Relacje przyszłe (nie w P2)

```text
ExternalIdentity  →  User (V2)  →  GuildMembership / GuildProfile / Permissions
                                      ↑ authorization-service + domain services (P3+)
```

## 6. Przepływy

### 6.1 Login OAuth (Discord lub Google)

```text
Client → Identity: GET /auth/{provider}/start
  ← redirect_uri + state (+ PKCE verifier cookie/server store)
Provider consent
Client → Identity: GET /auth/{provider}/callback?code&state
  Identity: validate state/PKCE, exchange code, fetch subject
  If ExternalIdentity exists → load User
  Else → create User + ExternalIdentity (first login)
  Create Session; Set-Cookie (HttpOnly; Secure; SameSite=Lax|Strict per DEC)
  ← redirect to app
```

### 6.2 Account linking

```text
Authenticated session required
GET /auth/{provider}/link/start  (state bound to userId + intent=link)
callback:
  If providerSubject already linked to SAME user → idempotent OK
  If linked to OTHER user → REJECT (account takeover protection)
  If unbound → create ExternalIdentity for current user
  Audit event
```

**Zakaz (do decyzji DEC-005):** automatyczne łączenie dwóch Userów wyłącznie dlatego, że email z Discord i Google jest taki sam.

### 6.3 Session lifecycle

- Create on successful login / link-induced re-auth (policy TBD)
- Validate on each protected request (web middleware → Identity introspect lub signed internal context)
- Refresh sliding expiry (opcjonalnie) bez JWT w `localStorage`
- Revoke one: user or admin self-service
- Revoke all: security event (password/provider change later; P2: explicit endpoint)
- Logout: revoke + clear cookie

### 6.4 Internal service auth (szkic)

Zgodnie z D-020: krótkotrwały **podpisany kontekst tożsamości** między usługami (nie access token przeglądarki). Format (JWT vs PASETO vs opaque + RPC) = **DEC-009**.

## 7. Security model (wymagania planu)

Każdy punkt ma uzasadnienie; nie security theatre.

| Zagrożenie / kontrola | Wymaganie P2                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Credential storage    | Brak haseł lokalnych w P2 (OAuth-only na start); tokeny providera szyfrowane at-rest jeśli przechowywane                |
| OAuth state           | Losowy state, jednorazowy, TTL krótki, wiązany do sesji startu                                                          |
| PKCE                  | Wymagany dla publicznych klientów (web); zalecany wszędzie gdzie provider wspiera                                       |
| CSRF                  | State OAuth + SameSite cookies; osobne anty-CSRF dla mutacji cookie-session                                             |
| Session fixation      | Nowe session id po login                                                                                                |
| Session hijacking     | HttpOnly + Secure + krótkie TTL + revoke + opcjonalnie binding UA/IP (ostrożnie)                                        |
| Cookies               | `HttpOnly`, `Secure` (prod), `SameSite` uzgodnione; **zakaz** access tokenów w `localStorage` (NON_NEGOTIABLES / D-020) |
| Token leakage         | Redakcja w logach; brak sekretów w URL fragmentach po zakończeniu flow                                                  |
| Secret rotation       | Client secrets OAuth i signing keys z rotacją; wersjonowanie kid                                                        |
| Rate limiting         | `/auth/*/start`, `/callback`, `/logout`, `/sessions/revoke*`                                                            |
| Brute force           | Limit failed callbacks / link attempts per IP + per user                                                                |
| Account linking       | Tylko w sesji; reject subject already owned; step-up później (MFA)                                                      |
| Redirect URI          | Allowlista ścisła per środowisko                                                                                        |
| Provider revoke       | Unlink / token revoke; sesje mogą wymagać re-auth policy                                                                |
| Audit                 | Append-only security events (kto, co, kiedy, correlation id) bez PII/secrets                                            |
| CI / repo             | Zero sekretów; testy z stubami providerów                                                                               |

## 8. Threat considerations (skrót)

1. **Account takeover via linking** — subject już powiązany z innym Userem.
2. **OAuth redirect_uri manipulation** — otwarte przekierowanie.
3. **Session theft via XSS** — mitygacja HttpOnly; CSP poza samym Identity, ale cookie nie w JS.
4. **Confused deputy między web a admin** — osobne cookie name / audience `clientKind`.
5. **Email-based linking** — fałszywe poczucie wspólnego konta (DEC-005).
6. **Discord-only assumptions w innych usługach** — po multi-provider nie wolno używać Discord ID jako PK platformy.

## 9. Propozycja migracji

P2 to greenfield względem pustego szkieletu:

1. Wprowadzenie ORM/migracji **tylko** w `identity-service` (wybór ORM = decyzja implementacyjna po frameworku auth — nie blokuje planu).
2. Migracje wersjonowane; rollback strategy.
3. Seed wyłącznie lokalny/dev (nie produkcyjne konta).
4. Brak migracji z legacy „Aplikaja-gildii” w P2.
5. Redis: podłączenie URL do identity-service; sesje zgodnie z DEC-008.
6. Po P1 merge: nie mieszać bot token harness z OAuth client secrets użytkowników.

## 10. Plan testów

Bez wymogu „100% coverage”. Krytyczne ścieżki:

| Warstwa            | Co                                                                            |
| ------------------ | ----------------------------------------------------------------------------- |
| Unit               | Parse state/PKCE, linking conflict rules, session revoke semantics, redaction |
| Integration        | DB migrations; session store; HTTP auth routes z mockowanym providerem        |
| Negative           | Zły state, reused code, subject collision, wygasła sesja, CSRF                |
| Security-sensitive | Linking takeover cases; cookie flags; rate limit hooks (testowalne)           |
| Contract           | OpenAPI identity paths; event payload schemas                                 |
| CI                 | Deterministyczne; **bez** prawdziwych sekretów OAuth; mock IdP                |

`pnpm validate` obowiązkowe po implementacji (nie w tym PR planistycznym poza gate’ami docs).

## 11. Definition of Done (implementacja — przyszła)

- [ ] Identity Service: User / ExternalIdentity / Session działają end-to-end lokalnie
- [ ] Discord OAuth login + Google OAuth login
- [ ] Account linking z ochroną przed takeover
- [ ] Logout one + logout all
- [ ] Cookies zgodne z modelem sesji
- [ ] Health ready zależy od DB (+ Redis jeśli wymagany)
- [ ] Testy jak w §10; lint/typecheck/architecture boundaries
- [ ] ADR-y Accepted (nie Proposed); NON_NEGOTIABLES zaktualizowane jeśli multi-provider Approved
- [ ] Brak RBAC / guild / MFA implementacji
- [ ] Raport `CURSOR_TO_CHATGPT.md` + PR implementacyjny **bez** samodzielnego merge

## 12. Konflikty z dotychczasową konstytucją

| Dotychczas                                                                                 | Kierunek P2 (właściciel 2026-08-05)              | Działanie                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------- |
| D-016 / NON_NEGOTIABLES: login **wyłącznie** Discord; konto **związane** z Discord User ID | Multi-provider; V2 User niezależny od Discord ID | **DEC-003** — wymagana supersession                  |
| D-019: Better Auth                                                                         | Nie zakładać automatycznie                       | **DEC-004** — ponowna ocena frameworku               |
| D-017: utrata członkostwa Discord → unieważnij sesje                                       | Użytkownik może mieć tylko Google                | **DEC-006** — przeformułowanie reguły                |
| D-018: MFA admin obowiązkowe                                                               | Fundament MFA-ready, **bez** MFA w P2            | Zgodne z defer; MFA = P2+ / osobny etap              |
| D-020: sesje serwerowe + Redis + zakaz localStorage                                        | Potwierdzić vs JWT/refresh w przeglądarce        | **DEC-008** — rekomendacja: utrzymać D-020           |
| Workflow: nie startuj kolejnego etapu bez APPROVED poprzedniego                            | Plan P2 równolegle do audytu P1                  | **DEC-007** — planning OK; implementacja zablokowana |

**Cursor nie zmienia samodzielnie `NON_NEGOTIABLES.md` w tym PR.** Propozycja tekstu superseding jest w ADR-0010 (Proposed) i DEC-003.

## 13. ADR-y w pakiecie

| ADR                                                                          | Temat                                      | Status w tym PR                               |
| ---------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| [ADR-0009](../architecture/decisions/ADR-0009-identity-service-boundary.md)  | Granica Identity Service + encje           | **Proposed**                                  |
| [ADR-0010](../architecture/decisions/ADR-0010-multi-provider-identity.md)    | Multi-provider + linking principles        | **Proposed** (zależy od DEC-003)              |
| [ADR-0011](../architecture/decisions/ADR-0011-session-and-auth-transport.md) | Sesja przeglądarkowa + kontekst wewnętrzny | **Proposed** (potwierdza/doprecyzowuje D-020) |

Framework auth (Better Auth vs inne) **nie** dostaje Accepted ADR do czasu DEC-004.

## 14. PENDING_DECISIONS (skrót)

Pełna treść: `docs/ai/PENDING_DECISIONS.md`.

- **DEC-003** — Multi-provider vs Discord-only
- **DEC-004** — Framework auth
- **DEC-005** — Polityka account linking (email)
- **DEC-006** — Reguła D-017 przy userach bez Discord
- **DEC-007** — Sekwencja P1 APPROVED vs start implementacji P2
- **DEC-008** — Potwierdzenie opaque server session / Redis (vs JWT w przeglądarce)
- **DEC-009** — Format podpisanego kontekstu wewnętrznego między usługami

## 15. Handoff do implementacji (po APPROVED)

Gdy ChatGPT/właściciel zatwierdzą plan i rozstrzygną DEC-*:

1. Nowe zadanie w `CHATGPT_TO_CURSOR.md` ze statusem `READY_FOR_CURSOR`.
2. Branch implementacyjny `cursor/p2-identity-foundation` **od zaktualizowanego `main`**.
3. Najpierw migracje + model + security primitives, potem OAuth Discord, potem Google, potem linking UI/API, potem session revoke.
4. Nie importować logiki Authorization.
5. Nie zaczynać P3.

## 16. Ten PR planistyczny — DoD

- [x] Kompletny plan w tym pliku
- [x] Model danych, granice, flow, security, threat, migracje, testy
- [x] ADR Proposed 0009–0011
- [x] PENDING_DECISIONS uzupełnione
- [x] PROJECT_STATE / DECISION_LOG / raporty AI
- [x] PR do `main` bez merge — [#10](https://github.com/HOMZIKx/V2/pull/10)
- [ ] Audyt ChatGPT → `APPROVED` planu
