# ADR-0014: Granica Centrum Aktywności (P4)

- **Status:** Accepted
- **Data:** 2026-08-06 (zamknięcie blockerów `P4-FINAL-SPEC-CLOSURE-001`)
- **Task:** `P4-FINAL-SPEC-CLOSURE-001` (PR **#18 merged** → `8c1b095`)
- **Depends on:** ADR-0001, ADR-0007, ADR-0013 (P3), Discord UX standard,
  product spec Centrum Aktywności

## Kontekst

Po P2/P3 potrzebny jest bounded context aktywności (Centrum Aktywności) z
osobną bazą, bez RBAC równoległego do Authorization i bez logiki w gateway.

## Decyzja

1. **Właściciel danych:** `activity-service` (`@v2/activity-service`), baza
   PostgreSQL `activity`. Nazwa domeny i kontraktów: **activity**. Żadna inna
   usługa nie czyta tej bazy. Odrzucone: `community-service` jako szeroki worek
   oraz trzymanie danych w gateway/authz/identity.
2. **Adaptery:** `discord-gateway` / `web` / `admin` — bez reguł biznesowych
   aktywności jako SoT.
3. **Authorization** pozostaje jedynym SoT allow/deny. Katalog permission IDs
   P4 jest Accepted (patrz architecture §13 / P4-D7).
4. **Tożsamość Discord:** Discord User ID; WWW login nie jest wymagany dla
   zwykłych operacji Discord (P3-D3).
5. **Transport (P4-D5 Accepted):** P4.1–P4.2 = sync HTTP + service assertion /
   user context + obowiązkowe idempotency keys + PostgreSQL transactional
   outbox + claim/lease + retry/backoff. RabbitMQ nie w P4.1; od P4.5 (lub
   wcześniej przy realnym multi-consumer). Domena nie zależy od brokera.
6. **Panel (P4-D6 Accepted):** trwały rekord + publish occurrence z
   deterministic Discord `nonce` (`enforceNonce: true`) + reconcile adopt
   po `panel_id` w custom_id — bez obietnicy „brak duplikatu” wyłącznie z
   SELECT FOR UPDATE (szczegóły architecture §12).
7. **Assety (Issue #12):** nie blokują P4.1 ani testowego P4.2a (native
   Components V2 bez dekoracyjnego bannera). Blokują produkcyjny visual
   sign-off.
8. **Implementacja kodu:** po briefie `READY_FOR_CURSOR`. P3 scalone
   (`1f23635`, PR #16). Spec P4 scalona (`8c1b095`, PR #18).

## Alternatywy odrzucone

| Alternatywa                | Powód                                |
| -------------------------- | ------------------------------------ |
| `community-service`        | zbyt szeroki kontekst                |
| Logika w `discord-gateway` | ADR-0001                             |
| Dane w authz/identity      | złe ownership                        |
| Lokalny RBAC activity      | koliduje z P3                        |
| RabbitMQ od P4.1           | brak konsumentów; koszt bez wartości |
| Send→DB bez nonce/adopt    | crash window duplikatów              |

## Konsekwencje

- Compose/init: rola+DB `activity`.
- Etapy P4.1–P4.6; P4.1 = domain/contracts/outbox core bez Discord UI.
- Kontrakt wizualny ze screenshotem referencyjnym: osobny UX doc (gdy obraz
  dostępny w środowisku agenta).

## Zastąpienie

Nie zastępuje ADR-0013. Doprecyzowuje katalog usług z ADR-0001.
