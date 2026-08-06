# Centrum Aktywności — architektura i etapy (P4)

## Status

`SPEC — product OWNER_ACCEPTED; technical boundary ADR-0014 still Proposed`

Implementacja kodu zabroniona do: merge P3 Authorization do `main` +
`APPROVED` / `READY_FOR_CURSOR` brief. Ten dokument jest implementacyjną
specyfikacją granic i etapów — **bez** kodu.

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

Finalne stringi ID = **`OWNER_DECISION_REQUIRED`**. Poniżej **propozycja techniczna**
kluczy (nie decyzja właściciela) — muszą trafić do katalogu Authz przed impl.

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
| P3 nie scalone          | Brak push/impl; lokalny spec only           |
| Assety UI               | Issue #12 blokuje widoczny Discord slice    |
| Scope creep P4.6 w P4.2 | Twarde out-of-scope per etap                |
| Duplikacja RBAC         | Zakaz lokalnych ról community; tylko P3 IDs |
