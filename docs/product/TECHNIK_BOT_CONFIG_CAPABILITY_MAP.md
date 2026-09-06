# Mapa możliwości — Konfigurator Technika (bot)

- **Status:** research / capability map (bez pełnej przebudowy UI)
- **Branch:** `preview/destiled-web`
- **Data:** 2026-09-06
- **Cel:** kompletny katalog tego, co Discord bot + app już mają **albo** mają w docs, żeby UI Technika dało się zaprojektować end-to-end (D-060).
- **Źródła:** `docs/DECISION_LOG.md` (D-023, D-029, D-038–D-041, D-058–D-060), `docs/product/*`, `docs/architecture/CENTRUM_AKTYWNOSCI.md`, `docs/ux/*`, `apps/discord-gateway/**`, `services/activity-service/**`, `apps/admin` (`bot-config-page`, diagnostics).

---

## 1. Zasady (D-060, sekrety poza zakresem)

### D-060 — Konfigurator Technika

- UI **musi** opierać się o **schemat możliwości backendu** (`GET /discord/v1/capabilities`), nie o hardcodowane „fałszywe” przełączniki.
- Cykl obowiązkowy: **draft → validate → preview → apply → audit → rollback**.
- Bot / gateway **potwierdza aktywną rewizję**; apply zmienia realną, wersjonowaną konfigurację.
- **Zabronione:** dekoracyjne toggle’e bez efektu runtime (ryzyko naruszenia D-060 — patrz luki poniżej).

### Granica bezpieczeństwa (WEB_ACCESS / Owner-only)

Technika **nie** konfiguruje i **nie** widzi w formularzach:

| Poza zakresem Technika | Gdzie żyje dziś |
| --- | --- |
| Token bota Discord | env `DISCORD_TOKEN` |
| OAuth / Identity secrets | Identity / env |
| Allowlista właściciela (Discord User ID) | Owner-only |
| Mapowanie ról → Owner / identity właściciela | Owner-only |
| Signing keys (`DISCORD_COMPONENT_SIGNING_SECRET`, JWT) | env |
| `DISCORD_NOTIFY_SHARED_SECRET`, `DISCORD_TECHNIKA_SHARED_SECRET` | env (S2S) |
| Database URLs, Zeabur secrets, private keys | infra |
| Operatory testowi (`DISCORD_OPERATOR_*`) | env |

Walidacja draftu gateway odrzuca klucze zawierające m.in. `token`, `secret`, `password`, `pem`, `allowlist`, `operator`, `oauth`, `database`, `privateKey` (`bot-config.schema.ts`).

### Role (skrót)

| Rola | Zakres względem konfiguratora |
| --- | --- |
| **Technika** | Bezpieczna konfiguracja funkcjonalna bota + diagnostyka health |
| **Lider+** | Operacje guild / dane graczy; **nie** jest tożsama z Technika (D-041: szczegółowa analityka Discord) |
| **Owner** | Allowlista, mapowanie Owner, sekrety, governance |

### Status implementacji kontraktu D-060 (stan brancha)

| Element | Stan |
| --- | --- |
| OpenAPI `apps/discord-gateway/openapi/technika-bot-config-v1.yaml` | **Live** (capabilities + draft/validate/preview/apply/rollback) |
| Controllers `TechnikaCapabilitiesController`, `TechnikaConfigController` | **Live** |
| `VersionedConfigStore` (plik `technika-bot-config.json`) | **Live** |
| Admin UI `/bot` | **Częściowy** — lokalny draft + READ activity; **niesłusznie** oznacza apply jako „pending” |
| Egzekucja flag w runtime (`notify`, `/panel-test`, schedulery) | **Gap** — store istnieje, ale notify/panel **nie czytają** aktywnej konfiguracji |
| Audyt apply gateway | **Gap** (brak endpointu audytu Technika na gateway) |

---

## 2. Obszary możliwości (katalog)

Legenda statusu:

- **live-api** — endpoint / zachowanie w kodzie
- **planned-docs** — produkt/architektura/UX, nie pełna egzekucja Technika
- **gap** — brak API, brak wiring, albo niespójność Admin ↔ Gateway
- **forbidden** — świadomie wykluczone

Kolumna **Technika vs Owner:** kto powinien mieć UI (mutacje).

---

### 2.1 Posty Discord (utwórz / edytuj / usuń)

| Aspekt | Status | Suggested keys / API | Technika vs Owner |
| --- | --- | --- | --- |
| Lab: publikacja panelu testowego `/panel-test` | **live-api** | capability `panel-test-enabled` (schema); komenda guild-only | Technika (toggle); operatory/Manage Guild w Discord |
| Lab: odśwież panel (edit in-place) | **live-api** | action `refresh` | j.w. |
| Lab: usuń panel (confirm) | **live-api** | `delete_ask` / `delete_confirm` | j.w. |
| Produkcyjny post wydarzenia (create/edit in-place) | **planned-docs** (+ częściowe API projekcji activity) | SoT: activity-service; Discord: gateway projekcje | Technika: retencja / kanały; treść wizualna: Owner sign-off |
| Repair usuniętego posta | **live-api** (activity-admin projections repair) + **planned-docs** UX | `POST .../projections/:activityId/repair` | Technika / Lider ops (nie Owner secrets) |
| Automatyczne usuwanie posta po finish | **planned-docs** + **live-api** config field | `postRetentionHoursAfterFinish` (guild config) | Technika |

**Uwaga D-023 / UX:** jeden spójny panel Components V2; **zakaz** reakcji jako nawigacji; edit tego samego posta zamiast spamu.

---

### 2.2 Posty / wydarzenia cykliczne (recurring)

| Aspekt | Status | Suggested keys / API | Technika vs Owner |
| --- | --- | --- | --- |
| Serie: daily / weekly / dni tygodnia | **planned-docs** (P4.6) + domain `series.ts` | permission `event.create.recurring`; horizon max 90 dni | Technika: limity horyzontu guild; uprawnienia: Authz/Owner mapowanie ról |
| Edycja/anulowanie zakresu serii | **planned-docs** | `this` / `this_and_following` / `entire_series` | nie Owner-only |
| UI Technika pod „recurring posts” jako osobny bot module | **gap** | brak w `BOT_CAPABILITIES` | — |

---

### 2.3 Wygląd / szablony / embedy

| Aspekt | Status | Suggested keys | Technika vs Owner |
| --- | --- | --- | --- |
| Components V2 (Container, Text, Separator, Action Row) — standard | **planned-docs** + lab **live-api** | — (standard UX, nie toggle) | Owner: visual identity; Technika: treści szablonów PL |
| Kolory / banner lab (`panel-theme.ts`) | **live-api** (hardcoded) | przyszłe: `appearance.accentColor`, `appearance.bannerAssetId` | Owner sign-off assetów; Technika może wybierać z katalogu zatwierdzonego |
| Szablon DM timerów | **live-api** schema | `timersNotify.messageTemplate` | Technika |
| Szablon Wojny Królestw | **live-api** schema | `kingdomWar.messageTemplate` | Technika |
| Klasyczne embeds jako główny UX | **forbidden** (produkcyjnie Components V2; status ephemeral może używać Embed) | — | — |
| Copy paneli Centrum (nazwy przycisków) | **planned-docs** `OWNER_DECISION_REQUIRED` | — | Owner |

---

### 2.4 Przyciski / komponenty

| Aspekt | Status | Suggested keys | Technika vs Owner |
| --- | --- | --- | --- |
| Lab: select + Odśwież + Usuń + modal | **live-api** | powiązane z `panel-test-enabled` | Technika |
| Centrum panel: Utwórz / Szukam / Moje / Powiadomienia | **planned-docs** (`CENTRUM_AKTYWNOSCI_DISCORD.md`) | hub publish/reconcile (admin API) | Technika ops panelu |
| Event post: RSVP buttons, Więcej, Zgłoś | **planned-docs** | statusy/powody z guild catalogs | Technika (katalogi); nie Owner |
| DM Timers: przyciski Zbite/Done | **planned-docs** + flag schema | `notify-timer-dm-action-buttons` (default `false`) | Technika |
| D-058 progression: Done / Snooze / Cannot do | **planned-docs** | przyszły moduł `progressionNotify` | Technika (szablony/włączanie); sekrety dostawy: Owner/infra |

---

### 2.5 Reakcje (emoji)

| Aspekt | Status | Suggested keys | Technika vs Owner |
| --- | --- | --- | --- |
| Reakcje jako nawigacja / RSVP / role | **forbidden** (D-023, `DISCORD_POST_INTERACTION_STANDARD`) | brak — nie wystawiać w UI | — |
| Opcjonalne reakcje dekoracyjne | nie rekomendowane | — | — |

UI Technika: sekcja „Reakcje” tylko jako **jawny komunikat „wyłączone produktowo”**, bez toggle’a „włącz reakcje RSVP”.

---

### 2.6 Zbieranie danych kanałów / metadanych Discord

| Aspekt | Status | API / keys | Technika vs Owner |
| --- | --- | --- | --- |
| Dozwolone kanały publikacji | **live-api** | `GET/PUT .../admin/guilds/:guildId/channels`; config `allowedPublishChannelIds` | Technika |
| Hub channel + publish intent | **live-api** | `hub`, `hub/publish-intent`, `hub/publish`, `hub/reconcile` | Technika |
| Hub modules / legacy channels | **live-api** | `hub/modules`, `hub/legacy-channels` | Technika |
| Discord channel/role metadata pickers | **live-api** | `discord/channels`, `discord/roles` | Technika (READ) |
| Resolve member display names | **live-api** | `discord/members/resolve` | Technika / Lider |
| Arbitrary channel scrapers / message harvesting | **gap / out of scope** | — | Owner-only jeśli kiedykolwiek |

---

### 2.7 Timers → Discord notify

| Aspekt | Status | Suggested keys | Technika vs Owner |
| --- | --- | --- | --- |
| S2S `POST /notify/timer` (DM lub kanał testowy) | **live-api** | auth: `x-notify-secret` (**nie** w UI) | Technika: enable/template; secret: Owner/infra |
| Doc MVP `TIMERS_DISCORD_NOTIFY.md` | **live-api** | web `POST /api/discord-notify` | — |
| Capability: wyłączenie całego endpointu | **live-api** schema / **gap** runtime | `notify-timer-enabled` | Technika |
| Moduł auto/reminder | **live-api** schema / **gap** scheduler | `timersNotify.enabled`, `reminderMinutesBefore`, `resetNotifyEnabled`, `messageTemplate` | Technika |
| Placeholdery (gateway schema) | dokumentowane | `{{title}}`, `{{body}}`, `{{otherTimersSummary}}`, `{{mapKey}}`, `{{deepLinkUrl}}` | Technika |
| Admin UI draft | **live** lokalnie | używa **innych** nazw: `timersDiscordNotify.*` + `{{minutes}}`/`{{deepLink}}` | **gap** sync nazw z gateway |

---

### 2.8 Wojna Królestw (PW) notify

| Aspekt | Status | Suggested keys | Technika vs Owner |
| --- | --- | --- | --- |
| Schema + OpenAPI `kingdomWar` | **live-api** (kontrakt) | `enabled`, `warAt` (HH:mm Europe/Warsaw), `notifyMinutesBefore`, `messageTemplate` | Technika |
| Scheduler ping przed `warAt` | **gap** (brak implementacji w gateway src) | ten sam obiekt | Technika |
| Admin UI draft | **live** lokalnie | nazwy `kingdomWarPw.*` (mismatch) | **gap** naming |

Domyślnie: wojna `18:00`, notify `30` min → `17:30` Warsaw.

---

### 2.9 Centrum Aktywności — katalogi i guild config

Wszystkie poniżej: **live-api** w `activity-service` (`/activity/v1/admin/...`); Admin UI dziś głównie **READ** (gdy `VITE_ACTIVITY_ADMIN_*`).

| Obszar | Status | Klucze / ścieżki | Technika vs Owner |
| --- | --- | --- | --- |
| Guild config bundle | live-api | `GET/PUT .../config` — m.in. `organizerDefaultStatusId`, `waitlistPromotionStatusId`, `maxActivePerCreator`, `registrationDefaultClosesAtStart`, `allowOtherActivity`, `maxCreateHorizonDays`, `postRetentionHoursAfterFinish`, `reminders[]`, `dmNotificationsEnabled`, `allowedPublishChannelIds`, `pingRoleIds`, `hubChannelId` | Technika |
| Readiness | live-api | `GET .../readiness` | Technika |
| Rodzaje aktywności | live-api CRUD | `.../types` | Technika |
| Statusy RSVP (+ `occupiesSlot`, `behavior`) | live-api CRUD | `.../statuses` | Technika |
| Pola uczestnika | live-api CRUD | `.../participant-fields` (`character|class|role|text|select|number`) | Technika |
| Kanały publikacji | live-api | `.../channels` | Technika |
| Pingi (role) | live-api | `.../ping-roles` (zakaz `@everyone`/`@here`) | Technika |
| Limity / Inna aktywność / reminders / retencja | live-api (w config) | j.w. | Technika |
| Powody zgłoszeń | live-api CRUD | `.../report-reasons` | Technika |
| Panele hub (SoT + publish) | live-api | `.../hub*`, `/activity/v1/panels` | Technika |
| Events ops (cancel/takeover) | live-api | `.../events` | Lider/mod + Technika diagnostyka |
| Reports moderate | live-api | `.../reports` | Lider/mod |
| Audit | live-api | `GET .../audit` | Technika (podgląd) |
| LFG composition templates | live-api | `.../organizations/:orgId/lfg/composition-templates` | Technika / Lider |
| Diagnostics deps/outbox | live-api | `admin/diagnostics/*` | Technika |

**Permission keys (arch):** `permission.activity.config.manage`, `permission.activity.panel.manage`, itd. — egzekucja Authz, nie sekrety Owner.

---

### 2.10 Health / diagnostyka

| Aspekt | Status | API | Technika vs Owner |
| --- | --- | --- | --- |
| `GET /health/live` | live-api | public | Technika |
| `GET /health/ready` | live-api | public | Technika |
| `GET /health/discord` | live-api | state, ping, isolation, panelRenderer | Technika |
| Admin `/diagnostics` | live UI | fetche health gateway | Technika |
| Admin `/` status | live UI | — | Technika |
| `/status` slash (ephemeral) | live-api | lab | Technika / operatorzy |

---

### 2.11 Placeholdery / przyszłość (nie pełny UI teraz)

| Temat | Status | Notatka |
| --- | --- | --- |
| D-041 szczegółowa analityka Discord | planned-docs | Lider+, nie Technika-config |
| D-058 progression DM buttons | planned-docs | osobny moduł capability później |
| D-059 boss/metin timers na mapach | osobna domena | nie mieszać z character timers |
| Multi-Discord publish lists | planned-docs | Admin UX poza P4.4 |
| Temporary voice channels | odroczone | docs Centrum |
| Channel message collectors / reaction collectors | gap / forbidden default | nie projektować jako Technika MVP |
| Visual asset catalog (bannery, emoji set) | OWNER_DECISION_REQUIRED | Owner |

---

## 3. Istniejący katalog capability gateway (`BOT_CAPABILITIES`)

Źródło prawdy kontraktu: `apps/discord-gateway/src/application/technika/capabilities.ts`.

| id | Typ | Default | Read-only | Uwagi |
| --- | --- | --- | --- | --- |
| `panel-test-enabled` | boolean | `true` | nie | Lab panel; **nie podpięty** do InteractionRouter |
| `notify-timer-enabled` | boolean | `true` | nie | Ma blokować `POST /notify/timer`; **nie podpięty** |
| `timersNotify` | object | `enabled:false`, template, `reminderMinutesBefore:60`, `resetNotifyEnabled:true` | nie | Brak schedulera auto-DM |
| `kingdomWar` | object | `enabled:false`, `warAt:"18:00"`, `notifyMinutesBefore:30`, template | nie | Brak schedulera |
| `notify-timer-dm-action-buttons` | boolean | `false` | nie | Produkt Components V2 w DM |
| `strict-guild-isolation` | boolean | env | **tak** | Tylko podgląd `DISCORD_STRICT_GUILD_ISOLATION` |

---

## 4. Proponowana IA Technika (nawigacja / sekcje)

Cel: spójna przebudowa UI (Admin dziś: Status | Konfiguracja bota | Diagnostyka). Preferowane sekcje PL:

1. **Przegląd / rewizja** — aktywna revision, hasDraft, canRollback, last updated, health badge, CTA cyklu D-060  
2. **Powiadomienia Timery** — `notify-timer-enabled` + `timersNotify.*` + flaga DM buttons  
3. **Wojna Królestw (PW)** — `kingdomWar.*` + wyliczone `notifyAt` Warsaw  
4. **Panele Discord** — lab toggle; hub channel; publish/reconcile; modules/legacy (ops)  
5. **Centrum — katalogi** — typy, statusy RSVP, pola, powody  
6. **Centrum — kanały i pingi** — channels, ping roles, metadata pickers  
7. **Centrum — limity i retencja** — maxActive, horizon, other activity, reminders, post retention, DM notifications  
8. **Wygląd i szablony** — message templates + (później) appearance z katalogu Owner  
9. **Diagnostyka** — health live/ready/discord; activity diagnostics; readiness guild  
10. **Audyt i rollback** — activity audit + (do dodania) audit apply gateway  
11. **Poza zakresem (Owner)** — stały panel informacyjny: sekrety / allowlista / tokeny — bez formularzy  

**Stepper D-060** powinien być globalny dla draftu Technika (nie tylko notatek tekstowych).

---

## 5. Luki OpenAPI / kontraktu „New Bot” (Technika)

### Już jest (Admin może się podłączyć)

- `GET /discord/v1/capabilities`
- `GET /discord/v1/config` (active + revision + `strictGuildIsolation`)
- `PUT /discord/v1/config/draft`
- `POST /discord/v1/config/validate`
- `POST /discord/v1/config/preview`
- `POST /discord/v1/config/apply`
- `POST /discord/v1/config/rollback`
- Auth mutacji: `x-technika-secret` ↔ `DISCORD_TECHNIKA_SHARED_SECRET`

### Oczekiwane w Admin, a brak / inne

| Oczekiwanie Admin (`activity-admin-config.ts`) | Rzeczywistość gateway | Akcja |
| --- | --- | --- |
| `PUT /discord/v1/config` | jest `PUT .../config/draft` | zaktualizować Admin lub dodać alias |
| `GET /discord/v1/config/active-revision` | revision w `GET /config` | dodać cienki endpoint **lub** zmienić UI |
| Audyt apply | brak | `GET /discord/v1/config/audit` (plan) |
| Klucze `timersDiscordNotify` / `kingdomWarPw` | `timersNotify` / `kingdomWar` | **ujednolicić** na gateway names |
| Placeholdery Admin `{{minutes}}`/`{{deepLink}}` | `{{title}}`/`{{body}}`/`{{deepLinkUrl}}`/… | ujednolicić dokumentację + walidację |
| Apply „pending” w UI | apply **już live** | odblokować UI za sekretem S2S (server-side proxy), bez trzymania secretu w przeglądarce na stałe jeśli da się uniknąć |

### Luki produktowe poza YAML Technika

- Brak capability entries dla: appearance, hub panel copy, activity catalog (te są w activity OpenAPI — osobny kontrakt).
- Brak egzekucji runtime flag (D-060).
- Brak schedulera `kingdomWar` / auto `timersNotify`.
- Activity admin **mutations** nie są w Technika UI (tylko READ) — do zaprojektowania jako kolejny krok (Authz assertion, nie shared secret przeglądarki).
- OpenAPI activity: panele, config, admin CRUD — **live**; nie mylić z „New Bot pending”.

### Activity OpenAPI — ścieżki istotne dla redesignu

Patrz `services/activity-service/openapi/activity-v1.yaml`:  
`/activity/v1/admin/guilds/{guildId}/config|types|statuses|participant-fields|report-reasons|channels|ping-roles|hub*|discord/*|audit|readiness|projections|reports|events` oraz `/activity/v1/panels`.

---

## 6. Mapowanie Admin UI dziś → docelowy katalog

| `CAPABILITY_AREAS` w `bot-config-page.tsx` | Backend dziś | Docelowo |
| --- | --- | --- |
| timers-discord-notify | local draft + gateway schema | podłączyć draft/apply gateway (`timersNotify`) |
| kingdom-war-pw | local draft + gateway schema | podłączyć `kingdomWar` + scheduler |
| activity-types … report-reasons | activity READ | READ+WRITE przez assertion / BFF |
| discord-panels | oznaczone api-pending | hub publish + lab `panel-test-enabled` (nie „pending”) |
| — | — | dodać sekcje: health, audit, appearance/templates, forbidden-reactions note |

---

## 7. Komendy Discord (stan lab)

| Komenda | Opis | Gate |
| --- | --- | --- |
| `/status` | Ephemeral status harness | guild test only |
| `/panel-test` | Publikuje panel Components V2 | operatorzy / Manage Guild; powinien honorować `panel-test-enabled` |

Rejestracja: **guild-only** (zakaz global commands) — ADR-0007 / D-029.

---

## 8. Checklist dla redesignu UI (bez implementacji w tym tasku)

1. Przełączyć źródło prawdy formularza na `GET /capabilities` + `GET /config`.  
2. Ujednolicić nazwy kluczy z OpenAPI gateway.  
3. Włączyć prawdziwy cykl draft/validate/preview/apply/rollback (proxy server-side).  
4. Rozdzielić IA: Notify | Centrum catalogs | Panele | Diagnostyka | Owner-out-of-scope.  
5. Oznaczyć jasno: **schema-only vs runtime-enforced** (do czasu wiring).  
6. Nie projektować UI reakcji RSVP / secretów / allowlisty.  
7. Zaplanować osobny epic: egzekucja flag + schedulers (warunek D-060).

---

## 9. Indeks plików źródłowych

| Obszar | Ścieżka |
| --- | --- |
| Capabilities | `apps/discord-gateway/src/application/technika/capabilities.ts` |
| Schema / forbidden keys | `apps/discord-gateway/src/application/technika/bot-config.schema.ts` |
| Store | `apps/discord-gateway/src/application/technika/versioned-config-store.ts` |
| OpenAPI Technika | `apps/discord-gateway/openapi/technika-bot-config-v1.yaml` |
| Notify | `apps/discord-gateway/src/interface/http/notify.controller.ts` |
| Panel lab | `apps/discord-gateway/src/presentation/discord/panel-renderer.ts` |
| Admin bot UI | `apps/admin/src/bot-config-page.tsx` |
| Admin activity client | `apps/admin/src/activity-admin-config.ts` |
| Activity admin API | `services/activity-service/src/interface/activity-admin.controller.ts` |
| Activity OpenAPI | `services/activity-service/openapi/activity-v1.yaml` |
| Timers notify doc | `docs/product/TIMERS_DISCORD_NOTIFY.md` |
| Role model | `docs/product/WEB_ACCESS_AND_ROLE_MODEL.md` |
| Centrum product | `docs/product/CENTRUM_AKTYWNOSCI.md` |
| Discord UX | `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`, `docs/ux/DISCORD_POST_INTERACTION_STANDARD.md` |

