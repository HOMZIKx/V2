# Cursor / Agent → Owner

## EQ / inventory — PR #72

- Nowy widok: `Założone` + `Torba`, zakładki `Torba I`, `Torba II`, `Magazyn`, większa siatka, panel szczegółów i ręczne zarządzanie.
- Persistence pozostaje w istniejącym Player Team snapshot sync; nie dodano równoległego storage ani migracji.
- Screenshot import jest pojedynczym tooltipem i zawsze kończy się draftem do korekty; zapis dopiero po `Potwierdź i dodaj`.
- `dobry-temat-item-catalog.json` już zawiera wpisy `Ulepszacze`; nie importować ponownie.
- CI #34244943904 PASS. Zeabur audit #34245160534: `webapp-dest` działa na preview, ale brak `OPENAI_API_KEY`, więc analiza screena pozostaje runtime `PARTIAL` do dodania klucza.

## Technika / timery postaci — PR #68

- Root cause: live character-timer DM ignorował `characterTimers.messageTemplate`, mimo że config był poprawnie zapisywany/aktywowany i test-DM go używał.
- PR #68 został zmergowany metodą rebase do `preview/destiled-web`; produkcyjny SHA to `1126e7ead0649f0b6a78f3d669b847b85d096d2f`. Fix podpina aktywny template do normalnego notify/reset oraz canonical durable workera i rozwiązuje config w chwili wysyłki.
- Legacy map/metin formatter pozostaje nietknięty.
- Finalny PR CI `34225696704` PASS; post-merge CI `34226072593` PASS. Zeabur deployment `6a9ffef87b89d694354a08b5` działa na dokładnym SHA `1126e7e…` ze statusem `RUNNING`.
- Runtime proof jest zamknięty: Technika persistence po merge `34227126328` PASS; public E2E `34227377285` ma Gateway `ready` bez `lastError`; realny character-timer `/notify/timer` → Discord DM `34227810076` zwrócił HTTP `201`, `delivery=dm` i prawdziwy `messageId`. Fix live template runtime = `DONE`. Produkcyjny template jest obecnie defaultowy; nie mutowano configu tylko po to, by wymusić sztuczny marker custom-template.
- `reminderMinutesBefore` nadal nie realizuje pre-remindera; nie przesuwać istniejącego due joba wcześniej, bo worker oznacza timer jako ready.

## Status — 2026-09-08 produkcyjna stabilizacja

### Discord OAuth / Identity / Player Team

- Produkcyjny internal JWT cutover jest aktywny: Identity issuance, Web client i Player Team verification mają komplet wymaganych envów.
- Legacy `PLAYER_TEAM_ALLOW_DEMO_WRITE` jest wyłączone; anonimowy `/player-team/v1/me/state` zwraca 401.
- Identity `/health/ready` potwierdza PostgreSQL, Redis i migrację; JWKS działa z aktywnym `kid`.
- OAuth start z `https://desapp.zeabur.app` zwraca 302 do `discord.com` i ustawia state cookie.
- `API_GATEWAY_CORS_ORIGINS` i `IDENTITY_TRUSTED_ORIGINS` są zapisane trwale z poprawnym `https://v2-web.zeabur.app`; wcześniejszy błędny `https//v2-web.zeabur.app` został usunięty z aktywnej konfiguracji przez `updateEnvironmentVariable`.
- `api-gateway` został odzyskany ze stanu `SUSPENDED` natywną mutacją Zeabur `redeployService` z istniejącego Git triggera `preview/destiled-web`. Recovery deployment `6a9fd4677b89d6943549fbb1` uruchomił commit `eb66226297a57ef4401a2f35635bbbb956856272` i osiągnął `RUNNING`.
- Dla tych GitHub-services nie używać jako recovery ręcznych `deploy(..., vars)` ani `deploy(..., gitRef)`: pierwszy wariant wywołał regresję runtime, drugi rozwiązywał source do `main`. `cicdSources`/`triggerCICDSource` również nie odpowiada temu legacy Git source — globalna i owner-scoped lista źródeł była pusta.
- Identity oraz Player Team zostały wcześniej osobno zrestartowane przez Zeabur GraphQL `restartService`; po restartach audyt produkcji i publiczny auth probe nadal przechodzą.
- Brakujący dowód: realny użytkownik musi zatwierdzić Discord OAuth. Dopiero wtedy można wykonać finalny proof callback → session → internal JWT → Player Team PUT → DB → restart/reload → GET.

### Aktywność Discord

- Bot zbiera aktywność niezależnie od WWW: bezpośrednio z `MessageCreate` i `VoiceStateUpdate`.
- Poprzednio dane były na efemerycznym filesystemie kontenera.
- `discord-gateway` ma persistent volume `discord-gateway-data` pod `/data` i `DISCORD_GATEWAY_DATA_DIR=/data`.
- Restart proof (`34198415994`) potwierdził realny restart procesu oraz zachowanie configu Technika, `collectorStartedAt` i liczników.
- Bot po restarcie: `ready`, 3 guildie w cache, komendy zarejestrowane, brak runtime error.
- Publiczny E2E po API recovery ma już realne niezerowe dane: 6 członków, 12 wiadomości, 34 min voice. Osobny proof `niezerowe liczniki → ponowny restart → te same niezerowe liczniki` nie był jeszcze wykonywany.
- Dług: zgodnie z ADR-0014 docelowym SoT Activity powinien być `activity-service`; volume jest bieżącym zabezpieczeniem produkcyjnym przed resetami, nie końcową migracją domenową.

### Produkcyjny audyt

- Finalny audyt po API recovery: 14 usług, `critical=0`, `warning=1`, `info=8`.
- Główne usługi runtime są na właściwym `preview/destiled-web`; `player-workspace-service` pozostaje celowo na legacy branchu, bo jego źródło nie istnieje na preview.
- Pozostał jeden warning: stale typo env `UTHORIZATION_ASSERTION_AUD` w Discord Gateway obok poprawnego klucza. Nie wpływa na działanie; usunięcie zmiennej jest operacją kasującą i nie było potrzebne do naprawy.
- Finalny public E2E run `34210146628` zakończył się PASS: web live 200; Identity ready 200/status ok; JWKS 200 z `kid`; unauth Identity i Player Team 401; OAuth 302 do `discord.com`; Discord Gateway 200/ready/isolation OK/3 guildie/commands registered; member-activity 200 z 6 członkami, 12 wiadomościami i 34 min voice.
- Zeabur CLI `service restart --service-name` jest obecnie niekompatybilne z aktualnym CLI; skuteczne restarty wykonano przez GraphQL `restartService`.

Pełne run IDs, commity i statusy są w `docs/ai/FIX_LOG.md`.

---

## Poprzedni raport Web — 2026-09-03

Dopięta spójność Timery ↔ Party oraz EQ camp wg follow-upów właściciela.

### Timery (`/timers`)

- **Zbite** otwiera mini-okno z mapą (pinezka opcjonalna).
- Zbity cel **nie znika** — zjeżdża do „Odliczanie” z clockiem.
- Ostatnie **20% okna** na innym CH → podświetlenie kanału + banner.
- Ikony boss/metin (wygenerowane z katalogu; realne sprite’y można podmienić).
- Wyższy kontrast nazw, czasów i przycisków.

### Party (`/maps`)

- Twój wybór mapy = **widok osobisty** (nie nadpisuje mapy party automatycznie).
- Przyciski: skocz do mapy party / ustaw mój widok jako mapę party.
- Pinezki skauta TTL ~10 min + prune z localStorage.
- Cross-link do Timerów.

### EQ (karta postaci / obóz)

- Centrum = **inventory** (siatka slotów, dowolna liczba kart).
- Postacie wokół: max 8 slotów EQ; drag lub tap (mobile).
- Tryb Timery PH: timery PH, Start = jeden klik, running zablokowany, Dodaj timer.
- Tło jak reszta app (nie czarne).
- Katalog EQ = 1:1 dump dobry-temat `wiki_catalog` (678). Wyszukiwarka przy
  dodawaniu przeszukuje całą bazę EQ (także inne klasy — oznaczone), toleruje
  skróty wiki i odmiany („czarna stal”); **kategoria/slot tylko z katalogu**
  (select usunięty).
- Bonusy: nazwy wyłącznie z dumpa + ręczna obserwacja; przy dodawaniu przedmiotu
  wybierasz subset bonusów z katalogu (klik) i zapisane linie są traktowane jako
  „explicit” (nie nadpisujemy ich pełną drabinką); **DEC-068** — pełne drabinki
  po dostarczeniu nieuciętego eksportu ze starego dobry-temat.
- Źródło drabinek: `wiki-item-bonus-overrides.json` z publicznego API pl-wiki
  Metin2 (`action=parse`/`wikitext`) jako nadrzędne dane nad uciętym dumpem.

### Zespół (dawniej „Moje przestrzenie”)

- Nav: **Zespół**. Przegląd = zmiany, notatki, akcje, członkowie, gotowe timery.
- Postacie / EQ nie są już siatką na tej stronie — skład w `/characters`.

## Marker

`PRODUCTION_RUNTIME_STABILIZED` + `API_GATEWAY_RECOVERED` + `REAL_OAUTH_USER_PROOF_PENDING`