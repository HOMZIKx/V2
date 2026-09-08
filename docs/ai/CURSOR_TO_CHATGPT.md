# Cursor / Agent → Owner

## Status — 2026-09-08 produkcyjna stabilizacja

### Discord OAuth / Identity / Player Team

- Produkcyjny internal JWT cutover jest aktywny: Identity issuance, Web client i Player Team verification mają komplet wymaganych envów.
- Legacy `PLAYER_TEAM_ALLOW_DEMO_WRITE` jest wyłączone; anonimowy `/player-team/v1/me/state` zwraca 401.
- Identity `/health/ready` potwierdza PostgreSQL, Redis i migrację; JWKS działa z aktywnym `kid`.
- OAuth start z `https://desapp.zeabur.app` zwraca 302 do `discord.com` i ustawia state cookie.
- Trusted origins/CORS zostały znormalizowane i zapisane na Zeaburze; API Gateway + Identity zostały redeployowane.
- Identity oraz Player Team zostały osobno zrestartowane przez Zeabur GraphQL `restartService`; po restartach audyt produkcji i publiczny auth probe nadal przechodzą.
- Brakujący dowód: realny użytkownik musi zatwierdzić Discord OAuth. Dopiero wtedy można wykonać finalny proof callback → session → internal JWT → Player Team PUT → DB → restart/reload → GET.

### Aktywność Discord

- Bot zbiera aktywność niezależnie od WWW: bezpośrednio z `MessageCreate` i `VoiceStateUpdate`.
- Poprzednio dane były na efemerycznym filesystemie kontenera.
- `discord-gateway` ma teraz persistent volume `discord-gateway-data` pod `/data` i `DISCORD_GATEWAY_DATA_DIR=/data`.
- Restart proof (`34198415994`) potwierdził realny restart procesu oraz zachowanie configu Technika, `collectorStartedAt` i liczników.
- Bot po restarcie: `ready`, 3 guildie w cache, komendy zarejestrowane, brak runtime error.
- W czasie testu ranking nadal miał 0 członków / 0 wiadomości / 0 minut voice; do dowodu niezerowej trwałości potrzebny jest jeden prawdziwy event człowieka, potem ponowny restart/check.
- Dług: zgodnie z ADR-0014 docelowym SoT Activity powinien być `activity-service`; volume jest bieżącym zabezpieczeniem produkcyjnym przed resetami, nie końcową migracją domenową.

### Produkcyjny audyt

- Po restartach: 14 usług, `critical=0`.
- Główne usługi runtime są `RUNNING` i na `preview/destiled-web`; `player-workspace-service` pozostaje celowo na legacy branchu, bo jego źródło nie istnieje na preview.
- Pozostał jeden warning: stale typo env `UTHORIZATION_ASSERTION_AUD` w Discord Gateway obok poprawnego klucza. Nie wpływa na działanie; usunięcie zmiennej jest operacją kasującą i nie było potrzebne do naprawy.
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

`PRODUCTION_RUNTIME_STABILIZATION` + `REAL_OAUTH_USER_PROOF_PENDING`
