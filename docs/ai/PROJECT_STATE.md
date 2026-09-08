# PROJECT_STATE

## Status

`preview/destiled-web`. SoT produktu: `WEB_PRODUCT_DESIGN_AND_DELIVERY.md`.
Właściciel wznowił 2026-09-08 produkcyjne spięcie Web + Discord + backend na Zeaburze.
Aktualny priorytet runtime: prawdziwy Discord OAuth, trwały Player Team oraz niezależny collector aktywności bota.

### Technika / timery postaci — 2026-09-08

- PR #68 naprawia rozjazd między test-DM a realnym live DM: aktywny `characterTimers.messageTemplate` jest teraz rozwiązywany przy każdej wysyłce, również przez durable worker po restarcie.
- Trwałość configu Technika została potwierdzona na produkcji przez restart i pełny Zeabur redeploy; przyczyną nie był reset pliku/configu.
- CI dla `bb9fc801dfc7b78ad866944298ee41903ab212f3`: PASS (`34225187832`); pełny live Discord E2E po wdrożeniu nadal `PARTIAL`.
- `reminderMinutesBefore` wymaga osobnego pre-reminder joba i pozostaje otwartym, świadomie niewłączonym zakresem.

## Produkcja Zeabur — stan potwierdzony 2026-09-08

- `identity-service`, `webapp-dest`, `player-team-service`, `activity-service`, `authorization-service`, `api-gateway` i `discord-gateway` są po recovery bez krytycznych problemów runtime; kluczowe usługi poza celowo pozostawionym `player-workspace-service` śledzą `preview/destiled-web`. API Gateway został odzyskany natywnym `redeployService` z kanonicznego Git triggera; potwierdzony deployment `6a9fd4677b89d6943549fbb1` użył `refs/heads/preview/destiled-web` i SHA `eb66226297a57ef4401a2f35635bbbb956856272`.
- Produkcyjny auth cutover jest aktywny: `IDENTITY_INTERNAL_JWT_ENABLED=true`, `INTERNAL_JWT_CLIENT_ENABLED=true`, `PLAYER_TEAM_INTERNAL_JWT_ENABLED=true`; legacy Player Team demo write jest wyłączone.
- Identity readiness po realnym restarcie: PostgreSQL + Redis + migracja OK; JWKS działa z aktywnym `kid`.
- Publiczny auth probe po recovery: `/identity/me` bez sesji → 401; `/player-team/v1/me/state` bez sesji → 401; start Discord OAuth → 302 do `discord.com` + state cookie.
- Pełny login użytkownika pozostaje `PARTIAL` wyłącznie dlatego, że zgoda Discord OAuth wymaga działania prawdziwego użytkownika. Po autoryzacji trzeba potwierdzić callback → session → internal JWT → Player Team write → DB → restart/reload → read.
- `discord-gateway` jest `ready`, ma 3 guildie w cache i działa niezależnie od Web. Collector nasłuchuje bezpośrednio `MessageCreate` i `VoiceStateUpdate`.
- Dane collectora i Technika są teraz na persistent volume `discord-gateway-data` zamontowanym pod `/data`; restart proof potwierdził zachowanie configu, `collectorStartedAt` i liczników.
- Publiczny E2E po recovery potwierdził już realne niezerowe dane collectora: 6 członków, 12 wiadomości i 34 min voice. Osobny proof `niezerowe liczniki → restart gateway → te same liczniki` nadal pozostaje do wykonania, jeśli chcemy domknąć również ten dodatkowy dowód trwałości.
- Dług architektoniczny: daily member-activity buckets są obecnie trwałe na volume Gateway, ale ADR-0014 wskazuje `activity-service` jako docelowe SoT danych Activity. Migracja do bazy Activity jest osobnym etapem.
- Finalny audyt po recovery: 14 usług, `critical=0`, `warning=1`, `info=8`; jedyny warning to niegroźny stale typo env `UTHORIZATION_ASSERTION_AUD` obok poprawnego `AUTHORIZATION_ASSERTION_AUD` w Discord Gateway, a pozostałe informacje dotyczą m.in. starych generated host keys i świadomie pozostawionego legacy branchu `player-workspace-service`.
- Regresja Zeabura jest zamknięta: ręczne `deploy(..., vars)` i `deploy(..., gitRef)` są niekanoniczne dla tych GitHub-services i nie należy ich używać do recovery. `api-gateway` odzyskano przez `redeployService(serviceID, environmentID)` korzystający z istniejącego `gitTrigger` (`repoID=1323125581`, `branchName=preview/destiled-web`). Trwałe `API_GATEWAY_CORS_ORIGINS` i `IDENTITY_TRUSTED_ORIGINS` poprawiono osobno przez `updateEnvironmentVariable`, bez ręcznego deploymentu z vars. Publiczny E2E po naprawie przeszedł: web 200, Identity ready/JWKS 200, właściwe 401 dla anonimowych endpointów, OAuth 302 do Discorda, Gateway `ready` bez `lastError`.

Szczegóły dowodów i run IDs: `docs/ai/FIX_LOG.md`.

## Latest owner direction (2026-09-03)

- **DEC-066/067:** Timery ≠ Party — dopięte + spójność (osobny widok mapy Party,
  cross-linki, prune pinezek).
- **Timery UX:** Zbite → mini-mapa pinezki; zbity cel zjeżdża do sekcji
  odliczania; CH podświetla się w ostatnich 20% okna na innym kanale; ikony
  metin/boss (SVG z katalogu) + kontrast list.
- **EQ camp:** inventory siatka (Metin2-like, nielimitowana) w centrum; postacie
  wokół z 8 slotami; drag/tap; tryb Timery PH + Start timer (running zablokowany);
  tło w stylu app (nie czarne); edycja bonusów z dumpa / obserwacji.
- **EQ (katalog):** dump `dobry-temat-item-catalog.json` = 1:1 `wiki_catalog.json`
  ze starej app (678 pozycji). Wyszukiwanie przy dodawaniu: cała baza EQ (bez
  ukrywania innych klas), tokeny + skróty wiki (`Zbr. Płyt.`), kategoria/slot
  ustawiana automatycznie po wyborze z listy (bez ręcznego selecta).
- **EQ (bonusy):** przy dodawaniu przedmiotu wybierasz subset bonusów z katalogu
  (w UI „kliknij”), a zapisane bonusy są traktowane jako „explicit” (nie nadpisujemy
  ich pełną drabinką z katalogu).
- **EQ (źródło bonusów):** dołączony `wiki-item-bonus-overrides.json` (pobrany z
  API pl-wiki Metin2, bez zgadywania) i podpięty jako nadrzędne źródło drabinek
  bonusów dla kart EQ.
- **DEC-068:** pełne drabinki bonusów wymagają nieuciętego dumpa / starego app.
- **Online persistence (MVP):** `player-team-service` z pełnym SQL schema (migracje), OpenAPI v1, ADR-0015; produkcyjny internal-JWT auth aktywny od 2026-09-08, pełny write E2E po realnym OAuth nadal do potwierdzenia.
- **Wyglądy postaci:** 4 serie kostiumów (Desert / Black Desert / Azrael / Ice Dragon Guard),
  wybór w formularzu profilu; karty używają `appearanceLook` + znormalizowane PNG 272×360.
- **Postacie / skład:** na `/characters` przycisk **Edycja składu** (edycja profilu + usuwanie /
  soft-archive karty ze składu).
- **Nawigacja Zespół:** „Moje przestrzenie” → **Zespół**. Hub notatek, zmian, akcji i uwagi;
  dodawanie postaci tylko w module Postacie. Pulpit = konto / pierwsze uruchomienie.

## Marker

`PRODUCTION_RUNTIME_STABILIZATION` + `API_GATEWAY_RECOVERED` + `ZEABUR_CANONICAL_REDEPLOY_CONFIRMED` + `REAL_OAUTH_USER_PROOF_PENDING` + `DEC-066` + `DEC-067` + `DEC-068`
