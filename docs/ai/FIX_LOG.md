# V2 — FIX LOG / REJESTR POPRAWEK

> **PRIORYTET OPERACYJNY:** ten plik jest obowiązkowym źródłem ciągłości prac dla ChatGPT, Cursor, Codex i kolejnych sesji/agentów pracujących nad V2.
>
> **Zasada bez wyjątków:** żadna poprawka, naprawa, hotfix, zmiana integracyjna, poprawka deploymentu ani usunięcie blockera nie jest uznane za zakończone, dopóki nie zostanie zapisane tutaj.

## Jak używać tego pliku

Przed rozpoczęciem jakiejkolwiek pracy nad repo:

1. przeczytaj `AGENTS.md`;
2. przeczytaj **ten plik w całości od najnowszych wpisów**;
3. sprawdź, czy aktualny problem nie był już naprawiany wcześniej;
4. nie cofaj wcześniejszej poprawki bez jawnego powodu i odnotowania regresji;
5. po każdej wykonanej poprawce dopisz nowy wpis;
6. przed zakończeniem zadania sprawdź, czy wpis zawiera wynik walidacji i stan deploymentu/runtime.

## Co MUSI znaleźć się we wpisie

Każdy wpis powinien zawierać, jeśli dotyczy:

- **data i czas**;
- **obszar / moduł**;
- **objaw / problem**;
- **przyczyna źródłowa** — jeśli została potwierdzona;
- **wykonana poprawka**;
- **zmienione pliki**;
- **commit / PR**;
- **walidacja**: typecheck, lint, test, build, CI;
- **deployment**: czy wdrożono i na jaki SHA;
- **runtime / E2E**: co faktycznie sprawdzono po wdrożeniu;
- **pozostałe ryzyka / rzeczy niepotwierdzone**;
- **status**: `DONE`, `PARTIAL`, `BLOCKED`, `REGRESSION`.

Nie wpisuj `DONE`, jeśli potwierdzono tylko ekran, HTTP 200, zielony test jednostkowy albo sam deployment. Dla funkcji produkcyjnych należy, gdy jest to technicznie możliwe, potwierdzić pełny przepływ:

`WWW → API → DB → reload/restart → API → WWW`

oraz dla integracji Discord:

`WWW/API → bot/gateway → Discord`.

---

# Wpisy

## 2026-09-08 17:31 — EQ: Torby / Magazyn + import pojedynczego itemu ze screena

- **Status:** `PARTIAL` — implementacja oraz CI są potwierdzone; produkcyjny runtime analizy AI pozostaje zablokowany wyłącznie przez brak `OPENAI_API_KEY` w usłudze `webapp-dest`. Sam moduł EQ nie wymaga tego klucza.
- **Obszar:** DESTILED Web, karta postaci / EQ, Player Team persistence, katalog itemów, screenshot import.
- **Problem / kierunek właściciela:** dotychczasowy ekran EQ nie odpowiadał docelowemu modelowi dużej torby. Właściciel wymaga osobnych widoków `Założone` i `Torba`, zakładek `Torba I`, `Torba II`, `Magazyn`, ręcznego zarządzania itemami oraz importu pojedynczego tooltipa ze screena z obowiązkowym podglądem/korektą przed zapisem.
- **Poprawka:** dodano nowy widok EQ z 8 slotami założonego sprzętu, pojemnymi siatkami Torba I/Torba II/Magazyn, panelem szczegółów, zakładaniem/zdejmowaniem/przenoszeniem, miękkim usuwaniem, ręcznym dodawaniem oraz edycją `+N` i bonusów. Lokalizacja wykorzystuje istniejące `lastConfirmedLocation`, więc przechodzi przez obecny `PlayerStoreState → player-team-service snapshot sync → PostgreSQL` bez nowej migracji. Timery pozostają na istniejącym komponencie.
- **Screenshot import:** `POST /api/equipment/analyze-item` przyjmuje tylko PNG/JPEG/WEBP do 8 MB, wysyła pojedynczy tooltip do OpenAI Responses API i zwraca wyłącznie draft `{name, enhancement, bonuses, confidence, notes}`. Endpoint nigdy nie zapisuje danych. UI wymaga jawnego `Potwierdź i dodaj`; po analizie użytkownik może skorygować nazwę, +N, slot i bonusy.
- **Katalog:** istniejący `dobry-temat-item-catalog.json` pozostaje źródłem głównym V2. Audyt potwierdził, że dane kategorii `Ulepszacze` już są w tym dumpie (m.in. Agat, Amulet Orka, Biała Perła); nie wykonano duplikującego importu starej bazy.
- **Zmienione pliki:** `apps/web/app/api/equipment/analyze-item/route.ts`, `apps/web/app/teams/[teamId]/characters/[characterId]/character-equipment-v2.tsx`, `.module.css`, `.module.css.d.ts`, `page.tsx`, `.env.example`.
- **Commit / PR:** branch `feat/equipment-inventory-screenshot-import-20260908`, PR `#72` do `preview/destiled-web`.
- **Walidacja:** pierwszy CI `34244773241` poprawnie wykrył TS2322 dla klas CSS slotów. Po lokalnym typowaniu CSS drugi CI `34244943904` zakończył `Quality gates`, `Infrastructure integration` i `Secret scan` statusem `success`; preview `pnpm typecheck` + `pnpm build`, dependency audit i 28 regresji Discord Gateway przeszły.
- **Zeabur audit:** read-only run `34245160534` potwierdził `webapp-dest` jako `RUNNING` na `preview/destiled-web`, bez `OPENAI_API_KEY`; wartości sekretów pozostają zredagowane przez bridge. Legacy `web` jest osobnym zawieszonym serwisem i nie jest celem deployu.
- **Pozostałe ryzyka:** screenshot AI po deployu będzie zwracał kontrolowane `503`, dopóki właściciel nie doda `OPENAI_API_KEY` do Variables `webapp-dest`. `OPENAI_VISION_MODEL` jest opcjonalny; domyślny model to `gpt-5.6-luna`. Pełny produkcyjny `WWW → API → Player Team → DB → reload` dla nowego EQ należy potwierdzić po merge/deploy i realnym zalogowaniu Discord OAuth.

## 2026-09-08 14:18 — Technika: live DM timerów postaci używa aktywnego szablonu

- **Status:** `DONE` — poprawka kodowa, deployment dokładnego SHA oraz realny produkcyjny przepływ `Web/API → Discord Gateway → Discord DM` zostały potwierdzone. `reminderMinutesBefore` pozostaje osobnym, świadomie otwartym zakresem i nie zmienia statusu tej naprawy.
- **Obszar:** `discord-gateway`, Technika config, timery postaci, trwały worker reminderów.
- **Problem:** zapis i aktywacja konfiguracji Technika działały oraz przetrwały restart i pełny Zeabur redeploy, ale realne live DM timerów postaci nadal używały hardcoded `formatTimerNotifyContent(...)`, więc zmiana `characterTimers.messageTemplate` była widoczna w test-DM, lecz nie w normalnym przepływie.
- **Przyczyna:** runtime poprawnie pobierał aktywny config do gate/toggle, ale treść live wiadomości nie konsumowała `characterTimers.messageTemplate`. Ten sam brak występował w kanonicznym durable workerze odpalanym po czasie.
- **Poprawka:** dodano osobny renderer szablonu timerów postaci oparty o `applyNotifyTemplate`; `NotifyController` rozdziela teraz character-timer payload od legacy formattera i pobiera aktywną konfigurację w chwili wysyłki. Durable worker również rozwiązuje aktywny szablon dopiero przy fire, więc zmiana w Technika działa dla kolejnej wiadomości bez restartu. Legacy map/metin formatter nie został zmieniony.
- **Zmienione pliki:** `apps/discord-gateway/src/application/notify/character-timer-template.ts`, `character-timer-template.spec.ts`, `apps/discord-gateway/src/interface/http/notify-character-template.spec.ts`, `notify.controller.ts`, `apps/discord-gateway/src/interface/discord/discord-bootstrap.service.ts`.
- **Commit / PR:** PR `#68`; kod `2dacfbac5faf4f58d43261e9cb34c407c40427e5`; korekta typowania testu `bb9fc801dfc7b78ad866944298ee41903ab212f3`; rebase merge do `preview/destiled-web`: `1126e7ead0649f0b6a78f3d669b847b85d096d2f`.
- **Walidacja:** pierwszy CI `34224933226` wykrył wyłącznie błąd typowania nowego mocka testowego; po korekcie CI `34225187832` zakończył `Quality gates`, `Infrastructure integration` i `Secret scan` statusem `success`; Discord gateway regression tests, preview typecheck/build gates i production dependency audit przeszły. PR Title `34225198774` również `success`.
- **Persistence proof:** wcześniejsze produkcyjne probe `34221254767` → restart `34221513829` → probe `34221568915` oraz pełny native redeploy `34221697477` / RUNNING deployment `6a9ff5427b89d694354a05a8` → probe `34222690555` zachowały tę samą rewizję, `updatedAt` i fingerprinty configu. To wyklucza reset/persistence jako przyczynę obecnego błędu.
- **Deployment:** Zeabur Discord Gateway deployment `6a9ffef87b89d694354a08b5` używa `refs/heads/preview/destiled-web`, `commitSHA=1126e7ead0649f0b6a78f3d669b847b85d096d2f` i osiągnął `RUNNING` (start `2026-09-08T12:26:45Z`, finish `12:27:54Z`). Post-merge CI `34226072593` zakończył się `success`.
- **Runtime / E2E:** po wdrożeniu probe Technika `34227126328` zachował rewizję `2`, `updatedAt=2026-09-08T11:02:14.967Z` i te same fingerprinty; public E2E `34227377285` potwierdził Discord Gateway `state=ready`, `isolationOk=true`, 3 guildie, komendy zarejestrowane i brak `lastError`. Następnie realny produkcyjny character-timer notify przez `/api/discord-notify` → `/notify/timer` → Gateway → Discord zakończył się w runie `34227810076` wynikiem HTTP `201`, `delivery=dm`, `messageIdPresent=true`, bez skipa. Aktywny produkcyjny template ma obecnie fingerprint defaultu `ae4c4b0323d6d028`; zachowanie zmiany aktywnego template bez restartu jest dodatkowo pokryte regresją z dwiema kolejnymi rewizjami w `notify-character-template.spec.ts`. Nie mutowano produkcyjnej konfiguracji tylko dla sztucznego markera E2E, aby nie zanieczyścić historii rollbacków.
- **Pozostałe ryzyka:** `reminderMinutesBefore` nadal nie jest osobnym pre-reminder jobem. Obecny job odpala się na `endsAt` i oznacza timer jako ready; nie wolno po prostu przesunąć go wcześniej. Bezpieczna poprawka wymaga osobnego `pre_reminder` (bez mark-ready) oraz `due` (z mark-ready), z migracją starych persisted jobs. To pozostaje osobnym `PARTIAL`.


## 2026-09-08 11:28 — API Gateway odzyskany kanonicznym redeployem + trwałe originy + public E2E

- **Status:** `DONE` dla odzyskania API Gateway, korekty trwałych originów, pełnego audytu środowiska i publicznego E2E. Interaktywny `Discord OAuth → session → Player Team write → DB → restart/reload → read` pozostaje osobnym `PARTIAL`, zgodnie z wcześniejszym wpisem, ponieważ wymaga realnej zgody użytkownika na Discordzie.
- **Obszar:** Zeabur production, `api-gateway`, `identity-service`, GitHub trigger, CORS/trusted origins, public E2E.
- **Problem:** po niekanonicznych ręcznych operacjach Zeabur `api-gateway` pozostał `SUSPENDED`; zwykłe pushe nie reaktywowały zawieszonej usługi. `deploy(..., vars)` wcześniej wywołał regresję runtime, a ręczny `deploy(..., gitRef)` mimo wskazania preview uruchamiał build z `main`. Dodatkowo w trwałej konfiguracji nadal występował wadliwy origin `https//v2-web.zeabur.app`.
- **Przyczyna:** dla istniejącego GitHub-service właściwą ścieżką reaktywacji jest natywne `redeployService(serviceID, environmentID)` korzystające z bieżącego `gitTrigger`, a nie ręczne `deploy(...)`. Nowy globalny rejestr `cicdSources` nie zawierał źródła tej legacy usługi (również po podaniu ownerID), więc `triggerCICDSource` nie był właściwą ścieżką dla tego API Gateway. Stale origin był zapisany w persistent environment variables.
- **Poprawka:** potwierdzono `gitTrigger` API na `repoID=1323125581`, `branchName=preview/destiled-web`, następnie wykonano `redeployService` bez przekazywania ręcznych vars/gitRef. Trwałe `API_GATEWAY_CORS_ORIGINS` oraz `IDENTITY_TRUSTED_ORIGINS` poprawiono przez `updateEnvironmentVariable` i zweryfikowano ponownym odczytem; nie użyto regresyjnego `deploy(..., vars)`.
- **Zmienione pliki / konfiguracja:** `Dockerfile.api-gateway` dokumentuje kanoniczne źródło Zeabur (`preview/destiled-web`); runtime env API/Identity zostały poprawione po stronie Zeabura. Operacje wykonano przez istniejący bridge na `ops/zeabur-control` (`run.mjs`, `repair-persistent-origins.mjs`, `audit-env.mjs`, `verify-public-e2e.mjs`).
- **Commit produkcyjnego źródła:** `eb66226297a57ef4401a2f35635bbbb956856272` (`preview/destiled-web`).
- **Deployment:** Zeabur deployment `6a9fd4677b89d6943549fbb1` uruchomiony przez `redeployService`, `ref=refs/heads/preview/destiled-web`, `commitSHA=eb66226297a57ef4401a2f35635bbbb956856272`; finalnie `RUNNING`, `suspendedAt=null`, `suspendedReason=null`.
- **Runy ops:** native redeploy `34209849959` (`e089d0facc9a717c1bf7d2df20d35bf228c10eed`); persistent origin repair `34209921025` (`9b35ccb315a35b2ae096b25239e3f358ac09843e`); finalny check API `34210022416`; post-recovery env audit `34210074022` (`f83bb86ffca696529ad473f67e341028766f9294`); public E2E `34210146628` (`b0f5eeb6150b62e13d4698fbd8fbfa0a59760c04`).
- **Walidacja środowiska:** finalny audyt: 14 usług, `critical=0`, `warning=1`, `info=8`. Jedyny warning to nieużywany/stary typo `UTHORIZATION_ASSERTION_AUD` w Discord Gateway obok poprawnego `AUTHORIZATION_ASSERTION_AUD`; nie blokuje runtime. `player-workspace-service` pozostaje świadomie na legacy branchu zgodnie z wcześniejszą decyzją.
- **Runtime / public E2E:** `https://desapp.zeabur.app/health/live` `200`; Identity ready `200` i `status=ok`; JWKS `200`, 1 klucz z `kid`; anonimowe Identity `/me` `401`; anonimowy Player Team state `401`; start OAuth `302` do `discord.com` i ustawia cookie; Discord Gateway `200`, `enabled=true`, `state=ready`, `isolationOk=true`, 3 guildie, komendy zarejestrowane, brak `lastError`; member-activity `200`, `6` członków, `12` wiadomości i `34` min voice.
- **Pozostałe ryzyka:** nie usuwać stale typo env automatycznie — to operacja destrukcyjna i nie jest potrzebna do działania. Nadal otwarty jest wcześniejszy manualny proof realnego loginu użytkownika i zapisu Player Team do DB po zgodzie OAuth; ten recovery go nie udaje ani nie oznacza jako zakończony.

## 2026-09-08 09:42 — Produkcyjny OAuth / Identity internal JWT / Player Team po restartach

- **Status:** `PARTIAL` dla pełnego login→write E2E; `DONE` dla konfiguracji runtime, readiness i odporności usług na restart.
- **Obszar:** `identity-service`, `webapp-dest`, `player-team-service`, API Gateway CORS/trusted origins, Zeabur production.
- **Problem:** wcześniejszy audyt wykazał, że kod internal JWT był wdrożony, ale produkcja nie miała kompletnego cutoveru; dodatkowo `IDENTITY_TRUSTED_ORIGINS` zawierało błędny origin `https//v2-web.zeabur.app`.
- **Przyczyna:** drift branch/env między usługami oraz niekanoniczna lista trusted origins.
- **Poprawka / stan końcowy:** produkcyjne `identity-service`, `webapp-dest` i `player-team-service` działają na `preview/destiled-web`; `IDENTITY_INTERNAL_JWT_ENABLED=true`, `INTERNAL_JWT_CLIENT_ENABLED=true`, `PLAYER_TEAM_INTERNAL_JWT_ENABLED=true`; wymagane client ID/private key/kid/audience/issuer/JWKS są obecne; legacy `PLAYER_TEAM_ALLOW_DEMO_WRITE` jest wyłączone. Listy API Gateway CORS i Identity trusted origins zostały zapisane w kanonicznej postaci i wymusiły redeploy.
- **Zmienione pliki operacyjne:** `ops/zeabur/verify-public-e2e.mjs` na `ops/zeabur-control` rozszerzony o Identity readiness, JWKS i unauthenticated Player Team probe; użyto istniejącego `ops/zeabur/repair-cors.mjs`.
- **Commity / runy ops:** env audit commit `db3a0e28a463d6d58064e3a6af5c8d5872d44793`, run `34199474406`; rozszerzony public probe commit `9338e99647d2ca08df63ecdc662442b7c1171243`, run `34199624952`; CORS repair commit `d609caa8d870fa2a710d5008ba0be9430ba0af4e`, run `34199921886`; post-repair probe run `34200077997`; Identity restart GraphQL run `34200224098`; post-Identity probe run `34200277880`; Player Team restart GraphQL run `34200334249`; post-restart env audit run `34200385455`; final public probe commit `6ff4025624a201feabe0634ebeb454df0d84e480`, run `34200597631`.
- **Walidacja runtime:** audyt po restartach: 14 usług, `critical=0`; `player-team-service=RUNNING`, internal JWT nadal włączony, baza skonfigurowana. Finalny public probe: web live `200`; Identity `/identity/health/ready` `200` (`database + redis + migration`); JWKS `200`, 1 klucz z `kid`; `/identity/me` bez sesji `401`; `/player-team/v1/me/state` bez sesji `401`; start OAuth `302` do `discord.com` i ustawia state cookie; Discord Gateway `ready`, 3 guildie, brak runtime error.
- **Restart proof:** po rzeczywistym `restartService` Identity publiczny auth probe nadal PASS; po `restartService` Player Team końcowy env audit i public probe również PASS.
- **Uwaga operacyjna:** stara ścieżka `cli service:restart` w bridge używa nieaktualnej flagi Zeabur CLI `--service-name` (run `34200126227` failure). Produkcyjne restarty wykonano poprawnie przez zweryfikowaną mutację GraphQL `restartService`; to jest dług narzędziowy bridge, nie awaria aplikacji.
- **Niepotwierdzone / ryzyka:** nie da się automatycznie wykonać zgody użytkownika na Discord OAuth. Nadal brakuje jednego realnego proof: użytkownik klika „Autoryzuj” → callback → aktywna sesja → web → internal JWT → zapis Player Team → DB → restart/reload → odczyt. Do tego potrzebna jest prawdziwa sesja użytkownika.

## 2026-09-08 09:16 — Trwała aktywność Discord i konfiguracja Technika na Zeaburze

- **Status:** `DONE` dla odporności bieżącego collectora na restart/redeploy filesystemu; docelowa migracja SoT do `activity-service` pozostaje osobnym długiem architektonicznym.
- **Obszar:** `discord-gateway`, member activity (`MessageCreate` + voice), Technika config, Zeabur persistent volume.
- **Problem:** `MemberActivityStore` i `VersionedConfigStore` zapisywały dane do lokalnych plików JSON, a produkcyjny `discord-gateway` miał `0` trwałych wolumenów. Restart/redeploy kontenera mógł więc wyzerować ranking aktywności i konfigurację Technika.
- **Przyczyna:** brak persistent volume oraz brak produkcyjnego `DISCORD_GATEWAY_DATA_DIR` wskazującego trwały mount.
- **Poprawka:** utworzono/montowano volume `discord-gateway-data` pod `/data` i ustawiono `DISCORD_GATEWAY_DATA_DIR=/data`. Bieżący aktywny config został zachowany; collector zapisuje daily buckets na trwałym dysku.
- **Zmienione pliki operacyjne (branch `ops/zeabur-control`):** `ops/zeabur/repair-discord-persistence.mjs`, `ops/zeabur/verify-discord-persistence-proof.mjs`, `.github/workflows/zeabur-ops.yml`.
- **Walidacja:** po cutoverze volume było zamontowane pod `/data` i miało realne użycie (~18 KB). Run `34198415994` wykonał kontrolowany restart procesu i zakończył się `success`: uptime spadł z ~494 s do ~4 s, config hash/revision przetrwały, `collectorStartedAt` pozostał identyczny, liczniki pozostały identyczne, bot wrócił do `ready` bez błędu.
- **Runtime:** Discord Gateway jest `enabled=true`, `state=ready`, `isolationOk=true`, ma 3 guildie w cache i zarejestrowane komendy. Collector działa bez zależności od WWW: adapter nasłuchuje bezpośrednio eventów Discord `MessageCreate` i `VoiceStateUpdate`.
- **Niepotwierdzone / ryzyka:** w chwili proof ranking miał `0` członków / `0` wiadomości / `0` minut voice, więc potwierdzono trwałość mechanizmu/config/meta, ale nie wykonano jeszcze proof `niezerowy licznik → restart → ten sam niezerowy licznik`. Dodatkowo ADR-0014 wskazuje `activity-service` jako docelowe SoT dla danych domeny Activity; bieżący volume usuwa ryzyko resetów teraz, ale nie zastępuje przyszłej migracji tych bucketów do bazy Activity.

## 2026-09-08 — Player Team persistence: przejście z demo-header auth na Identity internal JWT

- **Status:** `PARTIAL`
- **Obszar:** `apps/web`, `services/player-team-service`, Identity integration, persistence auth.
- **Problem:** produkcyjny zapis Player Team nadal opierał się na kompatybilności z `x-demo-viewer-id`, mimo że repo posiadało już mechanizm Identity internal JWT.
- **Przyczyna:** web proxy wyprowadzał Discord ID z sesji Identity, ale przekazywał go dalej przez legacy header; `player-team-service` nie weryfikował Identity-issued JWT.
- **Poprawka:** web proxy potrafi wystawić short-lived Identity internal JWT przy użyciu istniejącego klienta `v2.api-gateway`; `player-team-service` weryfikuje podpis EdDSA/JWKS, issuer, audience i lifetime przed zaakceptowaniem serwerowego Discord ID. Zachowano Discord snowflake jako klucz istniejących danych, aby uniknąć migracji/utraty zapisów. Legacy header pozostaje wyłącznie jako jawny tryb kompatybilności, gdy internal JWT nie jest aktywowany zmiennymi środowiskowymi.
- **Zmienione pliki:**
  - `apps/web/app/player-team/[...path]/route.ts`
  - `services/player-team-service/src/infrastructure/config/player-team-env.ts`
  - `services/player-team-service/src/interface/player-team.controller.ts`
- **PR:** `#61 fix(player-team): cut persistence auth over to Identity JWT`
- **Merge SHA:** `cc3943e1e9e51976f5e2113ce5f0e6672838c52c`
- **Walidacja:** TypeScript przeszedł dla `web` i `player-team-service`; infra integration i secret scan przeszły. Pierwszy production build został zablokowany przez wcześniejszy, niezwiązany błąd ESLint w `player-team-workspace-live-api.ts`.
- **Deployment:** Zeabur wdrożył merge SHA, ale finalny zielony build/deploy jest opisany w następnym wpisie.
- **Niepotwierdzone:** rzeczywiste aktywowanie `INTERNAL_JWT_CLIENT_ENABLED` / `PLAYER_TEAM_INTERNAL_JWT_ENABLED` w konfiguracji Zeabura i pełny przepływ zapisu z prawdziwą sesją Discord.

## 2026-09-08 — Produkcyjny build web: usunięcie `no-unsafe-return` w workspace live API

- **Status:** `DONE` dla build/deploy; runtime funkcjonalny nadal wymaga osobnych testów E2E.
- **Obszar:** `apps/web/src/player-team-workspace-live-api.ts`, CI, Zeabur deployment.
- **Problem:** `pnpm typecheck` przechodził, ale `pnpm build` kończył się błędem ESLint `@typescript-eslint/no-unsafe-return` w trzech callbackach `response.text().catch(...)`.
- **Przyczyna:** callback `.catch()` na Promise był inferowany w sposób powodujący unsafe return podczas lintowania wykonywanego przez Next production build.
- **Poprawka:** zastąpiono problematyczne inline `.catch()` bezpiecznym helperem zwracającym jawnie `Promise<string>`.
- **Zmieniony plik:** `apps/web/src/player-team-workspace-live-api.ts`.
- **Commit / final deployment SHA:** `350891f10a037b73edcca670a508de693e96ba20`.
- **Walidacja:** `pnpm typecheck` PASS; `pnpm build` PASS; production dependency audit PASS; infrastructure integration PASS; secret scan PASS.
- **Deployment:** Zeabur — `Deployed successfully` dla SHA `350891f10a037b73edcca670a508de693e96ba20`.
- **Runtime:** sam deployment potwierdzony; pełny Discord OAuth → session → Player Team write → DB → reload/restart → read nadal wymaga osobnego potwierdzenia.

## 2026-09-08 — Obowiązkowy rejestr poprawek dla wszystkich przyszłych sesji AI

- **Status:** `DONE`.
- **Obszar:** dokumentacja operacyjna AI / ciągłość pracy.
- **Problem:** wykonane poprawki mogły zostać utracone między chatami lub agentami, co zwiększało ryzyko powtarzania pracy, cofania wcześniejszych napraw i opierania się na nieaktualnym kontekście.
- **Przyczyna:** repo nie miało jednego obowiązkowego, trwałego rejestru wykonanych napraw wymuszonego przez nadrzędne instrukcje dla agentów.
- **Poprawka:** utworzono `docs/ai/FIX_LOG.md` jako obowiązkowy rejestr oraz zmieniono `AGENTS.md`, aby każdy ChatGPT/Cursor/Codex/agent AI musiał przeczytać rejestr przed pracą i dopisać wpis przed uznaniem poprawki za zakończoną. Dodano też zasadę `DONE/PARTIAL/BLOCKED/REGRESSION` i wymóg rozróżniania build/deploy od realnego E2E.
- **Zmienione pliki:**
  - `docs/ai/FIX_LOG.md`
  - `AGENTS.md`
- **Commity:** utworzenie rejestru `4d9b0c3fc37a53269fe84362989e613995e1bb91`; wymuszenie w `AGENTS.md` `ec1676700e59e4dccfa738b65b87de75de138807`.
- **Walidacja:** zmiana dokumentacyjna; sprawdzono zapis obu plików na `preview/destiled-web`.
- **Deployment:** nie jest wymagany funkcjonalnie do działania tej reguły; pliki są już zapisane w branchu roboczym repo.
- **Runtime / E2E:** nie dotyczy.
- **Niepotwierdzone / ryzyka:** reguła działa dla agentów, które respektują `AGENTS.md`; dlatego `FIX_LOG.md` został również wpisany bezpośrednio do obowiązkowej kolejności czytania.

## 2026-09-08 06:43 — Zweryfikowany most GitHub Actions → Zeabur Public API

- **Status:** `DONE` dla połączenia i uwierzytelnienia API.
- **Obszar:** GitHub Actions, Zeabur Public API, operacje deployment/runtime.
- **Problem:** brakowało potwierdzonego kanału, przez który kolejne sesje AI mogą bezpiecznie wykonywać kontrolowane operacje na Zeaburze bez zapisywania tokenu w repo.
- **Przyczyna:** sekret Zeabura istniał w GitHub Actions pod nazwą `zebur`, ale nie było workflow sprawdzającego jego dostępność i ważność.
- **Poprawka:** dodano `.github/workflows/zeabur-connectivity.yml`. Workflow odczytuje wyłącznie `${{ secrets.zebur }}`, wykonuje bezpieczne zapytanie `query { me { username } }` do `https://api.zeabur.com/graphql`, nie wypisuje tokenu ani nazwy użytkownika i kończy się błędem przy braku sekretu, HTTP innym niż 200, błędzie GraphQL lub braku uwierzytelnionego użytkownika.
- **Zmieniony plik:** `.github/workflows/zeabur-connectivity.yml`.
- **Commit:** `86fcf1aaa12529eeb24a6b8e1c6da0e779e08c0f`.
- **Walidacja:** GitHub Actions run `34187997914`, job `zeabur-auth` / `101940110041` zakończył się `success`; Zeabur API zaakceptował Bearer token i zwrócił poprawną odpowiedź uwierzytelnionego konta.
- **Deployment:** do samego testu API nie jest wymagany deployment aplikacji; commit na `preview/destiled-web` uruchomił niezależnie standardowy pipeline/deployment brancha.
- **Runtime / E2E:** potwierdzono realne połączenie GitHub-hosted runner → `api.zeabur.com` → uwierzytelniony Zeabur Public API.
- **Niepotwierdzone / ryzyka:** nie oznacza to jeszcze, że mamy gotowe workflow do każdej mutacji Zeabura. Kolejne operacje powinny być dodawane jako jawna allowlista (np. odczyt usług/logów/env presence, restart/redeploy) z blokadą operacji destrukcyjnych.

## 2026-09-08 06:55 — Pełny most operacyjny GitHub Actions → Zeabur + audyt produkcji

- **Status:** `DONE` dla kanału administracyjnego; `PARTIAL` dla naprawy wykrytego driftu produkcyjnego.
- **Obszar:** Zeabur Public API/GraphQL, GitHub Actions, deployment/runtime, konfiguracja usług.
- **Problem:** samo sprawdzenie tokenu nie dawało kolejnym sesjom możliwości realnego audytu i korekty ustawień Zeabura. Nie było też trwałego sposobu pobierania konfiguracji, logów, deploymentów ani wykonywania kontrolowanych restartów/redeployów/mutacji.
- **Poprawka:** utworzono dedykowany branch sterujący `ops/zeabur-control` oraz trwały most: `ops/zeabur/run.mjs`, `ops/zeabur/command.json`, `ops/zeabur/README.md`, `.github/workflows/zeabur-ops.yml`. Most obsługuje uwierzytelnienie, introspekcję aktualnego GraphQL schema, dowolne bezpieczne `graphql_read`, kontrolowane `graphql_write`, odczyt build/runtime logs oraz restart usług przez oficjalny Zeabur CLI. Mutacje wymagają jawnego `ZEABUR_WRITE_APPROVED`; operacje destrukcyjne mają dodatkową blokadę. Wyniki są sanitizowane i publikowane jako krótkotrwałe artefakty bez wartości sekretów.
- **Dlaczego osobny branch:** operacje administracyjne nie są zapisywane na `preview/destiled-web`, więc sam odczyt logów/config nie powoduje przebudowy produkcji.
- **Zweryfikowany projekt Zeabur:** `untitled-1`, project ID `6a720a3e472e2c91a9e660d5`, środowisko `production` ID `6a720a3e5f062718bc7b3421`.
- **Zweryfikowane usługi:** `v2`, `postgresql`, `redis`, `discord-gateway`, `activity-service`, `api-gateway`, `identity-service`, `authorization-service`, `web`, `admin`, `webapp-dest`, `player-workspace-service`, `postgres-player-team`, `player-team-service`.
- **Walidacja mostu:** `auth` PASS (`34188296846`), GraphQL schema discovery PASS (`34188321497`), project/service/environment inventory PASS (`34188373587`, `34188412520`), service/deployment settings PASS (`34188534275`), env/domain/port/git/resource/health configuration audit PASS (`34188701088`).
- **Potwierdzone możliwości zapisu API:** m.in. create/update/delete env var, restart/redeploy, update branch, build/start command, Git trigger, health check, ports, resource limits i auto-restart. Operacje usuwające są blokowane przez most bez dodatkowej jawnej zgody.
- **Wykryty drift produkcji:** nie wszystkie usługi śledzą główny branch wdrożeniowy. `activity-service` i `authorization-service` są na `cursor/p4-1-activity-domain`; `api-gateway` i `player-workspace-service` na `cursor/player-workspace-team-character-board-foundation`; `player-team-service` na `cursor/player-team-online-persistence-dfe5`. `web` i `admin` są zawieszone. Aktualne `v2`, `discord-gateway`, `identity-service` i `webapp-dest` śledzą `preview/destiled-web`.
- **Kluczowe ustalenie Player Team:** produkcyjny `player-team-service` nie ma obecnie zmiennych `PLAYER_TEAM_INTERNAL_JWT_ENABLED`, `PLAYER_TEAM_INTERNAL_JWT_ISSUER`, `PLAYER_TEAM_INTERNAL_JWT_AUDIENCE`, `PLAYER_TEAM_INTERNAL_JWT_JWKS_URL`, `PLAYER_TEAM_AUTHENTICATED_DISCORD_HEADER`, a sam service działa z branch `cursor/player-team-online-persistence-dfe5`. `webapp-dest` również nie ma obecnie generic `INTERNAL_JWT_CLIENT_*` wymaganych do aktywacji nowego web proxy auth. Oznacza to, że wcześniejszy kod internal-JWT jest w repo, ale nie jest jeszcze faktycznie aktywnym produkcyjnym przepływem.
- **Deployment/runtime:** w tym kroku nie zmieniano jeszcze branchy, env ani danych produkcyjnych; wykonano wyłącznie odczyt i budowę kontrolowanego kanału administracyjnego.
- **Następny priorytet:** wyrównać stale branch/service deploymenty do właściwych SHA, następnie skonfigurować i zweryfikować Identity internal JWT oraz pełny przepływ `Discord OAuth → session → web → player-team → DB → reload/restart → read`.

---

## Szablon nowego wpisu

```md
## YYYY-MM-DD HH:MM — Krótka nazwa poprawki

- **Status:** `DONE | PARTIAL | BLOCKED | REGRESSION`
- **Obszar:**
- **Problem:**
- **Przyczyna:**
- **Poprawka:**
- **Zmienione pliki:**
- **Commit / PR:**
- **Walidacja:**
- **Deployment:**
- **Runtime / E2E:**
- **Niepotwierdzone / ryzyka:**
```