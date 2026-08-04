# ChatGPT → Cursor

## Status

`READY_FOR_CURSOR`

## Task ID

`P1-DISCORD-TEST-HARNESS-001`

## Nazwa

Pierwszy bezpieczny bot V2 online na dedykowanym serwerze testowym.

## Cel

Rozbuduj istniejący `apps/discord-gateway` z technicznego szkieletu do pierwszego rzeczywiście działającego adaptera Discord. Po wykonaniu zadania bot ma połączyć się z Discord Gateway, działać wyłącznie na zatwierdzonym serwerze testowym, rejestrować wyłącznie komendy guild-scoped i obsługiwać pierwszy dopracowany panel testowy zgodny ze standardem UX V2.

To nadal nie jest implementacja modułów biznesowych, systemu kont, pełnych uprawnień ani produkcyjnego bota. Etap ma stworzyć bezpieczny, testowalny harness do dalszego rozwijania interakcji Discord.

## Serwer testowy

Jedyny dozwolony serwer Discord na tym etapie:

```text
1534228693017432124
```

ID ma być dostarczane przez walidowaną konfigurację `DISCORD_TEST_GUILD_ID`. Nie hardcoduj go w logice aplikacji. Może znajdować się w `.env.example`, dokumentacji i testach jako jawna wartość środowiska testowego.

## Priorytety

1. Bezpieczeństwo tokenu i izolacja do jednego serwera.
2. Niezawodne działanie po restarcie i czytelna diagnostyka.
3. Szybka, intuicyjna interakcja bez reakcji emoji i bez spamu wiadomościami.
4. Własny, dopracowany styl V2.
5. Rozszerzalna architektura pod kolejne komendy i panele.
6. Wygląd nigdy nie może maskować błędnego albo kruchego działania.

## Protokół rozpoczęcia

1. Zaktualizuj lokalny `main` z `origin/main` po merge PR #3.
2. Utwórz gałąź `cursor/p1-discord-test-harness`.
3. Przeczytaj wszystkie dokumenty obowiązkowe, w szczególności standard Discord UX.
4. Przed implementacją przedstaw krótki plan, strukturę adaptera, model konfiguracji, listę minimalnych uprawnień i pełny flow pierwszego panelu.
5. Nie pytaj o drobne decyzje techniczne wynikające z tego promptu.
6. Zatrzymaj wyłącznie część wymagającą prawdziwego tokenu lub ręcznej operacji w Discord Developer Portal; cały kod, testy i dokumentację przygotuj wcześniej.

## Dokumenty obowiązkowe

Przeczytaj w tej kolejności:

1. `AGENTS.md`
2. `.cursor/rules/00-project-constitution.mdc`
3. `.cursor/rules/70-discord-post-ux.mdc`
4. `docs/NON_NEGOTIABLES.md`
5. `docs/PROJECT_CHARTER.md`
6. `docs/DECISION_LOG.md`
7. `docs/architecture/SYSTEM_ARCHITECTURE.md`
8. wszystkie ADR-y w `docs/architecture/decisions/`
9. `docs/ux/DISCORD_POST_INTERACTION_STANDARD.md`
10. `docs/ai/WORKFLOW.md`
11. `docs/ai/PROJECT_STATE.md`
12. `docs/ai/PENDING_DECISIONS.md`

## Zatwierdzone decyzje techniczne

- Node.js 24 LTS i TypeScript strict.
- NestJS 11 pozostaje hostem aplikacji `discord-gateway`.
- Discord SDK: dokładnie stabilny `discord.js` **14.25.1**, przypięty lockfilem. Nie używaj `main`, beta, RC ani nieudokumentowanych API.
- Połączenie przez Discord Gateway/WebSocket.
- Discord REST API v10 do rejestracji komend.
- Tylko intent `GatewayIntentBits.Guilds`. Nie włączaj `MessageContent`, `GuildMembers`, `GuildPresences` ani innych privileged intents.
- Komendy rejestrowane wyłącznie dla `DISCORD_TEST_GUILD_ID`. Zakaz rejestrowania komend globalnych.
- Brak kolektorów zależnych od pamięci procesu jako podstawy panelu. Interakcje istniejącego panelu mają działać po restarcie procesu.
- Brak bazy danych i ORM na tym etapie.
- Tymczasowa autoryzacja operatorów testowych przez walidowaną allowlistę Discord User ID oraz uprawnienie `ManageGuild`. Nie udawaj, że jest to docelowy system autoryzacji.
- Wszystkie sekrety wyłącznie przez lokalne zmienne środowiskowe. Nigdy przez argument CLI, frontend, logi ani pliki śledzone przez Git.

## Konfiguracja

Rozszerz wspólną walidowaną konfigurację. Wymagane zmienne:

```text
DISCORD_ENABLED=false
DISCORD_APPLICATION_ID=
DISCORD_TOKEN: required secret set only in an ignored local environment file
DISCORD_TEST_GUILD_ID=1534228693017432124
DISCORD_TEST_OPERATOR_IDS=
DISCORD_COMPONENT_SIGNING_SECRET=
DISCORD_AUTO_REGISTER_GUILD_COMMANDS=false
DISCORD_STRICT_GUILD_ISOLATION=true
```

Wymagania:

- `DISCORD_ENABLED=false` jest bezpiecznym ustawieniem domyślnym dla zwykłego `pnpm dev` i CI.
- Gdy `DISCORD_ENABLED=true`, brak tokenu, application ID, guild ID, operatora albo signing secret ma powodować fail-fast przed próbą logowania.
- `DISCORD_TOKEN` musi być traktowany jako sekret i redagowany we wszystkich błędach/logach.
- `DISCORD_COMPONENT_SIGNING_SECRET` minimum 32 bajty entropii; dodaj cross-platformowe polecenie generujące sekret lokalnie, bez zapisywania go do repo.
- `DISCORD_TEST_OPERATOR_IDS` to lista snowflake rozdzielona przecinkami, walidowana i normalizowana bez duplikatów.
- Nie używaj `process.env` poza warstwą konfiguracji.
- `.env.example` nie może zawierać prawdziwego tokenu ani signing secret.
- Dodaj testy wszystkich trybów konfiguracji i redakcji sekretów.

## Zakres implementacji

### 1. Struktura adaptera Discord

Uporządkuj `apps/discord-gateway`, zachowując granice odpowiedzialności. Oczekiwany sens warstw:

```text
src/
  application/
    commands/
    interactions/
    ports/
  infrastructure/
    discord/
    security/
  interface/
    discord/
    http/
  presentation/
    discord/
```

Nazwy mogą zostać dostosowane, ale obowiązują zasady:

- inicjalizacja klienta, REST i obiekty `discord.js` pozostają w adapterze infrastrukturalnym/interfejsowym;
- logika flow panelu nie może być anonimowym kodem w jednym handlerze `interactionCreate`;
- jeden centralny router interakcji przekazuje wykonanie do jawnych handlerów;
- nowe komendy i komponenty mają być dodawane przez czytelny rejestr, bez rozbudowanego `switch` w jednym pliku;
- nie przenoś Discord-specific kodu do `packages/contracts` ani do innych usług.

### 2. Cykl życia klienta

Zaimplementuj usługę zarządzającą klientem Discord:

- start tylko przy `DISCORD_ENABLED=true`;
- logowanie przez token z konfiguracji;
- jednoznaczny stan: `disabled`, `connecting`, `ready`, `degraded`, `stopping`, `failed`;
- timeout startu;
- obsługa `ready`, `error`, `warn`, `shardError`, `invalidated`, reconnectów i rate-limit diagnostics dostępnych w stabilnym SDK;
- graceful shutdown przy zamykaniu Nest/SIGTERM/SIGINT;
- brak ujawniania tokenu i pełnych payloadów użytkownika w logach;
- ustrukturyzowane logi z `interactionId`, `guildId`, `channelId`, `userId`, typem interakcji i czasem obsługi;
- prosty licznik błędów/interakcji w pamięci procesu tylko do diagnostyki, bez traktowania go jako trwałych danych.

### 3. Ścisła izolacja serwera

- Po `ready` zweryfikuj, że bot jest członkiem serwera `DISCORD_TEST_GUILD_ID`.
- Przy `DISCORD_STRICT_GUILD_ISOLATION=true` obecność bota na jakimkolwiek innym serwerze ma ustawić stan na `failed`, zablokować gotowość i zakończyć proces czytelnym błędem.
- Zdarzenie dołączenia do nieautoryzowanego serwera nie może uruchomić żadnej funkcji. W trybie strict bot ma opuścić nieautoryzowany serwer i zapisać zdarzenie bezpieczeństwa bez danych wrażliwych.
- Każda komenda i komponent ma ponownie weryfikować `guildId`; nigdy nie polegaj wyłącznie na rejestracji komend.
- Interakcje z DM i innych guild mają otrzymać bezpieczną odpowiedź odmowną, jeśli można odpowiedzieć, a następnie zostać zakończone.
- Nie wymagaj i nie używaj treści wiadomości użytkowników.

### 4. Rejestracja komend

Dodaj idempotentne, cross-platformowe polecenia:

```text
pnpm discord:test:doctor
pnpm discord:test:register
pnpm discord:test:start
pnpm discord:test:generate-secret
```

`doctor`:

- waliduje konfigurację bez drukowania sekretów;
- sprawdza po REST application identity;
- sprawdza dostęp do dokładnie wskazanego guild;
- potwierdza członkostwo bota i wymagane uprawnienia w wybranym kanale, jeśli podano opcjonalny channel ID;
- wykrywa istniejące komendy globalne i zgłasza je jako ryzyko, ale nie usuwa ich automatycznie;
- kończy się niezerowym kodem przy błędzie.

`register`:

- używa wyłącznie guild route;
- nadpisuje deklaratywnie kompletny zestaw komend testowych w tym guild;
- jest idempotentne;
- wyświetla nazwy i wersje zarejestrowanych komend bez tokenu;
- nie zawiera ścieżki rejestrującej global commands.

`start`:

- uruchamia tylko `discord-gateway` w trybie Discord enabled;
- ma działać na Windowsie bez Bash-only wrapperów;
- nie przyjmuje tokenu jako argumentu.

### 5. Komenda `/status`

- Guild-scoped.
- Dostępna dla członków serwera testowego.
- Odpowiedź zawsze prywatna/ephemeral.
- Pokazuje wyłącznie bezpieczne dane: stan połączenia, environment `test`, wersję aplikacji/commit, uptime, ping, ID dozwolonego guild i status rejestru komend.
- Nie pokazuje tokenu, signing secret, operator listy, hostów baz ani surowych wyjątków.
- Odpowiada szybko; dłuższe odczyty poprzedź `deferReply({ ephemeral: true })`.

### 6. Komenda `/panel-test`

Komenda służy do opublikowania pierwszego trwałego panelu interaktywnego V2.

Autoryzacja:

- dozwolona dla użytkownika znajdującego się w `DISCORD_TEST_OPERATOR_IDS` albo posiadającego `ManageGuild`;
- brak uprawnienia daje krótką odpowiedź ephemeral;
- wymagane uprawnienia bota w kanale: `ViewChannel`, `SendMessages`, `EmbedLinks`, `ReadMessageHistory` oraz możliwość używania aplikacyjnych komponentów;
- nie wymagaj `Administrator`.

Publikacja:

- panel publiczny, odpowiedzi na wybory domyślnie ephemeral;
- komenda nie może produkować serii dodatkowych publicznych wiadomości;
- po sukcesie potwierdzenie komendy prywatne;
- w razie braku uprawnień zwróć konkretną listę brakujących uprawnień.

### 7. Wygląd pierwszego panelu

Panel jest prototypem własnego stylu V2, nie kopią FlameCode ani innego bota.

Kierunek:

- głębokie grafitowe tło;
- główny akcent electric violet;
- pomocniczy chłodny cyan;
- spójne emoji/ikony związane z funkcją;
- jednoznaczna hierarchia, wysoka czytelność na telefonie;
- żadnego przypadkowego miksowania stylów.

Minimalny układ:

```text
V2 LAB • PANEL TESTOWY
Krótki opis celu panelu.
Stan połączenia | Środowisko | Wersja panelu
Opcjonalny, własny banner V2 LAB
Select menu: „Wybierz funkcję testową”
Przyciski: „Odśwież” i „Usuń panel”
Footer: V2 • TEST • wersja
```

Banner:

- dodaj własny, wymienny prototyp bannera 1200×360 PNG;
- ciemny grafit, violet/cyan, subtelna siatka lub geometryczne akcenty;
- napis `V2 LAB` i `ŚRODOWISKO TESTOWE`;
- bez zewnętrznych fontów wymagających licencji i bez kopiowania cudzych assetów;
- zachowaj edytowalne źródło projektu/skrypt generujący asset;
- banner jest dodatkiem; nie wolno obniżyć jakości działania panelu, aby go dodać.

### 8. Flow komponentów

Select menu placeholder:

```text
Wybierz funkcję testową
```

Opcje:

1. `🧭 Stan systemu` — aktualizuje bezpieczny status w odpowiedzi ephemeral.
2. `🧪 Test odpowiedzi` — zwraca ephemeral potwierdzenie z correlation ID.
3. `📝 Formularz testowy` — bezpośrednio otwiera modal z jednym krótkim polem tekstowym.

Przyciski:

- `Odśwież` — operator może zaktualizować ten sam panel, bez tworzenia nowej wiadomości;
- `Usuń panel` — styl danger, wyłącznie operator/ManageGuild, wymaga krótkiego potwierdzenia przed usunięciem albo bezpiecznego dwuetapowego flow bez nowej publicznej wiadomości.

Modal:

- jedno pole `Uwagi testowe`, limit 300 znaków;
- dane nie są zapisywane;
- nie loguj treści formularza;
- po submit zwróć ephemeral potwierdzenie i długość tekstu, nie jego treść.

Wymagania interakcji:

- zero reakcji emoji jako sterowania;
- zero collectorów, które przestają działać po restarcie;
- interakcje starego panelu mają działać po restarcie tego samego wydania;
- po nieobsługiwanej/nieaktualnej wersji custom ID użytkownik dostaje czytelne ephemeral: panel jest nieaktualny i trzeba użyć `/panel-test`;
- obsłuż podwójne kliknięcia i duplikaty interaction ID przez krótkie idempotency window;
- każda interakcja ma zostać potwierdzona przed limitem Discorda;
- błędy użytkownika są krótkie, techniczne szczegóły pozostają w logach.

### 9. Bezpieczne custom IDs

Zaimplementuj wersjonowane, podpisane custom IDs:

- format o jawnej wersji, typie akcji i krótkim payloadzie;
- HMAC-SHA256 z `DISCORD_COMPONENT_SIGNING_SECRET`;
- podpis skrócony i zakodowany base64url, całość poniżej limitu Discord `custom_id`;
- constant-time comparison podpisu;
- odrzucenie niepoprawnego podpisu, nieznanej wersji i nieznanej akcji;
- brak danych wrażliwych w payloadzie;
- testy manipulacji payloadem i podpisem.

Nie wyprowadzaj signing secret z tokenu Discord.

### 10. Health i diagnostyka

Zachowaj:

- `GET /health/live` — proces działa;
- `GET /health/ready` — 200 tylko gdy Discord jest wyłączony świadomie albo klient jest rzeczywiście gotowy i izolacja guild jest poprawna;
- przy `DISCORD_ENABLED=true` oraz stanie connecting/degraded/failed readiness ma zwracać odpowiedni nie-2xx;
- opcjonalny developerski `GET /health/discord` może pokazać bezpieczny stan szczegółowy, ale nigdy sekrety ani pełne obiekty SDK.

Health ma być testowalny bez prawdziwego Discorda przez port/adapter mock.

### 11. Minimalne uprawnienia i Developer Portal

Utwórz `docs/discord/TEST_BOT_SETUP.md` z instrukcją:

- utworzenie lub wybór aplikacji w Discord Developer Portal;
- utworzenie bot usera i bezpieczne skopiowanie tokenu;
- rotacja tokenu po podejrzeniu wycieku;
- instalacja wyłącznie na serwerze testowym;
- scopes: `bot` i `applications.commands`;
- minimalne permissions: `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`;
- brak `Administrator`;
- wyłączenie privileged intents;
- pobranie Application ID, Guild ID i własnego User ID;
- lokalne utworzenie `.env`/dozwolonego pliku środowiskowego ignorowanego przez Git;
- uruchomienie `doctor`, `register`, `start`;
- procedura usunięcia bota i rotacji sekretów;
- zakaz wklejania tokenu do czatu, PR, issue, screenshotu, terminal history i argumentów poleceń.

Dokument nie może zawierać prawdziwego tokenu ani prywatnych danych.

### 12. Testy automatyczne

CI nie może wymagać prawdziwego tokenu ani połączenia z Discordem.

Dodaj co najmniej:

- test walidacji konfiguracji disabled/enabled;
- test redakcji tokenu i signing secret;
- test parsera listy operatorów;
- test izolacji guild dla command, component, modal i DM;
- test autoryzacji operator/ManageGuild/odmowa;
- test deklaracji komend i gwarancji guild-only registration;
- test renderera panelu: title, kolor, footer, select, buttons, custom IDs i banner attachment;
- test signed custom IDs, tampering, unknown version/action i limitu długości;
- test modal flow bez logowania treści;
- test duplicate interaction/idempotency;
- test stanów health/readiness;
- test graceful shutdown klienta;
- test, że używany jest wyłącznie intent `Guilds`;
- integracyjny test routera interakcji na mockowanym adapterze Discord;
- test skryptów `doctor`/`register` bez sieci przez mockowany REST port.

Nie dodawaj testów opartych na `true === true`, snapshotów całych niestabilnych obiektów SDK ani ukrytych live calls w CI.

### 13. CI i kontrola bezpieczeństwa

- `pnpm validate` pozostaje zielone.
- Dodaj nowe testy do istniejących targetów Nx i coverage.
- Skan sekretów ma obejmować nowe pliki.
- Dodaj statyczną kontrolę lub test, że kod nie zawiera global command route i privileged intents.
- Dodaj test, że token nie jest interpolowany do logów/błędów.
- Nie dodawaj deployu ani sekretów GitHub Actions.
- Nie uruchamiaj bota live w CI.

### 14. Manualny live test — obowiązkowa druga bramka

Po ukończeniu kodu i zielonym CI:

1. Ustaw status `READY_FOR_LIVE_TEST`, nie `READY_FOR_REVIEW`.
2. Poproś właściciela wyłącznie o wykonanie instrukcji z `docs/discord/TEST_BOT_SETUP.md` i lokalne ustawienie sekretów. Nie proś o przesłanie tokenu w czacie.
3. Uruchom lokalnie `doctor`, `register` i `start`.
4. Potwierdź:
   - bot online na guild `1534228693017432124`;
   - brak obecności/działania na innym guild;
   - `/status` działa ephemeral;
   - `/panel-test` publikuje jeden panel;
   - select menu, modal, odświeżenie i usunięcie działają;
   - panel nadal odpowiada po restarcie procesu;
   - brak publicznego spamu i reakcji;
   - logi nie zawierają tokenu ani treści modala.
5. Dopiero po live teście ustaw `READY_FOR_REVIEW`.

W raporcie wolno podać Application ID, Bot User ID i Guild ID, ponieważ nie są sekretami. Nigdy nie podawaj tokenu ani signing secret.

## Dokumentacja i ADR

Zaktualizuj:

- `README.md`;
- `.env.example`;
- `docs/DEVELOPMENT.md`;
- `docs/architecture/SERVICE_CATALOG.md`;
- `docs/quality/TESTING_STRATEGY.md`;
- `docs/quality/QUALITY_GATES.md`;
- `docs/ai/PROJECT_STATE.md`;
- `docs/ai/CURSOR_TO_CHATGPT.md`;
- `docs/ai/PENDING_DECISIONS.md`, tylko gdy wystąpi prawdziwa blokada.

Dodaj:

- `docs/discord/TEST_BOT_SETUP.md`;
- ADR-0007 opisujący: discord.js, Gateway, guild-only commands, minimal intents, strict guild isolation, signed stateless components oraz brak live Discorda w CI.

Dokumentacja ma opisywać rzeczywisty kod i komendy.

## Poza zakresem

Nie implementuj:

- Discord OAuth i logowania WWW;
- Better Auth, sesji, passkeys ani TOTP;
- docelowego RBAC/ABAC;
- synchronizacji członków, ról lub pełnego cache guild;
- message commands, prefix commands ani czytania treści czatu;
- modułów wydarzeń, rezerwacji, LFG, moderacji, ticketów, muzyki, powiadomień i automatyzacji;
- bazy danych lub ORM dla Discord Gateway;
- RabbitMQ, Outbox, retry/DLQ i Streams;
- global commands;
- sharding;
- produkcyjnego deployu i hostingu;
- automatycznego tworzenia aplikacji w Developer Portal;
- kopiowania wyglądu FlameCode albo starego projektu.

## Operacje zabronione

- Commit bezpośrednio do `main`.
- Wpisanie tokenu/signing secret do repozytorium, logów, raportu lub argumentów CLI.
- Użycie `MessageContent` lub innych privileged intents.
- Rejestrowanie komend globalnych.
- Użycie `Administrator` jako wymaganego permission bota.
- Sterowanie reakcjami emoji.
- Collector jako jedyny mechanizm obsługi trwałego panelu.
- Automatyczne działanie na serwerze innym niż `1534228693017432124`.
- Zmiana standardu UX, konstytucji albo zaakceptowanych ADR-ów bez decyzji właściciela.
- `any`, `@ts-ignore`, wyłączanie testów/lintu lub obniżanie coverage w celu przepchnięcia CI.
- Rozpoczynanie systemu tożsamości albo właściwych funkcji biznesowych.

## Kryteria akceptacji

Zadanie jest gotowe do audytu tylko gdy:

1. PR powstał z gałęzi `cursor/p1-discord-test-harness` i nie został scalony.
2. Finalny HEAD ma zielone wszystkie joby CI i `pnpm validate`.
3. `DISCORD_ENABLED=false` uruchamia fundament bez tokenu.
4. `DISCORD_ENABLED=true` fail-fastuje przy brakujących lub błędnych zmiennych.
5. Kod używa tylko intent `Guilds` i nie ma global command registration.
6. `doctor`, `register`, `start` i generator secret działają cross-platformowo.
7. Izolacja guild jest wymuszana przy starcie i przy każdej interakcji.
8. `/status` i `/panel-test` mają kompletne testy bez live Discorda.
9. Panel jest zgodny z `DISCORD_POST_INTERACTION_STANDARD.md`, posiada własny branding, select menu, przyciski i modal, bez reakcji.
10. Signed custom IDs działają po restarcie i odrzucają manipulacje.
11. Health/readiness odzwierciedlają realny stan Discorda.
12. Żaden sekret ani treść modala nie trafia do logów/repo.
13. Minimalne uprawnienia i setup Developer Portal są udokumentowane.
14. Manualny live test na `1534228693017432124` zakończył się sukcesem.
15. `CURSOR_TO_CHATGPT.md` zawiera finalny SHA, PR, wersję `discord.js`, wyniki CI, wyniki live testu, Bot User ID/Application ID/Guild ID oraz jawne odstępstwa.

## Raport końcowy Cursora

Raport ma zawierać:

- status `READY_FOR_REVIEW` albo `BLOCKED`;
- Task ID;
- branch, finalny commit i numer PR;
- listę plików/obszarów zmian;
- dokładną wersję `discord.js`;
- opis architektury klienta i routera interakcji;
- listę intents, scopes i permissions;
- wyniki `pnpm validate` i CI;
- wynik `doctor`, guild registration i manualnego live testu;
- Application ID, Bot User ID i Guild ID bez sekretów;
- potwierdzenie, że global commands nie zostały zarejestrowane;
- potwierdzenie, że panel działa po restarcie;
- odstępstwa, założenia, ryzyka i dług techniczny;
- ADR i dokumenty zaktualizowane;
- propozycję kolejnego kroku bez jego implementowania.

Po utworzeniu PR i zakończeniu live testu zatrzymaj się. Nie scalaj PR i nie rozpoczynaj kolejnego etapu.
