# ChatGPT → Cursor

## Current owner directive — Web/Admin

**Status:** `HOLD_CURSOR_WEB_PRODUCT_UI`  
**Decisions:** D-037–D-060 (2026-09-02)

Until an approved production frontend slice is handed off:

- preserve the existing Web/Admin implementation; do not delete it;
- do not use the existing Web/Admin UI, previous Sites demo or legacy project as
  the design reference;
- do not independently create or redesign page layout, navigation, graphics,
  copy, animations or user-facing content;
- do not start maps, market, AI equipment import, dungeon analytics or bot-admin
  Web UI ahead of the first player slice;
- continue only technical work that does not assume Web/Admin UX;
- raise `OWNER_DECISION_REQUIRED` when a technical choice changes user-facing
  behavior.

The production frontend will be designed and implemented in the V2 repository
by ChatGPT with the owner, using the repository's approved stacks. Cursor will
then connect the approved frontend to real API, Identity, Authorization,
Discord, databases and Zeabur deployment without independently rebuilding its
product design.

The first handoff target is fixed to:

```text
Member dashboard
  -> My teams
  -> Team workspace
  -> Character board
  -> Equipment / named sets
  -> Progression timers / team actions / notes
  -> Change history
```

Cursor must preserve the collaboration semantics of this slice:

- presence is ephemeral and separate from persistent data;
- different resources may be edited at the same time;
- a multi-field edit lease blocks only that resource, not a page or character;
- shared mutations carry an expected revision;
- stale writes produce a visible conflict and never silently overwrite data;
- placement and timer commands are idempotent;
- authorization applies to snapshots, mutations and realtime subscriptions;
- mobile tap destination and keyboard paths are equivalent to desktop dragging.

Mandatory sources:

1. [WEB_PRODUCT_DESIGN_AND_DELIVERY.md](../product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md)
2. [PLAYER_TEAMS_AND_ACTIVITY_VISIBILITY.md](../product/PLAYER_TEAMS_AND_ACTIVITY_VISIBILITY.md)
3. [PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md](../product/PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md)
4. [FIRST_PLAYER_JOURNEY_COHERENCE_REVIEW.md](../product/FIRST_PLAYER_JOURNEY_COHERENCE_REVIEW.md)
5. [TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md](../product/TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md)
6. [PROJECT_HARD_DUNGEON_RUN_ANALYZER.md](../product/PROJECT_HARD_DUNGEON_RUN_ANALYZER.md)

The owner accepted the first-player coherence gate. ChatGPT may now implement
the Phase 5 production shell. Current interactive previews remain validation
material, not a screenshot-only handoff. Cursor receives production code and
adapters only after that shell/slice is reviewed and frozen. Draft PR #31 is the
first production checkpoint and is not yet an integration authorization.

The active game context is Project Hard. D-055–D-059 require one private
workspace model, accepted team invitations, named loadouts, moderated catalog
layers and human-confirmed team reminders. Character/team progression timers
and map-session SpawnTimers are separate domains and must never share records,
configuration, membership or permissions. The later Technician bot configurator
must operate on a backend-owned versioned schema with validation, impact preview,
apply, audit and rollback; a control without a verified runtime effect is not a
completed feature.

D-052 defines a later private-team analyzer, but it does not authorize its
implementation now. When eventually
implemented, it must use effective-dated game definitions, human-reviewed OCR,
frozen price snapshots and the same no-silent-overwrite collaboration baseline.
DESTILED must never become a credential vault: do not add fields, endpoints or
bot modals for Project Hard/email logins, passwords, PINs, verification/recovery
codes, cookies or tokens.

This directive does not start a new Cursor implementation task.

## Status

`READY_FOR_CURSOR` (historical brief)

> **Owner amendment (PR #11, 2026-08-05):** aktywny zakres proof slice = **Discord OAuth
> only**. Google nie jest wymagany w konfiguracji, proof UI ani live gate. Architektura
> multi-provider (V2 User UUID, porty, explicit linking) pozostaje. Poniższy tekst briefu
> historycznie wymieniał Discord + Google — traktuj aktywny zakres jak Discord-only.

## Task ID

`P2-IDENTITY-PROOF-001`

## Nazwa

Better Auth proof slice dla Identity Service.

## Cel

Zaimplementuj pierwszy ograniczony, lecz rzeczywisty fragment P2 Identity, który ma udowodnić, że zatwierdzona architektura działa na obecnym stosie V2:

1. Node.js 24 + NestJS 11 + Fastify 5;
2. Better Auth za portami i adapterami `identity-service`;
3. PostgreSQL jako trwały store użytkowników i kont;
4. Redis jako operacyjne source of truth aktywnych sesji;
5. logowanie Discord (aktywny P2; drugi provider deferred);
6. wyłącznie jawne linkowanie kont;
7. natychmiastowe unieważnianie sesji;
8. działanie Discord login również wtedy, gdy Discord nie zwraca e-maila.

To jest **proof/integration slice**, nie pełna implementacja P2. Jeżeli proof ujawni krytyczną niezgodność Better Auth z ADR-0009–0012, zatrzymaj się i zgłoś `BLOCKED`; nie buduj nieudokumentowanych obejść.

## Repozytorium i przepływ pracy

- Repo: `HOMZIKx/V2`
- Base: aktualny `main`, co najmniej commit `4230fb185044faef15d4dd59a9c3c99f6c2b5956`
- Gałąź: `cursor/p2-identity-proof-slice`
- Pracuj wyłącznie w istniejącym draft PR utworzonym dla tego zadania.
- Nie commituj bezpośrednio do `main`.
- Nie wykonuj merge.

## Dokumenty obowiązkowe

Przeczytaj przed implementacją, w tej kolejności:

1. `AGENTS.md`
2. `.cursor/rules/00-project-constitution.mdc`
3. `docs/NON_NEGOTIABLES.md`
4. `docs/DECISION_LOG.md`
5. `docs/ai/WORKFLOW.md`
6. `docs/ai/P2_IDENTITY_FOUNDATION_HANDOFF.md`
7. `docs/architecture/IDENTITY_FOUNDATION.md`
8. `docs/architecture/DATA_OWNERSHIP.md`
9. `docs/architecture/decisions/ADR-0009-identity-service-boundary.md`
10. `docs/architecture/decisions/ADR-0010-multi-provider-identity.md`
11. `docs/architecture/decisions/ADR-0011-session-and-auth-transport.md`
12. `docs/architecture/decisions/ADR-0012-better-auth-engine.md`
13. `docs/quality/QUALITY_GATES.md`
14. `docs/quality/TESTING_STRATEGY.md`

## Przypięte zależności

Użyj dokładnych wersji, bez `^`, `~`, `latest`, beta albo RC:

```text
better-auth=1.6.25
@better-auth/redis-storage=1.6.25
auth=1.6.25             # CLI jako devDependency albo jawnie wersjonowane pnpm dlx
ioredis=5.11.1
@fastify/cors=11.3.0
pg=8.22.0
```

`pg` ma być bezpośrednią zależnością `@v2/identity-service`, a nie przypadkową zależnością tylko z root workspace. Nie dodawaj community adaptera Nest dla Better Auth. Nie używaj Better Auth 1.7 beta/RC.

Każdą dodatkową zależność przypnij dokładnie, uzasadnij w raporcie i nie dodawaj ciężkiego ORM bez potrzeby. W tym proof użyj wbudowanego adaptera PostgreSQL/Kysely Better Auth z `pg.Pool`.

## Granice architektury

1. `domain` i `application` nie importują Better Auth, NestJS, Fastify, `pg`, ioredis ani SDK providerów.
2. Better Auth może istnieć wyłącznie w `services/identity-service/src/infrastructure/**` oraz w cienkiej warstwie montującej handler w `interface/**`.
3. Kontrolery nie mogą zwracać surowych obiektów Better Auth jako docelowego kontraktu V2.
4. Zdefiniuj jawne porty aplikacyjne co najmniej dla:
   - odczytu bieżącej tożsamości;
   - listy powiązanych providerów;
   - jawnego rozpoczęcia linkowania;
   - unlinkowania;
   - logout current;
   - logout all;
   - systemowego revoke wszystkich sesji użytkownika.
5. Inne aplikacje i usługi nie otrzymują dostępu do bazy `identity` ani kluczy Redis Identity.
6. Nie rozwijaj `authorization-service` w tym PR.

## Konfiguracja

Rozszerz walidowaną konfigurację oraz `.env.example`. Wszystkie sekrety pozostają puste w repo.

Wymagane znaczeniowo zmienne:

```text
IDENTITY_AUTH_ENABLED=false
IDENTITY_DATABASE_URL=
IDENTITY_REDIS_URL=redis://127.0.0.1:6379/1
IDENTITY_AUTH_BASE_URL=http://127.0.0.1:4200
IDENTITY_AUTH_BASE_PATH=/api/auth
IDENTITY_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
IDENTITY_BETTER_AUTH_SECRET=
IDENTITY_DISCORD_CLIENT_ID=
IDENTITY_DISCORD_CLIENT_SECRET=
IDENTITY_PROOF_UI_ENABLED=false
```

(Drugi OAuth provider deferred — brak `IDENTITY_GOOGLE_*` w aktywnym zakresie P2.)

Możesz poprawić nazwy, jeżeli zachowasz spójny prefiks `IDENTITY_` i zaktualizujesz całą dokumentację.

Zasady:

1. `IDENTITY_AUTH_ENABLED=false` pozwala uruchomić zwykły fundament i CI bez sekretów oraz bez połączeń OAuth.
2. Przy `IDENTITY_AUTH_ENABLED=true` brak DB, Redis, base URL, secretu albo konfiguracji Discorda powoduje czytelny fail-fast przed nasłuchem HTTP.
3. `IDENTITY_BETTER_AUTH_SECRET` ma mieć co najmniej 32 bajty entropii.
4. Sekrety nie mogą pojawić się w logach, błędach, snapshotach, raportach, query stringach ani argumentach poleceń.
5. Produkcja nie może działać z HTTP, insecure cookie, wildcard origin ani localhost redirectem.
6. Trusted origins i redirect URI są ścisłą allowlistą.

## Better Auth i model danych

1. Skonfiguruj Better Auth poprzez fabrykę w Infrastructure.
2. Użyj oficjalnego, udokumentowanego wzorca integracji z Fastify i zamontuj catch-all pod `IDENTITY_AUTH_BASE_PATH`.
3. Handler musi poprawnie przekazywać metodę, pełny URL, query, body, nagłówki, status oraz wszystkie nagłówki `Set-Cookie` bez ich sklejania lub utraty.
4. Ustaw stabilne UUID V2 przez `advanced.database.generateId: "uuid"` albo równoważną oficjalną opcję tej wersji.
5. Wygeneruj i przejrzyj schemat SQL przy użyciu dokładnej wersji CLI `auth=1.6.25`.
6. Commituj deterministyczną migrację SQL w `services/identity-service/migrations/`.
7. Dodaj jawne, idempotentne polecenie migracyjne dla lokalnego środowiska i CI. Zwykły start usługi nie może automatycznie wykonywać migracji.
8. Potwierdź lub dodaj bazodanową unikalność `(providerId, accountId)`; nie polegaj wyłącznie na kontroli aplikacyjnej.
9. Identity jest logicznym właścicielem User, Account/ExternalIdentity, Verification i Session. Aktywne sesje mają być operacyjnie przechowywane w Redis.

## Redis i sesje

1. Użyj oficjalnego `@better-auth/redis-storage` z ioredis jako `secondaryStorage`.
2. Użyj osobnego prefiksu kluczy, np. `v2:identity:auth:`.
3. Redis jest source of truth aktywnych sesji.
4. Wyłącz cookie cache.
5. Wyłącz stateless session mode.
6. Przy secondary storage ustaw brak kopii używalnego tokenu sesji w PostgreSQL. PostgreSQL może zawierać wyłącznie osobny model metadanych/audytu bez tokenu, jeśli jest rzeczywiście potrzebny.
7. Cookie proof dla Web:
   - opaque;
   - `HttpOnly`;
   - `SameSite=Lax`;
   - host-only;
   - `Secure` poza localhost;
   - bez JWT w cookie;
   - bez tokenów w `localStorage` i `sessionStorage`;
   - własny prefix/nazwa V2, bez cookie na całą domenę.
8. Admin cookie i Admin login pozostają poza tym proof. Nie twierdź, że zostały wdrożone; architektura nadal wymaga osobnej przestrzeni sesji Admin w późniejszym slice.
9. Po `logout`, `logout all` albo systemowym revoke stary cookie ma przestać działać natychmiast, bez okna cache.
10. Po zamknięciu aplikacji zamknij `pg.Pool` i ioredis graceful shutdownem.

## Providerzy i tożsamość

### Discord

1. Włącz provider Discord i wymagane minimalne scope do logowania użytkownika.
2. Nie dodawaj scope bota ani uprawnień serwera do user OAuth.
3. Discord może zwrócić `email=null`. Flow ma nadal utworzyć/odnaleźć V2 User na podstawie stabilnego provider account ID.
4. Ponieważ Better Auth 1.6 wymaga pola e-mail, użyj deterministycznego, wewnętrznego adresu w zarezerwowanej domenie `.invalid`, wyprowadzonego bezpiecznie z providera i subjectu.
5. Oznacz taki adres jawnie jako syntetyczny w modelu/danych. `/identity/me` ma zwracać `email: null` albo osobne pole wskazujące brak prawdziwego e-maila; nie przedstawiaj syntetycznego adresu jako danych kontaktowych użytkownika.
6. Syntetyczny e-mail nie może służyć do auto-linkingu, odzyskiwania konta ani wysyłki wiadomości.

### Google (deferred — poza aktywnym proof P2)

1. Nie włączaj Google w tym proof slice. Porty i model Account pozostają multi-provider-ready.
2. Gdy właściciel doda drugi provider później: minimalne scope profilu i e-maila; bez Drive/Calendar/Gmail.

### Linking

Skonfiguruj:

```text
account.accountLinking.enabled=true
account.accountLinking.disableImplicitLinking=true
account.accountLinking.allowDifferentEmails=true
account.accountLinking.allowUnlinkingAll=false
```

Wymagania:

1. Ten sam zweryfikowany e-mail u dwóch tożsamości OAuth nie może automatycznie scalić kont.
2. Same-email sign-in istniejącego użytkownika ma zwrócić kontrolowany błąd `account_not_linked` lub stabilnie zmapowany kod V2.
3. Dodatkowy provider można powiązać tylko w aktywnej sesji jawnego flow.
4. Provider subject zajęty przez innego V2 User powoduje odmowę, nigdy reassignment.
5. Nie można odłączyć ostatniej metody logowania.
6. Linkowanie providera nie może niejawnie zmieniać tożsamości, e-maila ani głównego profilu istniejącego V2 User.

## Provider access/refresh tokens

Plan P2 zabrania niejawnego pozostawiania surowych tokenów providera.

1. Najpierw udowodnij, czy Better Auth może po zakończeniu OAuth pozostawić pola `accessToken`, `refreshToken` i `idToken` puste, skoro V2 nie wywołuje API Discorda po logowaniu.
2. Jeśli oficjalne hooki tej wersji pozwalają bezpiecznie usunąć te wartości bez psucia login/link/unlink, zastosuj to i dodaj test bazy.
3. Jeżeli Better Auth wymaga ich trwałego zapisu, nie przechowuj ich jawnie. Ustaw `account.encryptOAuthTokens: true`, udowodnij szyfrowanie testem/inspekcją i opisz, dlaczego token jest wymagany.
4. Nie dodawaj własnej kryptografii bez ADR.
5. Jeżeli żadna z powyższych dróg nie spełnia wymagań bez kruchego obejścia, ustaw `BLOCKED` i ponownie otwórz DEC-004. Nie zapisuj surowych provider tokenów tylko po to, żeby proof przeszedł.

## Kontrakty proof

Dodaj cienkie, stabilne endpointy V2 w Identity Service. Nazwy mogą być dopracowane, ale sens ma pozostać:

```text
GET  /identity/me
GET  /identity/accounts
POST /identity/link/:provider
DELETE /identity/accounts/:accountId
POST /identity/logout
POST /identity/logout-all
```

Systemowy revoke ma istnieć jako port/use case i test integracyjny. Nie wystawiaj publicznego endpointu administracyjnego chronionego prowizorycznym sekretem. Kontrakt wewnętrzny i internal JWT powstaną w kolejnym slice P2.

Odpowiedzi:

1. nie zwracają access/refresh/id tokenów;
2. nie zwracają surowego cookie ani identyfikatora sesji;
3. używają stabilnych kodów błędów V2;
4. nie ujawniają surowych wyjątków biblioteki;
5. walidują wszystkie dane wejściowe w runtime.

## Dev-only proof UI

Dodaj minimalny interfejs testowy umożliwiający właścicielowi wykonanie live gate bez ręcznego składania żądań OAuth.

1. Może to być strona w `identity-service` albo cienka strona w `apps/web` korzystająca wyłącznie z kontraktów Identity.
2. Jest dostępna tylko przy `IDENTITY_PROOF_UI_ENABLED=true` i `NODE_ENV!=production`.
3. W produkcji route ma zwracać 404 albo nie być rejestrowany.
4. Ma umożliwić: Discord sign-in, odczyt `me`, listę kont, jawne link, unlink, logout current i logout all.
5. Nie ma być docelowym UI, design systemem ani produkcyjną stroną logowania.
6. Nie wyświetla sekretów, provider tokenów, pełnych cookies ani technicznych stack trace.
7. Logout/logout-all muszą wysyłać niepuste JSON body (`{}`) przy `Content-Type: application/json` (Fastify).

## Health i readiness

1. `health/live` potwierdza wyłącznie działanie procesu.
2. Gdy auth jest włączone, `health/ready` jest 200 tylko po potwierdzeniu PostgreSQL, Redis, migracji/schema i gotowości konfiguracji Better Auth.
3. Awaria DB albo Redis po starcie ustawia readiness na nie-2xx bez wycieku connection stringa.
4. Gdy auth jest świadomie wyłączone, health jasno raportuje `authDisabled`, a nie udaje pełnej gotowości Identity.

## Testy automatyczne

CI nie może korzystać z prawdziwych credentiali Discord ani wykonywać zewnętrznych OAuth calls.

Dodaj co najmniej:

1. konfiguracja disabled/enabled, fail-fast i redakcja wszystkich sekretów;
2. architektura: brak importu Better Auth/pg/ioredis poza dozwolonymi warstwami;
3. migracja SQL i idempotentny runner na testowej bazie;
4. UUID V2 i unikalność provider account;
5. Fastify handler: GET/POST, query/body/headers/status i wiele `Set-Cookie`;
6. strict trusted origins/CORS z credentials;
7. session cookie flags na localhost i tryb produkcyjny;
8. sesja istnieje w Redis, a używalny token nie istnieje w PostgreSQL;
9. `me` dla sesji prawidłowej i unieważnionej;
10. logout current, logout all i system revoke działają natychmiast;
11. brak cookie cache/stateless session;
12. Discord profile z `email=null` tworzy stabilnego V2 User bez przedstawiania syntetycznego e-maila jako kontaktowego;
13. brak implicit linking dla tego samego e-maila;
14. jawne linking różnych e-maili;
15. odmowa przejęcia provider subject należącego do innego usera;
16. odmowa unlink ostatniego providera;
17. provider tokeny są nieprzechowywane albo zaszyfrowane zgodnie z udowodnioną ścieżką;
18. endpointy nie zwracają tokenów ani sesyjnych sekretów;
19. health/readiness przy DB/Redis up/down;
20. graceful shutdown klientów infrastruktury.

Testy z PostgreSQL i Redis mają działać w istniejącym lokalnym/CI infrastructure job. Nie zastępuj wszystkich integracji mockami. Jednocześnie nie uruchamiaj prawdziwego Discord OAuth w CI.

## Bramka live OAuth

Po zielonym kodzie, testach i CI ustaw status `READY_FOR_LIVE_TEST`, nie `READY_FOR_REVIEW`.

Dodaj `docs/identity/LOCAL_OAUTH_PROOF.md` z dokładną instrukcją:

1. utworzenia lokalnych credentiali OAuth Discord (tylko);
2. redirect URI dla rzeczywistego base URL i base path;
3. lokalnego ustawienia sekretów w ignorowanym `.env`;
4. migracji i startu infrastruktury/usługi;
5. otwarcia dev-only proof UI;
6. wykonania pełnej checklisty;
7. usunięcia/rotacji credentiali po teście.

Nigdy nie proś właściciela o wklejenie client secret do czatu, issue, PR ani screenshotu.

Live checklista:

1. Discord sign-in z normalnym kontem;
2. Discord sign-in z profilem bez e-maila, jeśli dostępne; brak takiego konta nie może być zastąpiony fałszywym twierdzeniem — obowiązkowy pozostaje test automatyczny profilu `email=null`;
3. same-email / multi-account policy pokryte testami automatycznymi (bez live drugiego OAuth);
4. unlink nie pozwala usunąć ostatniego providera;
5. `me` nie ujawnia syntetycznego e-maila jako kontaktowego;
6. logout current działa;
7. logout all i system revoke natychmiast odrzucają stary cookie;
8. kontrola PostgreSQL/Redis potwierdza model storage;
9. brak surowych tokenów providera w bazie i logach.

Po potwierdzeniu właściciela ustaw `READY_FOR_REVIEW`.

## Poza zakresem

Nie implementuj w tym PR:

1. P3 Authorization, role, membership i politykę guild-scoped;
2. produkcyjnego UI logowania Web/Admin;
3. MFA, passkey, TOTP i recovery codes;
4. internal JWT między usługami;
5. API Gateway auth middleware;
6. integracji konta V2 z botem Discord;
7. RabbitMQ, Outbox i zdarzeń Identity;
8. produkcyjnego deployu lub Zeabur;
9. providerów innych niż Discord (drugi OAuth deferred);
10. email/password, magic links ani resetu hasła;
11. przechowywania tokenów w przeglądarce;
12. funkcji biznesowych bota.

## Operacje zabronione

1. Commit bezpośrednio do `main`.
2. Samodzielny merge PR.
3. Użycie `latest`, beta lub RC.
4. Community Nest adapter Better Auth.
5. Import Better Auth do Domain/Application albo innych usług.
6. Cross-read bazy Identity albo Redis Identity.
7. Auto-merge kont po e-mailu.
8. Traktowanie e-maila albo Discord ID jako PK V2 User.
9. JWT jako browser session.
10. Cookie cache pozostawiający okno po revoke.
11. Surowe OAuth tokens w repo, logach lub publicznych odpowiedziach.
12. Automatyczne migracje przy zwykłym starcie produkcyjnym.
13. `any`, `@ts-ignore`, wyłączanie testów albo obniżanie quality gates.
14. Udawanie live testu przy użyciu wyłącznie mocków.

## Kryteria akceptacji do audytu

Zadanie może otrzymać `READY_FOR_REVIEW` tylko gdy:

1. implementacja znajduje się w draft PR na `cursor/p2-identity-proof-slice`;
2. Better Auth 1.6.25 i pozostałe nowe zależności są przypięte dokładnie;
3. granice ADR-0009–0012 są zachowane;
4. PostgreSQL i Redis działają zgodnie z ustalonym ownership/storage;
5. Discord OAuth, explicit linking policy, `me`, unlink i revoke mają testy;
6. null-email Discord jest obsłużony bez uzależniania identity od e-maila;
7. provider tokens nie są pozostawione jawnie;
8. pełne `pnpm validate` oraz wszystkie workflowy GitHub są zielone na finalnym HEAD;
9. manualna bramka live OAuth została potwierdzona przez właściciela;
10. dokumentacja odpowiada faktycznej implementacji;
11. `CURSOR_TO_CHATGPT.md` zawiera dowody, a nie deklaracje;
12. PR pozostaje bez merge.

## Raport końcowy Cursora

Zaktualizuj `docs/ai/CURSOR_TO_CHATGPT.md` i `docs/ai/PROJECT_STATE.md`. Raport ma zawierać:

1. status `READY_FOR_LIVE_TEST`, `READY_FOR_REVIEW` albo `BLOCKED`;
2. branch, PR i finalny HEAD w komentarzu PR;
3. wszystkie dokładne wersje nowych zależności;
4. schemat warstw i listę portów;
5. listę migracji i checksumę SQL;
6. faktyczny model tabel i kluczy Redis;
7. cookie name/flags/TTL bez wartości sekretnej;
8. wynik testu null-email Discord;
9. wynik implicit/explicit linking;
10. dowód storage provider tokenów;
11. wyniki komend testowych i `pnpm validate`;
12. ID workflowów CI na finalnym HEAD;
13. wynik live checklisty albo precyzyjną blokadę;
14. ryzyka, odstępstwa i dług techniczny;
15. propozycję następnego slice bez jego implementowania.

Najpierw przedstaw krótki plan implementacji w komentarzu draft PR, następnie wykonaj całość bez otwierania dodatkowego PR.
