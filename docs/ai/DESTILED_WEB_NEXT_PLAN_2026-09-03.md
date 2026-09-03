# DESTILED Web + Discord — plan dalszej implementacji

Stan: `preview/destiled-web` @ tip po merge PR #48 (2026-09-03).  
SoT luk: `docs/ai/DESTILED_GAP_AUDIT_2026-09-03.md`.  
Kontrakty: D-038–D-061, `TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md`,
`DISCORD_POST_INTERACTION_STANDARD.md`.

## Cel docelowy

Jeden spójny tor dla zespołu PH:

1. Web = źródło prawdy o workspace / postaciach / EQ / cyklach PH / respawnach.
2. Discord bot = dostawa przypomnień i paneli (Components V2), nie drugi store.
3. Identity + Authorization = kto może czytać / mutować / dostawać DM.
4. Czas serwera + idempotencja = bez dubli przy retry Discord / wielu urządzeniach.

Dziś: **mocny mock Web (localStorage)** + **bot P1 harness** (`/status`,
`/panel-test`). To się jeszcze **nie zazębia**.

---

## Już zrobione (Web mock / preview)

| Obszar | Stan |
| --- | --- |
| Discord entry (symulowane outcome) | OK |
| Workspace → postać → EQ / notatki / historia | OK (localStorage) |
| Wiele setów EQ (`Dodaj set`) | OK |
| Timery respawnu `/timers` vs Postęp PH na karcie | OK |
| 8 cykli PH + ikony Metin2 | OK |
| Katalog EQ + ikony wiki | OK |
| Class×gender Desert Warrior 8/8 | OK (DEC-065) |
| Atlasy map top-down | OK (lochy małp = schemat) |
| Preview branch na Zeabur | Push na `preview/destiled-web` |

---

## Faza A — domknięcie jakości Web (bez nowej architektury)

Kontynuacja mocka / preview. Nie wymaga DEC-001.

1. **Manual regression na Zeabur preview** — entry, create character, EQ multi-set,
   flip karty PH (8 cykli), `/timers`, honesty strip, mobile.
2. **EQ readiness vs kontrakt** — 6 stanów, „Mark as moved”, pełniejszy CRUD kart
   vs partial (gap audit B.8).
3. **Wyczyścić leftover fixtures** Asteria / fake presence, jeśli mylą ścieżkę
   `player-store`.
4. **Assety owner (opcjonalnie)** — minimapy lochów małp 1:1 z lokalnego
   `dobry-temat` (DEC-063/064).
5. **Targ / Aktywność / realtime mapy** — poza first-slice (D-049 / D-048); nie
   ruszać bez jawnego priorytetu właściciela.

**Wyjście fazy A:** Web preview „używalny lokalnie/na preview” bez kłamstwa o
produkcji.

---

## Faza B — persistence + auth (warunek spięcia z botem)

Wymaga decyzji / usług z monorepo (nie Nest w domain).

1. **Player-team (lub równoważny) API** — workspace, characters, EQ sets,
   progress timers, spawn timers, notes, history; autorytatywny czas serwera.
2. **Identity Discord OAuth prawdziwy** (ADR-0012 / Better Auth) — zamiast mock
   entry; eligibility guild / invite.
3. **Authorization** — membership workspace, kto dostaje reminder, kto mutuje EQ.
4. **Migracja z localStorage** — import jednorazowy albo „zacznij od nowa” z
   jasnym copy.

**Wyjście fazy B:** dwa urządzenia widzą ten sam workspace; Web przestaje być
jedynym źródłem w `localStorage`.

---

## Faza C — spięcie Web ↔ Discord bot (zazębienie)

Kontrakt produktu: bot **nie** wnioskuje „Done” z aktywności w grze/Discord;
tylko dostarcza reminder i przyjmuje jawne akcje (Done / Later / Can't) z
idempotentnym `operationId`.

1. **Reminder pipeline**  
   Web/API ustawia politykę → worker/gateway wysyła DM lub panel kanału →
   klik użytkownika → API mutuje timer → Web odświeża stan.
2. **Dwa rodzaje timerów (nie mieszać domen)**  
   - SpawnTimer (metiny/bossy) — `/timers`  
   - ProgressTimer / TeamAction (PH: księgi, biolog, jazda…) — karta postaci
3. **Discord UX (obowiązkowy standard)**  
   - jeden stabilny post aktualizowany w miejscu  
   - select/button/modal natywne  
   - ephemeral na błędy / prywatne  
   - stany: loading / empty / success / error / unavailable / confirm  
   - własna paleta V2 (nie kopiować FlameCode)
4. **Preferencje** — quiet hours, wyłączenie klas reminderów, revoke przy kicku
   z teamu.
5. **Bot dziś:** rozszerzać `discord-gateway` tylko po decyzji właściciela —
   nie dokładać komend „przy okazji” (gap audit C).

**Wyjście fazy C:** „oznacz wykonane” w Discord = ten sam stan co w Web; brak
dubli przy podwójnym kliku.

---

## Faza D — deploy produkcyjny / pełny stos

Blokowane przez **DEC-001** (Zeabur full-stack DEFERRED), dopóki właściciel nie
wznowi.

1. Jawne wznowienie DEC-001.
2. Osobny projekt Zeabur (nie `dobry-temat`): web + api + identity + authZ +
   discord-gateway (+ add-ony).
3. Minimalne uprawnienia bota (cofnięcie Administrator z DEC-002 na test guild).
4. Secrets / rotacja tokenów poza czatem.

Preview Web (`DESTILED Preview` / `web-preview`) może żyć wcześniej — to nie
zastępuje Fazy D.

---

## Poza zakresem bez decyzji właściciela

- Alchemy / sash (PH ich nie ma)
- Live game scrape / telemetry z klienta gry
- Centrum Aktywności P4 implementacja (spec Accepted, kod dopiero po
  `READY_FOR_CURSOR`)
- Merge do `main` bez statusu `APPROVED` na kolejny duży etap

---

## Proponowana kolejność startu (następny duży etap)

Po akceptacji właściciela (`APPROVED`):

1. **B1** — kontrakt OpenAPI player-team (workspace + progress/spawn timers + EQ)
2. **B2** — Identity Discord OAuth pod Web entry
3. **C1** — pierwszy reminder: jeden cykl PH (np. Biolog) DM → Done → sync Web
4. **C2** — SpawnTimer reminders z `/timers`
5. **A2/A4** równolegle jako dopięcia jakości preview

Bez `APPROVED` Cursor nie zaczyna Fazy B/C (konstytucja: brak samodzielnej zmiany
architektury / zakresu).

## Marker

`PLAN_WEB_BOT_JOINUP` — czekamy na priorytet właściciela (B1 vs dopięcie A).
