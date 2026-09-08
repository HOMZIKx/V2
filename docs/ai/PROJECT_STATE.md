# PROJECT_STATE

## Status

`preview/destiled-web`. SoT produktu: `WEB_PRODUCT_DESIGN_AND_DELIVERY.md`.
Właściciel wznowił 2026-09-08 produkcyjne spięcie Web + Discord + backend na Zeaburze.
Aktualny priorytet runtime: prawdziwy Discord OAuth, trwały Player Team oraz niezależny collector aktywności bota.

## Produkcja Zeabur — stan potwierdzony 2026-09-08

- `identity-service`, `webapp-dest`, `player-team-service`, `activity-service`, `authorization-service`, `api-gateway` i `discord-gateway` były potwierdzone jako `RUNNING` na świeżym automatycznym Git deploymencie `e31b81bac1762df3ed3971abb06364ed1d9a9770`; kluczowe usługi poza celowo pozostawionym `player-workspace-service` śledzą `preview/destiled-web`.
- Produkcyjny auth cutover jest aktywny: `IDENTITY_INTERNAL_JWT_ENABLED=true`, `INTERNAL_JWT_CLIENT_ENABLED=true`, `PLAYER_TEAM_INTERNAL_JWT_ENABLED=true`; legacy Player Team demo write jest wyłączone.
- Identity readiness po realnym restarcie: PostgreSQL + Redis + migracja OK; JWKS działa z aktywnym `kid`.
- Publiczny auth probe po restartach: `/identity/me` bez sesji → 401; `/player-team/v1/me/state` bez sesji → 401; start Discord OAuth → 302 do `discord.com` + state cookie.
- Pełny login użytkownika pozostaje `PARTIAL` wyłącznie dlatego, że zgoda Discord OAuth wymaga działania prawdziwego użytkownika. Po autoryzacji trzeba potwierdzić callback → session → internal JWT → Player Team write → DB → restart/reload → read.
- `discord-gateway` jest `ready`, ma 3 guildie w cache i działa niezależnie od Web. Collector nasłuchuje bezpośrednio `MessageCreate` i `VoiceStateUpdate`.
- Dane collectora i Technika są teraz na persistent volume `discord-gateway-data` zamontowanym pod `/data`; restart proof potwierdził zachowanie configu, `collectorStartedAt` i liczników.
- Ranking aktywności w chwili proof miał 0 członków / 0 wiadomości / 0 minut voice. Do proof niezerowych liczników potrzebny jest realny event człowieka na Discordzie, a następnie ponowny restart/check.
- Dług architektoniczny: daily member-activity buckets są obecnie trwałe na volume Gateway, ale ADR-0014 wskazuje `activity-service` jako docelowe SoT danych Activity. Migracja do bazy Activity jest osobnym etapem.
- Audyt produkcji po restartach: 14 usług, `critical=0`; pozostał niegroźny stale typo env `UTHORIZATION_ASSERTION_AUD` obok poprawnego `AUTHORIZATION_ASSERTION_AUD` w Discord Gateway oraz informacyjne stare generated host keys.
- Dalszy audyt Zeabur ujawnił, że `API_GATEWAY_CORS_ORIGINS` i `IDENTITY_TRUSTED_ORIGINS` w automatycznym Git snapshotcie nadal zawierały stale `https//v2-web.zeabur.app`. Próba wymuszenia ręcznego `deploy(..., vars)` spowodowała regresję runtime (`api-gateway=SUSPENDED`, `identity-service=CRASHED`) i została odrzucona. Identity odzyskano automatycznym Git rolloutem. Ręczne `deploy(..., gitRef)` również jest niekanoniczne dla tego GitHub-service: mimo podawanego preview/SHA rozwiązywało source do head `main` (`a871959...`); oba takie buildy API zostały anulowane przed aktywacją. Dla `api-gateway` odświeżono oficjalny Git trigger do `repoID=1323125581`, `branchName=preview/destiled-web`; ten commit jest celowym GitHub push, który ma odtworzyć API poprawną ścieżką integracji GitHub → Zeabur. Po rolloutcie wymagane są ponowny env audit i public E2E. Trwałe źródło dwóch stale originów pozostaje osobnym blockerem operacyjnym do wyjaśnienia po przywróceniu pełnego runtime.

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

`PRODUCTION_RUNTIME_STABILIZATION` + `REAL_OAUTH_USER_PROOF_PENDING` + `ZEABUR_ORIGIN_SOURCE_BLOCKER` + `DEC-066` + `DEC-067` + `DEC-068`
