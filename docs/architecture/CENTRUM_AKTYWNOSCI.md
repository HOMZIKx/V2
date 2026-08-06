# Centrum Aktywności — architektura (P4 plan)

## Status

`PROPOSED — planning only, 2026-08-06`

Nie implementować przed `APPROVED` planu P4 oraz merge fundamentu P3 do `main`.

## Problem

Po Identity (P2) i Authorization (P3) platforma nadal nie ma pierwszej domeny
produktowej bota. Issue #15 odkłada „funkcje biznesowe Centrum Aktywności” poza
P3. Potrzebny jest pion, który:

- wystawia spójny panel Discord (stały post, select/buttons/modals);
- pozwala członkom tworzyć i obsługiwać aktywności bez logowania WWW (P3-D3);
- sprawdza uprawnienia V2 przez Authorization (P3-D4…D7);
- zachowuje historię przy opuszczeniu serwera / blokadzie (P3-D12/D16);
- nie umieszcza logiki biznesowej w `discord-gateway`.

## Proponowany podział odpowiedzialności

```text
Discord user
    │ interactions
    ▼
discord-gateway  ──authorize──►  authorization-service
    │ REST (activity commands/queries)
    ▼
community-service (robocza nazwa; P4-D3)
    │ owns DB `community` (nazwa bazy do potwierdzenia)
    ▼
PostgreSQL (osobna baza; osobne konto)
```

| Usługa                          | Rola w P4                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `discord-gateway`               | Adapter: komendy, panel, podpisane custom IDs, mapowanie interakcji → use-case community; **bez** reguł biznesowych aktywności |
| `authorization-service`         | Allow/deny + explain dla permission IDs produktu; membership/roles już z P3                                                    |
| `identity-service`              | Poza krytyczną ścieżką Discord activity (P3-D3); WWW/Desktop później                                                           |
| `community-service` (Proposed)  | Właściciel encji aktywności, uczestnictwa, stanów, historii lokalnej serwera                                                   |
| `api-gateway` / `web` / `admin` | Poza P4 v1, chyba że P4-D4 wybierze inaczej                                                                                    |

## Granice danych (Proposed)

Community owns (szkic — finalny model po P4-D1/D2):

- definicja / instancja aktywności (typ, status, guild scope, autor Discord User ID,
  opcjonalne późniejsze `v2_user_id`);
- uczestnicy / odpowiedzi / rezygnacje;
- metadane operacyjne (correlation id, idempotency key, timestamps);
- audyt zmian stanu aktywności (nie mylić z Authz audit).

Community **nie** owns:

- User/Session/Account (Identity);
- membership, role maps, grants, blocks, login entitlement (Authorization);
- treść wiadomości Discord jako SoT (kanał Discord jest projekcją; SoT w community).

## Kontrakty synchroniczne (szkic)

Nazwy ścieżek są robocze do czasu Accepted ADR i OpenAPI slice.

| Kierunek                  | Sens                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| Gateway → Community       | create / join / leave / cancel / get / list open for guild            |
| Gateway → Authorization   | `authorize` / `authorize/explain` przed mutacją                       |
| Community → Authorization | opcjonalnie to samo z service assertion przy jobach tła (jeśli P4-D5) |
| Identity                  | nie na ścieżce Discord activity v1                                    |

Każda mutacja:

1. walidacja wejścia (runtime);
2. authorize (fail-closed przy stale/unavailable zgodnie z klasą operacji);
3. idempotentny zapis;
4. odpowiedź projekcji do panelu / ephemeral.

## Zdarzenia (szkic, nie obowiązek v1)

`community.activity.created.v1`, `….joined.v1`, `….left.v1`, `….cancelled.v1`,
`….completed.v1` — wersjonowane; publikacja dopiero gdy P4-D5 wybierze Outbox/RMQ
albo kolejny slice.

## Discord UX (techniczny szkielet — assety = P4-D8)

Zgodne ze standardem:

1. Jeden stabilny publiczny panel Centrum (Components V2 Container).
2. Select menu → treść / akcja / modal; preferuj update in-place.
3. Potwierdzenia prywatne = ephemeral.
4. Destrukcja (anuluj aktywność publiczną, usuń panel) = confirm.
5. Stany: loading, empty, success, error, unavailable.
6. Interakcje po restarcie procesu (signed custom IDs jak P1).

**Zakaz:** finalne kolory/emoji/banner/copy bez P4-D8 / Issue #12.

## Zależność od P3

Implementacja P4 **musi** bazować na scalonym P3:

- permission checks przez `/authorization/v1/authorize`;
- guild aktywny (nie tylko `pending_sync`) dla publikacji panelu na serwerze;
- sync membership aktualny dla join/leave entitlement;
- brak cross-read bazy `authorization`.

## Ryzyka

| Ryzyko                                      | Mitygacja                                                |
| ------------------------------------------- | -------------------------------------------------------- |
| Scope creep „wszystkie moduły naraz”        | P4-D1 wymusza wąski v1                                   |
| Logika w gateway                            | ADR + architecture:check boundaries                      |
| UI bez systemu graficznego                  | Issue #12 / P4-D8 blokuje implementację widoczną         |
| P3 nie scalone                              | Brief implementacyjny warunkowy                          |
| Duplikacja historii przy linkowaniu V2 User | P3-D2: bind Discord ID → v2_user_id bez duplikatu autora |

## Poza zakresem architektury P4 v1

- Desktop Companion widgets;
- pełny Admin do zarządzania wszystkimi typami;
- Zeabur;
- effective-access cache;
- Streams.
