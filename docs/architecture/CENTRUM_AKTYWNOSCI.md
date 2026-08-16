# Centrum Aktywności — architektura i etapy (P4)

## Status

`SPEC — ADR-0014 Accepted; PR #18 merged; P4.1 waits for READY_FOR_CURSOR`

P3 Authorization scalone (`main` @ `1f23635`, PR #16). Specyfikacja P4 scalona
(PR #18 → `main` @ `8c1b095`, `FINAL_P4_SPEC_AUDIT_APPROVED`). Implementacja
kodu zabroniona do briefu `READY_FOR_CURSOR`. Ten dokument = spec granic i
etapów — **bez** kodu.

Produkt: [CENTRUM_AKTYWNOSCI.md](../product/CENTRUM_AKTYWNOSCI.md).
Handoff: [P4_CENTRUM_AKTYWNOSCI_HANDOFF.md](../ai/P4_CENTRUM_AKTYWNOSCI_HANDOFF.md).
Śledzenie: [P4_TEST_TRACEABILITY.md](../ai/P4_TEST_TRACEABILITY.md).

## 1. Problem

Po Identity (P2) i Authorization (P3) potrzebny jest bounded context aktywności
z osobną bazą, bez logiki w `discord-gateway` i bez równoległego RBAC.

## 2. Granice usług (Accepted — ADR-0014)

```text
Discord / WWW / Admin (adapters)
        │
        ▼
discord-gateway / web / admin
        │ authorize (P3)          │ activity commands
        ▼                         ▼
authorization-service      activity-service
        │                         │
   DB authorization          DB activity
```

| Usługa                  | Rola                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| `discord-gateway`       | Adapter Discord: panel, formularz, projekcje; bez SoT reguł                       |
| `web` / `admin`         | Adaptery WWW (P4.4) / Admin (P4.3)                                                |
| `authorization-service` | Jedyny SoT allow/deny                                                             |
| `identity-service`      | WWW session / Internal JWT; poza krytyczną ścieżką Discord (P3-D3)                |
| **`activity-service`**  | SoT wydarzeń, RSVP, limity, outbox, audyt (`@v2/activity-service`, DB `activity`) |

Odrzucone: `community-service` jako szeroki worek.

## 3. Agregaty domenowe (P4.1)

| Agregat                                       | Odpowiedzialność                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ActivityType`                                | Rodzaje / gry per guild / „Inna aktywność”                                                                               |
| `ParticipationStatusDef`                      | Status RSVP: id, label, occupiesSlot, **behavior**, selectableByMember, active, sortOrder                                |
| `ParticipantFieldCatalog`                     | Pola dodatkowe                                                                                                           |
| `GuildActivitySettings`                       | Kanały, pingi, limity, retention, reminders, report reasons, **organizerDefaultStatusId**, **waitlistPromotionStatusId** |
| `Activity`                                    | Wydarzenie + lifecycle + limity                                                                                          |
| `ActivitySeries`                              | Serie (P4.6)                                                                                                             |
| `Participation`                               | statusId + **confirmationState** + waitlist position + fields                                                            |
| `ActivityProjection`                          | Discord message/channel per guild                                                                                        |
| `ActivityHubPanel` + `PanelPublishOccurrence` | Stały panel + nonce publish                                                                                              |
| `OutboxMessage`                               | Transactional outbox                                                                                                     |
| `IdempotencyRecord`                           | Idempotency keys                                                                                                         |
| `NotificationInboxItem`                       | Skrzynka                                                                                                                 |
| `ActivityAuditEntry`                          | Audyt                                                                                                                    |
| `AttendanceRecord`                            | Obecność (P4.6)                                                                                                          |

## 4. Cykl życia `Activity`

```text
draft_form (24h) → published → registrations_open
        → registrations_closed → in_progress → completed
                                      ↘ cancelled
published (no participants, before start) → deleted
```

Auto-complete po 2h gdy brak end.

## 5. ParticipationStatusDef + confirmationState (Accepted)

`occupiesSlot` **nie wystarcza**. Każdy status ma stabilne **behavior**
niezależne od copy:

| Pole                 | Opis                                                 |
| -------------------- | ---------------------------------------------------- |
| `id`                 | stabilne ID                                          |
| `label`              | konfigurowalne (copy)                                |
| `occupiesSlot`       | bool                                                 |
| `behavior`           | `confirmed` \| `tentative` \| `declined` \| `custom` |
| `selectableByMember` | bool                                                 |
| `active`             | bool                                                 |
| `sortOrder`          | int                                                  |

Konfiguracja guild/type wskazuje dokładnie:

- `organizerDefaultStatusId`
- `waitlistPromotionStatusId`

Oba muszą wskazywać status: `active` + `selectableByMember` +
`occupiesSlot=true` + `behavior=confirmed`.

### Participation.confirmationState

- `confirmed`
- `requires_reconfirmation`

**Po zmianie terminu:**

1. dotychczasowy `statusId` zachowany;
2. `confirmationState → requires_reconfirmation`;
3. miejsce tymczasowo zarezerwowane (occupiesSlot nadal obowiązuje);
4. **brak** automatycznego awansu waitlist przy samej zmianie terminu;
5. uczestnik potwierdza lub rezygnuje;
6. po deadline braku potwierdzenia → zwolnienie miejsca;
7. dopiero wtedy FIFO waitlist promotion do `waitlistPromotionStatusId`.

Deadline reconfirm: domyślnie **start wydarzenia**; organizator może skrócić,
nie wcześniej niż **minimum techniczne 15 minut** od momentu zmiany terminu
(chyba że start jest bliżej — wtedy start).

„Wymaga ponownego potwierdzenia” **nie** jest osobnym StatusDef RSVP.

## 6. Permission IDs (P4-D7 Accepted)

| Permission ID                                   | Scope        | Sensitive? | Semantyka                                  |
| ----------------------------------------------- | ------------ | ---------- | ------------------------------------------ |
| `permission.activity.event.read`                | guild        | ordinary   | odczyt                                     |
| `permission.activity.event.create`              | guild        | ordinary   | create one-shot                            |
| `permission.activity.event.join`                | guild        | ordinary   | RSVP                                       |
| `permission.activity.event.manage.self`         | guild        | ordinary   | org/co-org + ownership check domeny        |
| `permission.activity.event.manage.guild`        | guild        | sensitive  | operacje na cudzych wydarzeniach           |
| `permission.activity.event.create.recurring`    | guild/org    | sensitive  | serie                                      |
| `permission.activity.event.publish.multi_guild` | organization | sensitive  | multi-Discord                              |
| `permission.activity.event.create.private`      | guild        | sensitive  | prywatne                                   |
| `permission.activity.panel.manage`              | guild        | sensitive  | publish/refresh/repair/move/detach/inspect |
| `permission.activity.config.manage`             | guild/org    | sensitive  | konfiguracja                               |
| `permission.activity.attendance.record`         | guild        | ordinary   | obecność                                   |
| `permission.activity.stats.read.self`           | guild/org    | ordinary   | własne statystyki                          |
| `permission.activity.stats.read.guild`          | guild        | sensitive  | statystyki serwera                         |
| `permission.activity.report.manage`             | guild        | sensitive  | obsługa zgłoszeń                           |

**Zakazane konkurencyjne nazwy (nie używać):** `edit.self`, `cancel.self`,
`manage.others`, `moderate.guild`, `participants.manage`, `panel.publish`,
`admin.configure`.

## 7. Kontrakty HTTP / zdarzenia

| Kierunek                               | Operacje                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Gateway/Web/Admin → `activity-service` | create, update, cancel, rsvp, reconfirm, waitlist, list, get, my-activities, config, report, attendance, panel ops |
| Adapter → Authorization                | `authorize` / `explain` przed mutacją                                                                              |

Zdarzenia (porty; broker nie w P4.1):

- `activity.activity.created.v1`
- `activity.activity.rsvp_changed.v1`
- `activity.activity.cancelled.v1`
- `activity.activity.schedule_changed.v1`
- `activity.activity.waitlist_promoted.v1`
- `activity.activity.reconfirm_required.v1`
- `activity.panel.projection_repaired.v1`

Ścieżki HTTP (szkic): `/activity/v1/...`

## 8. Etapy

### P4.1 — Domain, dane, kontrakty, outbox core

Cel: agregaty, migracje DB `activity`, OpenAPI, idempotency, outbox schema +
claim/lease/retry + **testowy** handler; runtime worker **domyślnie wyłączony**
do P4.2 realnego consumer projekcji. **Bez** UI Discord/WWW/Admin.
Marker: `READY_FOR_AUDIT_P4_1_DOMAIN`.

### P4.2 — Jednorazowe Discord (+ panel)

Panel + prywatny formularz + publikacja + RSVP + limity + Więcej + repair.
**P4.2a (test guild):** native Components V2, zaakceptowany layout, **bez**
dekoracyjnego bannera — Issue #12 **nie** blokuje.
**P4.2 prod visual sign-off:** wymaga Issue #12 assets.
Marker: `READY_FOR_AUDIT_P4_2_DISCORD_EVENTS`.

### P4.3–P4.6

Bez zmian produktowych względem poprzedniej spec (Admin → WWW → multi/RMQ →
serie/privacy/attendance/stats).

## 9. P4-D5 — Transport (Accepted)

**P4.1–P4.2:** sync HTTP + service assertion / właściwy user context +
obowiązkowe idempotency keys + PostgreSQL transactional outbox + trwały
claim/lease + retry/backoff.

**RabbitMQ:** nie w P4.1; planowany od **P4.5** (lub wcześniej przy realnym
multi-consumer/fan-out). Późniejszy publisher konsumuje istniejący outbox.
Domena nie zależy od brokera.

**P4.1 outbox deliverables:** schema, repository, claim/lease/retry core,
testowy handler. **Brak** runtime no-op workera udającego produkcję.
Runtime worker domyślnie **niewłączony**, dopóki P4.2 nie ma prawdziwego
consumer handlera projekcji Discord.

## 10. P4-D6 — Panel + crash window (Accepted)

### 10.1 Rekord panelu

`activity_hub_panels`: organization_id, discord_guild_id, channel_id,
message_id, panel_type, payload_version, status, last_success_at,
last_error__, correlation_id, lease__, UNIQUE (org, guild, panel_type).

Stany: `unconfigured` | `publishing` | `active` | `degraded` | `missing` |
`permission_denied` | `detached`.

### 10.2 Publish occurrence (przed Discord send)

Przed wysłaniem utwórz trwały `panel_publish_occurrences`:

- `panel_id`, `operation_id`
- `nonce` — deterministic, **≤25 znaków**
- `payload_version`, `desired_channel_id`, `correlation_id`
- status occurrence

Wysyłka Discord: **`nonce` + `enforceNonce: true`**.
Retry tego samego occurrence = **ten sam nonce**.

Payload komponentów zawiera stabilny, nieosobowy **`panel_id`** wewnątrz
wersjonowanych `custom_id` (np. `activity:v1:panel:<panelId>:create`).

### 10.3 Reconcile po restarcie

1. Najpierw odnajdź istniejącą wiadomość bota z tym `panel_id` w custom_id.
2. Jeśli znaleziona → zapisz/adoptuj `message_id` (bez ponownego send).
3. Dopiero gdy brak → ponowna publikacja (nowe occurrence lub retry nonce).
4. Wiele wiadomości tego samego panelu → wybierz kanoniczną; pozostałe
   disable/delete/cleanup wg uprawnień; **incident audit**.
5. Lease + UNIQUE nadal obowiązują.
6. **Nie** obiecywać „brak duplikatu” wyłącznie na SELECT FOR UPDATE.

### 10.4 Testy wymagane (P4.2+)

- crash po Discord send przed DB confirm;
- retry w oknie nonce;
- restart po send;
- reconcile adoptuje istniejącą wiadomość;
- dwa workery (lease);
- duplicate cleanup;
- przeniesienie kanału;
- message deleted → repair.

## 11. Transakcyjne invarianty (Accepted)

### Max 4 aktywne wydarzenia twórcy

- Sprawdzenie **w transakcji**;
- blokada per `(creator_subject, guild_id)` (row lock lub PG advisory
  transaction lock);
- dwa równoległe create **nie** mogą przekroczyć limitu.

### Limit uczestników

- Lock wiersza `Activity` przed zmianą RSVP;
- przeliczanie slotów w tej samej TX;
- tylko jedna osoba zajmuje ostatnie miejsce.

### Waitlist

- Pozycja w TX; awans pod lockiem Activity; FIFO;
- równoległe zwolnienia nie awansują tej samej osoby dwa razy.

### Horyzont 14 dni

- **Zakaz** PostgreSQL `CHECK (start_at <= now() + 14 days)`.
- Current time przez wstrzykiwany `Clock`;
- Authz: czy actor ma rozszerzony horyzont;
- walidacja application/domain; **ponownie wewnątrz TX** przed zapisem.

Wymagane: concurrent integration tests dla create/RSVP/waitlist.

## 12. Formularz Discord — jeden logiczny formularz (Accepted)

Discord modal ≤ **5** głównych komponentów. **Nie** jeden ogromny modal na
wszystkie pola. **Nie** kreator Dalej/Dalej/Dalej.

**Model:** prywatny panel Components V2 = jeden logiczny formularz ze
**szkicem 24h** i sekcjami:

1. podstawowe dane;
2. termin;
3. publikacja;
4. uczestnicy/limity;
5. opcje dodatkowe.

Edytuj przy sekcji → modal ≤5 pól **lub** selecty w prywatnym panelu.
Użytkownik edytuje sekcje w dowolnej kolejności; widzi podsumowanie draftu;
kończy **Podgląd** → **Publikuj**.

| Pole               | Komponent                                                         |
| ------------------ | ----------------------------------------------------------------- |
| nazwa              | Text Input                                                        |
| rodzaj             | String Select                                                     |
| data/godzina       | Text Input (jednoznaczny format) + timezone user / fallback guild |
| serwer             | String Select                                                     |
| kanał              | Channel Select (allowlist)                                        |
| opis               | Text Input paragraph                                              |
| limit              | Text Input lub Select                                             |
| statusy/pola/pingi | selecty w prywatnym panelu                                        |

Wymagane: walidacja daty, błędy **bez utraty draftu**, preview, cancel,
stale interaction, mobile wireframe (UX Discord doc).

## 13. Issue #12 / assety

- P4.1: bez assetów.
- **P4.2a test guild:** native V2 + zaakceptowany layout, **bez** dekoracyjnego
  bannera — **dozwolone**.
- Finalne bannery/ikony/fantasy/typografia/branding: przed **produkcyjnym**
  visual sign-off, nie przed testem działania.
- Zakaz losowych placeholder graphics.

## 14. P4.1 — Plan implementacji (activity-service)

### Struktura

```text
services/activity-service/
  package.json  # @v2/activity-service
  migrations/
  src/domain|application|infrastructure|interface/
infrastructure/postgres/init/ — rola+DB activity
```

### Commity (max 8)

1. Skeleton `activity-service` + health
2. DB isolation (`activity` role/DB) + env
3. Domain model (statusDef, confirmationState, locks semantics)
4. Application ports + AuthorizePort
5. Migrations (catalog, activities, participations, outbox, panels, occurrences)
6. Persistence + idempotency + outbox write/claim core + test handler
7. HTTP `/activity/v1` + Authz client + OpenAPI draft
8. Architecture boundaries, smoke hook, docs marker `READY_FOR_AUDIT_P4_1_DOMAIN`

**Zakaz w P4.1:** Discord UI, runtime projection worker włączony, RMQ, final assets.

### DoD P4.1

Domain invariants + concurrent tests plan; outbox schema+lease; worker flag off;
no Nest in domain; authorize hooks; OpenAPI draft; DB isolation.

## 15. Visual interaction contract (screenshot)

Screenshot-based doc
`docs/ux/CENTRUM_AKTYWNOSCI_VISUAL_INTERACTION_CONTRACT.md` wymaga czytelnego
załącznika w środowisku agenta.

**Status:** `REFERENCE_IMAGE_REQUIRED` — obraz niedostępny; część wizualna
wstrzymana (bez projektowania z pamięci). Nie blokuje P4.1.

Obowiązujący kontrakt interakcji Components V2 (bez pixel-perfect referencji):
[CENTRUM_AKTYWNOSCI_DISCORD.md](../ux/CENTRUM_AKTYWNOSCI_DISCORD.md).
