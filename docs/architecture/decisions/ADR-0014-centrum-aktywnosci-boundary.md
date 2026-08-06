# ADR-0014: Granica Centrum Aktywności (P4)

- **Status:** Proposed
- **Data:** 2026-08-06
- **Task:** `P4-CENTRUM-AKTYWNOSCI-001`
- **Depends on:** ADR-0001, ADR-0007, ADR-0013 (P3 Authorization foundation),
  Issue #15 P3-D2/D3, Discord UX standard

## Kontekst

Fundament tożsamości (P2) i dostępu (P3) nie wystarcza do pierwszego produktu
bota. Potrzebna jest domena aktywności społecznościowych („Centrum Aktywności”)
z jasnym właścicielem danych i adapterem Discord, bez przenoszenia reguł
biznesowych do gateway ani Authorization.

## Decyzja (Proposed — wymaga Accepted po P4-D\*)

1. **Centrum Aktywności jest pierwszym pionem produktowym Discord** po P3:
   stały panel + operacje aktywności zgodne z P3-D3.
2. **Właścicielem danych aktywności jest osobna usługa domenowa** (roboczo
   `community-service`; finalna nazwa = P4-D3), z osobną bazą PostgreSQL i
   kontem DB. Żadna inna usługa nie czyta tej bazy.
3. **`discord-gateway` jest wyłącznie adapterem UI/transportu Discord**
   (Components V2, signed custom IDs, mapowanie interakcji). Nie jest SoT
   aktywności.
4. **`authorization-service` pozostaje SoT decyzji allow/deny.** Mutacje
   aktywności wymagają permission IDs V2 (katalog minimalny = P4-D7).
5. **Tożsamość aktora na Discordzie:** stabilny Discord User ID; WWW login nie
   jest wymagany dla zwykłych operacji Centrum (P3-D3). Późniejsze powiązanie
   z V2 User nie duplikuje autorstwa (P3-D2).
6. **Zakres v1 i pierwszy typ aktywności** nie są ustalane w tym ADR —
   wyłącznie przez P4-D1/D2 właściciela.
7. **Widoczne assety UX** (kolor modułu, emoji, banner, copy) wymagają
   checkpointu Issue #12 / P4-D8 przed implementacją UI.
8. **Implementacja kodu** dopiero po: Accepted tego ADR (lub następcy),
   APPROVED planu P4, merge P3 do `main`, briefie `READY_FOR_CURSOR`.

## Alternatywy odrzucone na poziomie fundamentu (nie wymagają P4-D\*)

| Alternatywa                           | Powód odrzucenia                                           |
| ------------------------------------- | ---------------------------------------------------------- |
| Logika aktywności w `discord-gateway` | Łamie ADR-0001 / warstwy; uniemożliwia WWW/Desktop później |
| Dane aktywności w `authorization`     | Authz = dostęp, nie produkt                                |
| Dane aktywności w `identity`          | Identity = tożsamość/sesje                                 |
| Reakcje emoji jako nawigacja Centrum  | D-023 / UX standard                                        |

## Konsekwencje

- Konieczna nowa usługa + baza + izolacja Compose/CI (po Accepted i briefie).
- Katalog permissions produktu musi powstać minimalnie dla v1 (P4-D7).
- Panel testowy P1 (`/panel-test`) **nie** staje się produkcyjnym Centrum;
  Centrum dostaje osobny flow publikacji (P4-D6).
- Stary projekt pozostaje wyłącznie referencją wzorców UX, nie architektury.

## Zastąpienie

Nie zastępuje ADR-0013. Doprecyzowuje katalog usług z ADR-0001 o pierwszą
domenę community/activity po fundamencie dostępu.
