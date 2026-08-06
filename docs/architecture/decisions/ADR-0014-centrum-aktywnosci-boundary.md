# ADR-0014: Granica Centrum Aktywności (P4)

- **Status:** Proposed (techniczne; produkt A–S OWNER_ACCEPTED w docs/product)
- **Data:** 2026-08-06 (zaktualizowano SPEC-PREP)
- **Task:** `P4-CENTRUM-AKTYWNOSCI-SPEC-PREP-001`
- **Depends on:** ADR-0001, ADR-0007, ADR-0013 (P3), Issue #15 P3-D2/D3,
  Discord UX standard, product spec Centrum Aktywności

## Kontekst

Fundament tożsamości (P2) i dostępu (P3) nie wystarcza do pierwszego produktu
bota. Właściciel zatwierdził model produktowy Centrum Aktywności (tworzenie,
RSVP, limity, multi-Discord, serie, WWW/Admin w etapach). Potrzebna jest
jasna granica usług i danych — bez RBAC równoległego do P3.

## Decyzja produktowa (Accepted poza tym ADR)

Zakres funkcji, reguły RSVP/limitów/cyklu życia, kanały Discord+WWW+Admin w
etapach P4.1–P4.6 — w [product/CENTRUM_AKTYWNOSCI.md](../../product/CENTRUM_AKTYWNOSCI.md).
Ten ADR **nie** renegocjuje tych reguł.

## Decyzja techniczna (Proposed — wymaga Accepted)

1. **Właścicielem danych aktywności jest osobna usługa domenowa** (roboczo
   `community-service`; finalna nazwa = `OWNER_DECISION_REQUIRED`), z osobną
   bazą PostgreSQL. Żadna inna usługa nie czyta tej bazy.
2. **`discord-gateway` / `web` / `admin` są adapterami** — bez reguł biznesowych
   aktywności jako SoT.
3. **`authorization-service` pozostaje jedynym SoT allow/deny.** Mutacje
   wymagają permission IDs V2 (katalog minimalny TECH w architecture doc;
   finalne stringi = `OWNER_DECISION_REQUIRED`).
4. **Tożsamość na Discordzie:** Discord User ID; WWW login nie jest wymagany
   dla zwykłych operacji Discord (P3-D3).
5. **Transport v1:** rekomendacja TECH = sync HTTP + idempotency; Outbox/RMQ =
   TECHNICAL_OPEN (dawne P4-D5).
6. **Widoczne assety UX** wymagają Issue #12 przed implementacją UI Discord.
7. **Implementacja kodu** dopiero po: merge P3 do `main`, Accepted tego ADR
   (lub następcy), brief `READY_FOR_CURSOR`.

## Alternatywy odrzucone (fundament)

| Alternatywa                                    | Powód            |
| ---------------------------------------------- | ---------------- |
| Logika w `discord-gateway`                     | ADR-0001         |
| Dane aktywności w `authorization` / `identity` | Złe ownership    |
| Lokalny RBAC w community                       | Koliduje z P3-D4 |
| Reakcje emoji jako nawigacja                   | D-023            |

## Konsekwencje

- Nowa usługa + baza + izolacja Compose/CI po Accepted.
- Etapy P4.1–P4.6 w architecture doc.
- Panel P1 `/panel-test` nie jest produkcyjnym Centrum.

## Zastąpienie

Nie zastępuje ADR-0013. Doprecyzowuje katalog usług z ADR-0001.
