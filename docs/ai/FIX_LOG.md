# V2 — FIX LOG / REJESTR POPRAWEK

> **PRIORYTET OPERACYJNY:** ten plik jest obowiązkowym źródłem ciągłości prac dla ChatGPT, Cursor, Codex i kolejnych sesji/agentów pracujących nad V2.
>
> **Zasada bez wyjątków:** żadna poprawka, naprawa, hotfix, zmiana integracyjna, poprawka deploymentu ani usunięcie blockera nie jest uznane za zakończone, dopóki nie zostanie zapisane tutaj.

## Jak używać tego pliku

Przed rozpoczęciem jakiejkolwiek pracy nad repo:

1. przeczytaj `AGENTS.md`;
2. przeczytaj **ten plik w całości od najnowszych wpisów**;
3. sprawdź, czy aktualny problem nie był już naprawiany wcześniej;
4. nie cofaj wcześniejszej poprawki bez jawnego powodu i odnotowania regresji;
5. po każdej wykonanej poprawce dopisz nowy wpis;
6. przed zakończeniem zadania sprawdź, czy wpis zawiera wynik walidacji i stan deploymentu/runtime.

## Co MUSI znaleźć się we wpisie

Każdy wpis powinien zawierać, jeśli dotyczy:

- **data i czas**;
- **obszar / moduł**;
- **objaw / problem**;
- **przyczyna źródłowa** — jeśli została potwierdzona;
- **wykonana poprawka**;
- **zmienione pliki**;
- **commit / PR**;
- **walidacja**: typecheck, lint, test, build, CI;
- **deployment**: czy wdrożono i na jaki SHA;
- **runtime / E2E**: co faktycznie sprawdzono po wdrożeniu;
- **pozostałe ryzyka / rzeczy niepotwierdzone**;
- **status**: `DONE`, `PARTIAL`, `BLOCKED`, `REGRESSION`.

Nie wpisuj `DONE`, jeśli potwierdzono tylko ekran, HTTP 200, zielony test jednostkowy albo sam deployment. Dla funkcji produkcyjnych należy, gdy jest to technicznie możliwe, potwierdzić pełny przepływ:

`WWW → API → DB → reload/restart → API → WWW`

oraz dla integracji Discord:

`WWW/API → bot/gateway → Discord`.

---

# Wpisy

## 2026-09-08 — Player Team persistence: przejście z demo-header auth na Identity internal JWT

- **Status:** `PARTIAL`
- **Obszar:** `apps/web`, `services/player-team-service`, Identity integration, persistence auth.
- **Problem:** produkcyjny zapis Player Team nadal opierał się na kompatybilności z `x-demo-viewer-id`, mimo że repo posiadało już mechanizm Identity internal JWT.
- **Przyczyna:** web proxy wyprowadzał Discord ID z sesji Identity, ale przekazywał go dalej przez legacy header; `player-team-service` nie weryfikował Identity-issued JWT.
- **Poprawka:** web proxy potrafi wystawić short-lived Identity internal JWT przy użyciu istniejącego klienta `v2.api-gateway`; `player-team-service` weryfikuje podpis EdDSA/JWKS, issuer, audience i lifetime przed zaakceptowaniem serwerowego Discord ID. Zachowano Discord snowflake jako klucz istniejących danych, aby uniknąć migracji/utraty zapisów. Legacy header pozostaje wyłącznie jako jawny tryb kompatybilności, gdy internal JWT nie jest aktywowany zmiennymi środowiskowymi.
- **Zmienione pliki:**
  - `apps/web/app/player-team/[...path]/route.ts`
  - `services/player-team-service/src/infrastructure/config/player-team-env.ts`
  - `services/player-team-service/src/interface/player-team.controller.ts`
- **PR:** `#61 fix(player-team): cut persistence auth over to Identity JWT`
- **Merge SHA:** `cc3943e1e9e51976f5e2113ce5f0e6672838c52c`
- **Walidacja:** TypeScript przeszedł dla `web` i `player-team-service`; infra integration i secret scan przeszły. Pierwszy production build został zablokowany przez wcześniejszy, niezwiązany błąd ESLint w `player-team-workspace-live-api.ts`.
- **Deployment:** Zeabur wdrożył merge SHA, ale finalny zielony build/deploy jest opisany w następnym wpisie.
- **Niepotwierdzone:** rzeczywiste aktywowanie `INTERNAL_JWT_CLIENT_ENABLED` / `PLAYER_TEAM_INTERNAL_JWT_ENABLED` w konfiguracji Zeabura i pełny przepływ zapisu z prawdziwą sesją Discord.

## 2026-09-08 — Produkcyjny build web: usunięcie `no-unsafe-return` w workspace live API

- **Status:** `DONE` dla build/deploy; runtime funkcjonalny nadal wymaga osobnych testów E2E.
- **Obszar:** `apps/web/src/player-team-workspace-live-api.ts`, CI, Zeabur deployment.
- **Problem:** `pnpm typecheck` przechodził, ale `pnpm build` kończył się błędem ESLint `@typescript-eslint/no-unsafe-return` w trzech callbackach `response.text().catch(...)`.
- **Przyczyna:** callback `.catch()` na Promise był inferowany w sposób powodujący unsafe return podczas lintowania wykonywanego przez Next production build.
- **Poprawka:** zastąpiono problematyczne inline `.catch()` bezpiecznym helperem zwracającym jawnie `Promise<string>`.
- **Zmieniony plik:** `apps/web/src/player-team-workspace-live-api.ts`.
- **Commit / final deployment SHA:** `350891f10a037b73edcca670a508de693e96ba20`.
- **Walidacja:** `pnpm typecheck` PASS; `pnpm build` PASS; production dependency audit PASS; infrastructure integration PASS; secret scan PASS.
- **Deployment:** Zeabur — `Deployed successfully` dla SHA `350891f10a037b73edcca670a508de693e96ba20`.
- **Runtime:** sam deployment potwierdzony; pełny Discord OAuth → session → Player Team write → DB → reload/restart → read nadal wymaga osobnego potwierdzenia.

---

## Szablon nowego wpisu

```md
## YYYY-MM-DD HH:MM — Krótka nazwa poprawki

- **Status:** `DONE | PARTIAL | BLOCKED | REGRESSION`
- **Obszar:**
- **Problem:**
- **Przyczyna:**
- **Poprawka:**
- **Zmienione pliki:**
- **Commit / PR:**
- **Walidacja:**
- **Deployment:**
- **Runtime / E2E:**
- **Niepotwierdzone / ryzyka:**
```
