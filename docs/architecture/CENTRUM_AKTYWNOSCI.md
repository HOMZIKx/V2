# Centrum Aktywności — architektura i etapy (P4)

## Status

`SPEC — product OWNER_ACCEPTED; technical boundary ADR-0014 still Proposed`

P3 Authorization jest scalone (`main` @ `1f23635`, PR #16). Implementacja
kodu zabroniona do końcowego audytu tej specyfikacji + `APPROVED` /
`READY_FOR_CURSOR` brief. Ten dokument jest implementacyjną specyfikacją
granic i etapów — **bez** kodu.

Produkt: [CENTRUM_AKTYWNOSCI.md](../product/CENTRUM_AKTYWNOSCI.md).
Handoff: [P4_CENTRUM_AKTYWNOSCI_HANDOFF.md](../ai/P4_CENTRUM_AKTYWNOSCI_HANDOFF.md).
Śledzenie: [P4_TEST_TRACEABILITY.md](../ai/P4_TEST_TRACEABILITY.md).

## 1. Problem

Po Identity (P2) i Authorization (P3) potrzebny jest pierwszy pion produktowy
z jasnym właścicielem danych aktywności, bez logiki w `discord-gateway` i bez
równoległego systemu ról obok P3.

## 2. Granice usług (Proposed technicznie)

```text
Discord / WWW / Admin (adapters)
        │
        ▼
discord-gateway / web / admin
        │ authorize (P3)          │ activity commands
        ▼                         ▼
authorization-service      community-service (robocza nazwa)
        │                         │
   DB authorization          DB community (osobna)
```

| Usługa                         | Rola                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `discord-gateway`              | Adapter Discord: panel, formularz, interakcje, projekcje postów; **bez** reguł biznesowych aktywności |
| `web`                          | Adapter WWW (od P4.4): lista, szczegóły, RSVP, Moje aktywności, skrzynka                              |
| `admin`                        | Adapter Admin (od P4.3): konfiguracja katalogów i limitów P4                                          |
| `authorization-service`        | **Jedyny** SoT allow/deny permission IDs                                                              |
| `identity-service`             | WWW session / Internal JWT; poza krytyczną ścieżką Discord activity (P3-D3)                           |
| `community-service` (Proposed) | SoT wydarzeń, RSVP, limity, historia, projekcje, audyt aktywności                                     |

Identity i Authorization **nie** przechowują agregatów aktywności.
Community **nie** czyta baz Identity/Authorization.

Formalna nazwa usługi/bazy = `OWNER_DECISION_REQUIRED` / ADR-0014 Proposed
(rekomendacja techniczna: `community-service` + DB `community`).

## 3. Agregaty domenowe (P4.1)

Szkic encji (nazwy techniczne robocze):

| Agregat                       | Odpowiedzialność                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `ActivityType` / game catalog | Rodzaje, powiązanie z grą per guild, flaga „Inna aktywność”                               |
| `ParticipationStatusDef`      | Statusy RSVP + flaga occupiesSlot + przypisanie do typu / default guild                   |
| `ParticipantFieldCatalog`     | Pola dodatkowe (postać, klasa, rola, tekst)                                               |
| `GuildActivitySettings`       | Kanały publikacji, ping roles, limity, retention posta, default reminders, report reasons |
| `Activity` (event)            | Jednorazowe lub wystąpienie serii; lifecycle; limity; kanały; organizatorzy               |
| `ActivitySeries`              | Cykl, horyzont ≤90 dni, tryb zapisu                                                       |
| `Participation`               | Status, kolejka rezerwowa, pola odpowiedzi, wyciszenia                                    |
| `ActivityProjection`          | Discord messageId / channelId per guild (projekcja)                                       |
| `NotificationInboxItem`       | Skrzynka panelu (wspólna z WWW)                                                           |
| `ActivityAuditEntry`          | Audyt mutacji / moderacji / incydentów projekcji                                          |
| `AttendanceRecord`            | Obecność po zakończeniu                                                                   |

Idempotency: każda mutacja z correlation / interaction key (jak P3).
Explainable authorize przed mutacją.

## 4. Cykl życia `Activity` (stany robocze)

```text
draft_form (24h) → published → registrations_open
        → registrations_closed → in_progress → completed
                                      ↘ cancelled
published (no participants, before start) → deleted (trwałe)
```

Przejścia zgodne z produktem (§6–7 product spec). Auto-complete po 2h gdy brak end.

## 5. Permission mapping (P3)

Finalne stringi ID = **`OWNER_DECISION_REQUIRED`**. Skrót poniżej; **pełny katalog**
propozycji = §13. Nie dodawać do kodu Authz bez Accepted.

| Akcja produktowa                     | Proponowany permission ID (TECH)                                     | Scope typowy |
| ------------------------------------ | -------------------------------------------------------------------- | ------------ |
| Utwórz jednorazowe                   | `permission.activity.event.create`                                   | guild        |
| Utwórz cykliczne                     | `permission.activity.event.create.recurring`                         | guild/org    |
| Publikuj na wielu Discordach         | `permission.activity.event.publish.multi_guild`                      | organization |
| Zarządzaj własnym / jako organizator | `permission.activity.event.manage.self`                              | guild        |
| Moderuj wydarzenia na serwerze       | `permission.activity.event.moderate.guild`                           | guild        |
| Konfiguruj katalogi Admin P4         | `permission.activity.admin.configure`                                | guild/org    |
| Publikuj / odśwież panel Centrum     | `permission.activity.panel.publish`                                  | guild        |
| Dołącz / zmień RSVP                  | membership + brak deny; opcjonalnie `permission.activity.event.join` | guild        |

Współorganizator: uprawnienie operacyjne wynikające z przypisania w agregacie
**oraz** authorize manage.self / równoważne — bez osobnego RBAC w community.
Zwykły create bez WWW login (P3-D3).

## 6. Kontrakty (szkic OpenAPI / events)

Synchroniczne (v1 rekomendacja techniczna — P4-D5 nadal TECHNICAL_OPEN):

| Kierunek                       | Operacje                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Gateway/Web/Admin → Community  | create, update, cancel, rsvp, waitlist advance, list, get, my-activities, admin config CRUD, report, attendance |
| Adapter → Authorization        | `authorize` / `explain` przed mutacją                                                                           |
| Community → Identity (system)  | opcjonalnie później; nie na Discord RSVP path                                                                   |
| Community → Gateway (callback) | odtworzenie projekcji / sync — lub Gateway pull; TECHNICAL_OPEN                                                 |

Zdarzenia wersjonowane (porty; implementacja brokera nie wymagana w P4.1):
`community.activity.created.v1`, `….rsvp_changed.v1`, `….cancelled.v1`,
`….started.v1`, `….completed.v1`, `….projection_repaired.v1`.

## 7. Etapy wdrożenia (audytowalne)

### P4.1 — Domain, model danych i kontrakty

|                  |                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| **Cel**          | Agregaty, cykl życia, permission keys (Accepted IDs), OpenAPI szkic, idempotency, audyt, testy domenowe |
| **Zakres**       | `community-service` skeleton + migracje schematu; bez UI Discord/WWW/Admin                              |
| **Out of scope** | Panel, formularze, Admin UI, WWW, multi-discord runtime, serie                                          |
| **Zależności**   | P3 merged; ADR-0014 Accepted lub jawny wyjątek właściciela                                              |
| **Migracje**     | DB community: tabele agregatów                                                                          |
| **Kontrakty**    | OpenAPI draft mutacji/zapytań                                                                           |
| **Testy**        | Unit domain lifecycle, limit 4, 14 dni, waitlist ordering, auto-end 2h                                  |
| **Rollback**     | Drop schema / revert migration; brak UI                                                                 |
| **AC**           | Domain invariants green; authorize hooks defined; no Nest in domain                                     |
| **Marker**       | `READY_FOR_AUDIT_P4_1_DOMAIN`                                                                           |

### P4.2 — Jednorazowe wydarzenia Discord

|                  |                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Cel**          | Panel + prywatny formularz + publikacja + RSVP + limity + rezerwa + edycja + anulowanie + Moje aktywności + odporność postów   |
| **Zakres**       | discord-gateway adapter; projekcje; szkic 24h; podgląd; Szukam ekipy; **Components V2** wg UX contract                         |
| **Out of scope** | Serie; multi-discord wspólne listy; WWW create; tymczasowe VC; final assets bez Issue #12                                      |
| **Zależności**   | P4.1; kontrakt [CENTRUM_AKTYWNOSCI_DISCORD.md](../ux/CENTRUM_AKTYWNOSCI_DISCORD.md); Issue #12 tylko dla widocznych assetów    |
| **Testy**        | Payload snapshots V2; custom_id; RSVP/waitlist; „Więcej”+P3; in-place edit; no status spam; post repair                        |
| **Rollback**     | Feature flag sync off; panele lab                                                                                              |
| **AC**           | Live guild: create→rsvp→limit→cancel; Section accessory panel; update in-place; states loading/empty/error/unavailable/confirm |
| **Marker**       | `READY_FOR_AUDIT_P4_2_DISCORD_EVENTS`                                                                                          |

### P4.3 — Podstawowy Admin

|                  |                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Cel**          | Konfiguracja rodzajów, statusów (+ occupiesSlot), pól, kanałów, pingów, limitów, Inna aktywność, reminders, retention, powody zgłoszeń |
| **Out of scope** | Pełny Admin platformy                                                                                                                  |
| **Zależności**   | P4.1; UI Admin minimalny                                                                                                               |
| **AC**           | Zmiana config wpływa na create/RSVP bez deploy kodu reguł                                                                              |
| **Marker**       | `READY_FOR_AUDIT_P4_3_ADMIN`                                                                                                           |

### P4.4 — Pierwszy zakres WWW

|                  |                                                                 |
| ---------------- | --------------------------------------------------------------- |
| **Cel**          | Lista, szczegóły, RSVP, Moje aktywności, powiadomienia panelowe |
| **Out of scope** | Tworzenie na WWW; Desktop                                       |
| **Zależności**   | P4.1–P4.2; Identity session + Authz login entitlement dla WWW   |
| **AC**           | Te same wyniki RSVP/limit co Discord dla tego samego user link  |
| **Marker**       | `READY_FOR_AUDIT_P4_4_WWW`                                      |

### P4.5 — Multi-Discord i odporność operacyjna

|                |                                                                               |
| -------------- | ----------------------------------------------------------------------------- |
| **Cel**        | Wspólne/osobne listy; sync projekcji; naprawa postów; usunięte kanały; awarie |
| **Zależności** | P4.2; permission multi_guild                                                  |
| **AC**         | Shared cap egzekwowany; repair po delete wiadomości; reassign channel         |
| **Marker**     | `READY_FOR_AUDIT_P4_5_MULTI_RESILIENCE`                                       |

### P4.6 — Rozszerzenia

|                |                                                                                      |
| -------------- | ------------------------------------------------------------------------------------ |
| **Cel**        | Serie cykliczne; prywatne wydarzenia; obecność; statystyki; rozszerzone raportowanie |
| **Zależności** | P4.2–P4.5; permission recurring                                                      |
| **AC**         | Serie 90 dni; attendance 24h; privacy rules; create-similar = one-shot               |
| **Marker**     | `READY_FOR_AUDIT_P4_6_EXTENSIONS`                                                    |

## 8. Sprzeczności usunięte względem starego planu

| Było                                   | Jest                                           |
| -------------------------------------- | ---------------------------------------------- |
| Discord only v1 (rekomendacja P4-D4 A) | Discord + Admin P4.3 + WWW P4.4 (bez create)   |
| Kreator krok po kroku                  | Jeden większy prywatny formularz               |
| Sztywne statusy Będę/…                 | Statusy konfigurowalne + wymagane odpowiedniki |
| Brak multi-Discord                     | Multi dla uprawnionych; zwykły = 1 Discord     |
| Hub + jeden typ jako jedyny v1         | Etapy P4.1–P4.6; rodzaje admin-config          |

## 9. Poza zakresem architektury P4 (świadomie)

Desktop Companion; Zeabur; temporary voice channels; pełny Admin platformy;
Streams/Outbox dopóki TECHNICAL_OPEN nie zostanie Accepted; effective-access cache;
kopiowanie architektury starego monorepo.

## 10. Ryzyka

| Ryzyko                  | Mitygacja                                   |
| ----------------------- | ------------------------------------------- |
| Assety UI               | Issue #12 blokuje widoczny Discord slice    |
| Scope creep P4.6 w P4.2 | Twarde out-of-scope per etap                |
| Duplikacja RBAC         | Zakaz lokalnych ról community; tylko P3 IDs |
| Transport / panel ops   | P4-D5 / P4-D6 poniżej — rekomendacje TECH   |

## 11. P4-D5 — Transport (analiza repo + rekomendacja)

**Status:** `TECHNICAL_RECOMMENDATION_READY_FOR_AUDIT` /
`PROPOSED — READY_FOR_CHATGPT_AUDIT`  
**Nie jest** decyzją właściciela. Owner status pozostaje `TECHNICAL_OPEN`
dopóki ChatGPT/właściciel nie zaakceptuje.

### 11.1 Stan repozytorium (fakty)

| Element                   | Stan w repo                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP S2S                  | Gateway→Authz: `HttpAuthorizationSyncClient` (`fetch` + client assertion)                                                                     |
| Internal JWT / assertions | `@v2/internal-jwt`; Identity issue/JWKS; Authz inbound assertion guard                                                                        |
| Idempotency / correlation | Authz store: `correlation_id`, reconcile idempotency, revoke queue                                                                            |
| Lease / worker            | Authz maintenance worker: `lease_owner` / `lease_expires_at` + retry                                                                          |
| PostgreSQL                | Compose + init: bazy `identity`, `authorization` (osobne role)                                                                                |
| Redis                     | Compose; opaque sessions Identity                                                                                                             |
| RabbitMQ                  | Compose `rabbitmq:3.13.7-management` + conf; **brak** konsumenta/producenta w kodzie aplikacji; **brak** `amqplib` w zależnościach pnpm usług |
| Outbox table              | Brak w Identity/Authz jako ogólnego wzorca produktowego (revoke queue ≈ wąski outbox)                                                         |
| NON_NEGOTIABLES           | RMQ + transactional outbox **obowiązkowe dla krytycznych procesów** — nie wymusza RMQ od dnia 1 każdego slice                                 |

### 11.2 Porównanie wariantów

| Kryterium                      | 1. Sync HTTP bez outbox       | 2. Sync HTTP + PG transactional outbox | 3. PG outbox + niezależny worker | 4. RabbitMQ od P4.1          | 5. HTTP/outbox najpierw, RMQ później |
| ------------------------------ | ----------------------------- | -------------------------------------- | -------------------------------- | ---------------------------- | ------------------------------------ |
| Niezawodność projekcji Discord | Niska przy crash po commit    | Wysoka (to samo TX)                    | Wysoka                           | Wysoka po brokerze           | Wysoka; broker później               |
| Spójność SoT                   | SoT OK; projekcja best-effort | SoT+intent atomowe                     | j.w.                             | SoT+event                    | j.w.                                 |
| Retry                          | Ad-hoc w caller               | Worker/poller                          | Dedykowany worker                | Consumer + DLQ               | Najpierw poller; potem consumer      |
| Idempotency                    | Wymagane na API               | Klucz outbox + API                     | j.w.                             | message-id + API             | j.w.                                 |
| Kolejność                      | Per-request                   | Per-aggregate FIFO w outbox            | j.w.                             | Per-queue; wymaga designu    | Outbox FIFO → później RMQ keys       |
| Awaria Discord API             | Caller blokuje / gubi         | Intent zostaje; retry                  | j.w.                             | j.w. + DLQ                   | j.w.                                 |
| Awaria procesu                 | Utrata in-flight              | Intent trwały                          | j.w.                             | Broker + durable             | Intent trwały                        |
| Koszt ops                      | Najniższy                     | Niski                                  | Średni                           | Wysoki (topologia, DLQ, obs) | Średni narastająco                   |
| Dev lokalny                    | Prosty                        | + tabela/poller                        | + proces worker                  | + RMQ health, bindingi       | Compose już ma RMQ; kod później      |
| P4.1–P4.6                      | P4.1 OK; P4.2 ryzykowne       | P4.1–2 dobre                           | P4.2+ dobre                      | P4.1 przeciążone             | Najlepsze dopasowanie etapów         |
| Migracja później               | Trudna (brak intent)          | Naturalna → RMQ publisher              | Naturalna                        | —                            | Zaplanowana                          |

### 11.3 Rekomendacja techniczna (jedna)

**Wariant 5:** synchroniczne HTTP + idempotency (+ client assertion / Internal JWT)
dla mutacji P4.1–P4.2 **oraz** PostgreSQL transactional outbox w DB aktywności
dla side-effectów projekcji Discord (publish/edit/repair panelu i postów wydarzeń).
Niezależny worker/poller (w procesie usługi lub osobny entrypoint) konsumuje
outbox. **RabbitMQ dopiero gdy:** multi-Discord fan-out (P4.5), wiele konsumentów
lub wymagany DLQ/replay poza jedną usługą — z migracją publishera outbox → RMQ
bez zmiany domeny.

Uzasadnienie repo-grounded:

1. Już działa sprawdzony wzorzec HTTP + assertions (Gateway↔Authz).
2. Compose ma RMQ, ale **zero** kodu brokera — wprowadzenie od P4.1 to koszt bez
   natychmiastowej wartości domenowej.
3. NON_NEGOTIABLES wymagają outbox dla krytycznych procesów — projekcja Discord
   jest krytyczna; mutacje synchroniczne HTTP z idempotency wystarczą w P4.1.
4. Authz już uczy lease/retry queue — ten sam wzorzec przenosimy do outbox paneli.

Porty domenowe: `ActivityCommandPort`, `ProjectionDispatcherPort`,
`AuthorizePort` — bez importu Nest/RMQ/discord.js w Domain/Application.

## 12. P4-D6 — Stały panel Discord (projekt operacyjny)

**Status:** `TECHNICAL_RECOMMENDATION_READY_FOR_AUDIT` /
`PROPOSED — READY_FOR_CHATGPT_AUDIT`  
Produkt (layout, in-place, sekcje) = OWNER_ACCEPTED. Mechanizm publish/repair =
otwarty technicznie.

### 12.1 Trwały rekord panelu (propozycja schematu)

Tabela robocza `activity_hub_panels` (nazwa finalna z usługą):

| Pole                     | Typ (roboczy)                                     | Opis                                   |
| ------------------------ | ------------------------------------------------- | -------------------------------------- |
| `id`                     | uuid                                              | PK                                     |
| `organization_id`        | uuid                                              | org V2                                 |
| `discord_guild_id`       | text                                              | snowflake                              |
| `channel_id`             | text                                              | snowflake                              |
| `message_id`             | text null                                         | snowflake po publikacji                |
| `panel_type`             | text                                              | np. `centrum_v1` (stała enum domenowa) |
| `payload_version`        | int                                               | wersja drzewa Components V2            |
| `status`                 | text                                              | maszyna stanów §12.2                   |
| `last_success_at`        | timestamptz null                                  | ostatnia udana publikacja/edit         |
| `last_error_code`        | text null                                         | klasyfikacja błędu Discord/ops         |
| `last_error_at`          | timestamptz null                                  |                                        |
| `correlation_id`         | text                                              | ostatnia operacja                      |
| `lease_owner`            | text null                                         | multi-instance                         |
| `lease_expires_at`       | timestamptz null                                  |                                        |
| `config_channel_desired` | text null                                         | docelowy kanał po „przenieś”           |
| UNIQUE                   | `(organization_id, discord_guild_id, panel_type)` | **jeden panel typu na guild**          |

### 12.2 Maszyna stanów (propozycja nazw)

```text
unconfigured → publishing → active
                 ↘ degraded (retryable Discord/API)
active → missing (message 404) → publishing (repair)
active → permission_denied
active → detached (operator odłączył / bot left)
any → publishing (refresh / payload bump)
permission_denied → publishing (po naprawie uprawnień)
detached → unconfigured | publishing (re-attach)
```

Znaczenia: `unconfigured` brak kanału; `publishing` in-flight; `active` zgodny;
`degraded` aktywny rekord ale ostatni sync failed; `missing` wiadomość zniknęła;
`permission_denied` 403/missing access; `detached` świadomie wyłączony.

### 12.3 Operacje operatora (bez publicznych nazw UX)

Wewnętrzne komendy/akcje (nazwy techniczne; copy = OWNER_DECISION_REQUIRED):

| Akcja     | Efekt                                                                   |
| --------- | ----------------------------------------------------------------------- |
| `publish` | Pierwsza publikacja gdy `message_id` null                               |
| `refresh` | Edit tej samej wiadomości (nowy payload)                                |
| `repair`  | Wykryj 404 → send nowej + update `message_id`; nie spamuj duplikatów    |
| `move`    | Ustaw desired channel → detach starej / publish nowej atomowo w domenie |
| `detach`  | Status `detached`; opcjonalnie delete wiadomości                        |
| `inspect` | Zwróć stan rekordu + probe Discord (ephemeral)                          |

Każda akcja: Identity/context Discord User → **Authorization P3**
(`permission.activity.panel.publish` lub Accepted ID) → command z
idempotency-key `(guild, panel_type, action, key)`.

### 12.4 Reconcile automatyczny

| Trigger                | Zachowanie                                       |
| ---------------------- | ------------------------------------------------ |
| Start procesu          | Claim lease → inspect all `active                | degraded | missing | publishing` stale |
| Okresowo               | J.w. (interval konfiguracyjny)                   |
| Błąd Discord API       | Mark `degraded` + enqueue outbox retry z backoff |
| Bump `payload_version` | Wszystkie panele typu → `refresh` via outbox     |
| Channel config change  | `move` / reconfigure                             |

### 12.5 Detekcje awarii

| Sygnał                   | Mapowanie statusu          |
| ------------------------ | -------------------------- |
| Message unknown/404      | `missing` → repair publish |
| Unknown channel          | `degraded` / wymaga `move` |
| Missing Access / 403     | `permission_denied`        |
| Bot removed from guild   | `detached` + audit         |
| Desired channel ≠ actual | plan `move`                |

### 12.6 Anti-duplication + lease

- UNIQUE `(org, guild, panel_type)`.
- Przed `channel.send`: SELECT FOR UPDATE rekordu + lease (wzór Authz revoke).
- Po udanym send: zapisz `message_id` w tej samej transakcji domenowej / outbox
  confirm; nigdy drugi send gdy `message_id` niepusty i status ≠ `missing`.
- Edit path: `messages.edit` z `MessageFlags.IsComponentsV2` (jak P1 panel-test).

### 12.7 Retry / audyt / multi-Discord

- Backoff wykładniczy w outbox (cap + max attempts → `degraded` + alert audyt).
- `ActivityAuditEntry` dla publish/repair/move/detach z correlation_id.
- Multi-guild: niezależne rekordy per guild; awaria jednego nie blokuje innych
  (P4.5); shared event SoT w backendzie.

### 12.8 Upgrade payload Components V2

1. Zwiększ `payload_version` w kodzie renderera.
2. Reconcile enqueuje `refresh` dla wszystkich `active`.
3. Stare custom_id: interakcje walidują wersję; stale → ephemeral „odśwież panel”.
4. Brak równoległych wiadomości „stary+nowy” tego samego `panel_type`.

## 13. Katalog permission IDs (propozycja TECH — P4-D7)

**Status stringów:** `OWNER_DECISION_REQUIRED`  
Poniższa tabela = pakiet decyzyjny; **nie** dodawać do kodu Authz bez Accepted.

| ID (propozycja)                                 | Scope        | Ordinary/Sensitive | Typowy podmiot | Etap   | Mapowalny z roli Discord? | Ryzyko eskalacji              |
| ----------------------------------------------- | ------------ | ------------------ | -------------- | ------ | ------------------------- | ----------------------------- |
| `permission.activity.event.read`                | guild        | ordinary           | członek        | P4.1–2 | tak (member)              | niskie                        |
| `permission.activity.event.create`              | guild        | ordinary           | członek        | P4.1–2 | tak                       | spam create — limity domenowe |
| `permission.activity.event.edit.self`           | guild        | ordinary           | organizator    | P4.2   | pośrednio (owner)         | średnie jeśli źle scoped      |
| `permission.activity.event.cancel.self`         | guild        | ordinary           | organizator    | P4.2   | pośrednio                 | niskie                        |
| `permission.activity.event.manage.others`       | guild        | sensitive          | moderator      | P4.2+  | tak (mod role)            | wysokie                       |
| `permission.activity.event.join`                | guild        | ordinary           | członek        | P4.2/4 | tak                       | niskie                        |
| `permission.activity.event.participants.manage` | guild        | ordinary/sensitive | org+mod        | P4.2   | częściowo                 | średnie                       |
| `permission.activity.panel.publish`             | guild        | sensitive          | operator       | P4.2   | Manage Guild / grant      | wysokie (channel spam)        |
| `permission.activity.admin.configure`           | guild/org    | sensitive          | admin          | P4.3   | tak                       | wysokie                       |
| `permission.activity.event.publish.multi_guild` | organization | sensitive          | elevated       | P4.5   | ostrożnie                 | bardzo wysokie                |
| `permission.activity.event.create.recurring`    | guild/org    | sensitive          | elevated       | P4.6   | tak                       | wysokie (fan-out)             |
| `permission.activity.event.privacy.manage`      | guild        | sensitive          | org+mod        | P4.6   | częściowo                 | średnie                       |
| `permission.activity.attendance.record`         | guild        | ordinary           | organizator    | P4.6   | pośrednio                 | niskie                        |
| `permission.activity.stats.read.self`           | guild/org    | ordinary           | user           | P4.6   | n/a                       | niskie                        |
| `permission.activity.stats.read.guild`          | guild        | sensitive          | moderator      | P4.6   | tak                       | PII/agregaty                  |
| `permission.activity.event.moderate.guild`      | guild        | sensitive          | moderator      | P4.2+  | tak                       | wysokie                       |

Deny P3 zawsze wygrywa. Brak lokalnego RBAC w usłudze aktywności.

## 14. P4-D3 — warianty nazwy usługi (pakiet właściciela)

**Status:** `OWNER_DECISION_REQUIRED`  
Rekomendacja TECH poniżej **nie** zamyka decyzji.

| #   | Katalog             | Pakiet                  | DB          | Zakres                              | Ryzyko nazwy                           | Wpływ na później                                  |
| --- | ------------------- | ----------------------- | ----------- | ----------------------------------- | -------------------------------------- | ------------------------------------------------- |
| A   | `community-service` | `@v2/community-service` | `community` | Centrum + przyszłe moduły community | zbyt szeroka jeśli later „forum/sklep” | elastyczna; zgodna z generate-service `*-service` |
| B   | `activity-service`  | `@v2/activity-service`  | `activity`  | tylko aktywności/RSVP               | wąska; rename przy ekspansji           | czytelna dla P4; może wymusić second service      |
| C   | `centrum-service`   | `@v2/centrum-service`   | `centrum`   | branding produktu                   | PL/brand w infra; słabe poza PL        | utrudnia angielskie konwencje repo                |

**Rekomendacja techniczna:** **A `community-service` / DB `community`** — zgodna z
`pnpm generate:service` (`[a-z]-service`), ADR-0001 ownership, miejsce na P4.6+
bez natychmiastowego rozszczepiania. Formalna nazwa nadal OWNER_DECISION_REQUIRED.

## 15. P4.1 — Plan implementacji (docs only; no code in this PR)

**Status:** `PROPOSED — READY_FOR_CHATGPT_AUDIT`  
**Cel:** Domain, model danych, kontrakty, permissions catalog wiring (Accepted
IDs only), audyt — **bez** UI Discord/WWW/Admin.  
**Nazwa usługi:** roboczo `community-service` (P4-D3 OWNER_DECISION_REQUIRED;
generator wymaga `*-service`).

### 15.1 Struktura katalogów (propozycja)

```text
services/community-service/          # po Accepted P4-D3 nazwy
  package.json  project.json  vitest.config.ts  tsconfig*.json  eslint.config.mjs
  migrations/00xx_*.sql
  src/
    main.ts
    domain/           # czysta TS — bez Nest/Fastify/pg/discord/RMQ
    application/      # use-cases + ports
    infrastructure/   # pg, migrations runner, HTTP clients (Authz)
    interface/        # Nest controllers, guards, workers, app.module
packages/contracts/
  src/community/      # OpenAPI fragments / zod DTO shared (opcjonalnie w P4.1)
```

Wzór warstw: `services/authorization-service` + `pnpm generate:service`.

### 15.2 Nowe projekty / pakiety

| Element                              | Akcja P4.1                                                |
| ------------------------------------ | --------------------------------------------------------- |
| `services/community-service`         | **NOWY** (generate-service + dataOwnership=database)      |
| `packages/contracts` community paths | **rozszerzenie** szkicu OpenAPI/DTO                       |
| `apps/*` Discord/Web/Admin           | **bez** UI produktowego; najwyżej health/env placeholders |
| RabbitMQ client package              | **NIE** w P4.1 (patrz §11)                                |

### 15.3 Pliki dodawane (reprezentatywne)

- `services/community-service/**` (skeleton + domain + migrations + tests)
- `infrastructure/postgres/init/01-create-databases.sh` — rola+DB `community`
- `.env.example` — `COMMUNITY_*` / `COMMUNITY_DATABASE_URL`
- `docs/architecture/SERVICE_CATALOG.md` — wiersz po Accepted nazwy
- OpenAPI draft pod `packages/contracts` lub `docs/architecture/...`

### 15.4 Pliki zmieniane

- `pnpm-lock.yaml` (workspace deps)
- Compose init DB script; ewent. `tools/scripts/runtime-smoke.mjs` (7. usługa)
- `docs/ai/PROJECT_STATE.md` / handoff po merge P4.1
- **Nie:** `.github/workflows/*` w pierwszym PR P4.1 (osobno jeśli CI smoke)

### 15.5 Zależności warstw

```text
interface (Nest) → application → domain
infrastructure → application ports
domain ⟂ Nest, Fastify, pg, discord.js, amqplib
community-service → authorization-service (HTTP authorize/explain + assertion)
community-service ⟂ identity DB / authorization DB
discord-gateway ⟂ community DB (dopiero P4.2 adapter HTTP)
```

### 15.6–15.13 Model domenowy (P4.1 scope)

**Granica:** SoT aktywności/RSVP/limitów/projekcji-intent; brak renderu Discord.

**Agregaty / encje (P4.1 minimum):**
`ActivityType`, `ParticipationStatusDef`, `ParticipantFieldCatalog`,
`GuildActivitySettings`, `Activity`, `Participation`, `ActivityProjection`
(rekord intent/message ids — bez live Discord), `ActivityAuditEntry`,
`IdempotencyRecord`, `OutboxMessage` (schema gotowa; worker może być no-op /
poller stub).

**Value objects:** `ActivityId`, `GuildId`, `OrganizationId`, `DiscordUserId`,
`TimeWindow` (≤14d member), `ParticipantLimit`, `OccupiesSlot`, `CorrelationId`,
`PermissionId` (string Accepted).

**Statusy Activity:** jak §4 (`draft_form` … `completed` / `cancelled` /
`deleted`).

**Maszyny:** Activity lifecycle; Participation (statusDef + waitlist position);
Outbox delivery (`pending|leased|done|dead`); HubPanel (§12) — tabela może
powstać w P4.1 jako schema-only, runtime w P4.2.

**Komendy (application):** `CreateOneShotActivity`, `CancelActivity`,
`ChangeSchedule` (flags reconfirm), `SetRsvp`, `PromoteWaitlist`,
`ConfigureGuildSettings` (admin API szkic), `RecordAudit`.

**Zapytania:** `GetActivity`, `ListGuildActivities`, `ListMyActivities`,
`ExplainLimits`.

**Zdarzenia domenowe (porty; broker nie wymagany):**
`community.activity.created.v1`, `….rsvp_changed.v1`, `….cancelled.v1`,
`….schedule_changed.v1`, `….waitlist_promoted.v1` — zapis outbox payload JSON.

### 15.14–15.16 Kontrakty

**HTTP/S2S (sync):**

| Method path (szkic)                        | Auth                      | Idempotency     |
| ------------------------------------------ | ------------------------- | --------------- |
| `POST /community/v1/activities`            | assertion + Authz create  | key required    |
| `GET /community/v1/activities/:id`         | assertion + read          | —               |
| `POST /community/v1/activities/:id/rsvp`   | assertion + join          | key required    |
| `POST /community/v1/activities/:id/cancel` | assertion + cancel/manage | key             |
| `GET /community/v1/me/activities`          | assertion                 | —               |
| `POST /community/v1/authorize-probe` (dev) | —                         | zabronione prod |

Każda mutacja: `AuthorizePort.authorize/explain` **przed** commit reguł
(wyjątki tylko read publicznych projekcji — i tak membership).

**Zdarzenia przyszłe:** wersjonowane nazwy jak wyżej; consumer = gateway P4.2 /
RMQ P4.5+.

### 15.17–15.20 Schemat DB / migracje

Kolejność migracji (przykład):

1. `0001_extensions_and_meta` (jeśli potrzebne)
2. `0002_catalog_types_status_fields_settings`
3. `0003_activities_participations`
4. `0004_projections_outbox_idempotency_audit`
5. `0005_hub_panels` (schema pod P4.2)

**Constraints (przykłady):**

- CHECK start_at ≤ now()+14d dla creator bez recurring grant (egzekucja domenowa
  - opcjonalnie deferred)
- UNIQUE waitlist `(activity_id, position)` WHERE active
- UNIQUE participation `(activity_id, subject_discord_user_id)` active
- UNIQUE hub panel `(organization_id, discord_guild_id, panel_type)`
- FK activity → type/settings

**Indeksy:** `(guild_id, start_at)`, `(organizer_id, status)`,
`outbox (status, available_at)`, `idempotency (key)`.

**Idempotency keys:** `Idempotency-Key` header lub body
`idempotency_key` scoped `(actor, route, key)` → same response.

### 15.21–15.26 Audyt, korelacja, Authz, błędy, retry, TX

- Audit: append-only `activity_audit_entries` (actor, action, before/after ref,
  reason, correlation_id).
- Correlation: wymagane na mutacjach; propagowane do outbox.
- Authz: każdy command mapuje permission §13 (Accepted strings only).
- Błędy domenowe: `ActiveActivityLimitExceeded`, `HorizonExceeded`,
  `RegistrationsClosed`, `WaitlistOnly`, `PermissionDenied`, `NotFound`,
  `ConflictScheduleReconfirmRequired`, `InvalidStatusTransition`.
- Retry: HTTP caller — limited; outbox — lease+backoff (wzór Authz revoke).
- TX: command + outbox insert + idempotency row w **jednej** transakcji PG.

### 15.27–15.34 Testy i infra

| Rodzaj         | Przykłady                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Unit domain    | max 4 active; 14d; auto Będę organizer; waitlist FIFO; occupiesSlot; auto-end 2h; cancel; reconfirm flag |
| Integration PG | migrations up; create+rsvp; idempotent replay; outbox row                                                |
| Architecture   | domain imports forbid nest/pg/discord (vitest boundaries)                                                |
| Contract       | OpenAPI/zod request validation; golden error codes                                                       |
| Migration      | up/down or up+assert schema on empty DB                                                                  |
| Compose        | DB `community` + role; **bez** nowego kontenera app                                                      |
| `.env.example` | COMMUNITY_DATABASE_URL, COMMUNITY_ENABLED, ports                                                         |
| Runtime smoke  | health `/health/live` + `/ready` community (rozszerzenie smoke)                                          |

### 15.35 Definition of Done — P4.1

1. Usługa startuje lokalnie; migracje zielone; izolacja DB.
2. Domain invariants pokryte testami (limity produktowe A–F minimum).
3. OpenAPI/DTO szkic mutacji+zapytań; bez Discord UI.
4. AuthorizePort zintegrowany (fake w unit; HTTP client + assertion w infra).
5. Outbox tabela + test insert; worker może być minimalny/no-op z testem lease.
6. `architecture:check` + lint/typecheck/test service green.
7. Brak importów zakazanych w domain/application.
8. Marker: `READY_FOR_AUDIT_P4_1_DOMAIN`.
9. Permission IDs w kodzie tylko po Accepted P4-D7 (do tego czasu stałe testowe
   / feature-flagged mirror Accepted set).
10. Pierwszy PR implementacyjny **nie** zawiera UI Discord.

### 15.36 Kolejność commitów implementacyjnych (max 8)

| #   | Cel                     | Zakres                                      | Pliki                                    | Testy                      | Zależności                            | Done when                     |
| --- | ----------------------- | ------------------------------------------- | ---------------------------------------- | -------------------------- | ------------------------------------- | ----------------------------- |
| 1   | Skeleton usługi         | generate-service + Nx/pnpm                  | `services/community-service/*` bootstrap | lint/typecheck/health      | P4-D3 name Accepted lub jawny wyjątek | health OK                     |
| 2   | DB isolation            | init role/DB + env                          | postgres init, `.env.example`            | infra script / migrate dry | #1                                    | DB connects                   |
| 3   | Domain model            | aggregates/VOs/errors/state                 | `src/domain/**`                          | unit lifecycle/limits      | #1                                    | invariants green              |
| 4   | Application ports       | commands/queries + AuthorizePort            | `src/application/**`                     | unit use-case fakes        | #3                                    | use-cases green               |
| 5   | Migrations schema       | tables/indexes/constraints                  | `migrations/**`                          | migration test             | #2                                    | schema assert                 |
| 6   | Persistence adapter     | repository + idempotency + outbox write     | `infrastructure/persistence/**`          | integration PG             | #4–5                                  | create/rsvp persist           |
| 7   | HTTP API + Authz client | controllers, assertion guard, OpenAPI draft | `interface/**`, contracts                | contract + e2e service     | #6                                    | mutate via HTTP               |
| 8   | Hardening               | architecture boundaries, smoke, audit docs  | tools boundaries, smoke, docs            | architecture:check, smoke  | #7                                    | `READY_FOR_AUDIT_P4_1_DOMAIN` |

**Zakaz w tych 8 commitach:** discord-gateway product panel, WWW/Admin UI,
RMQ topology, final assets.
