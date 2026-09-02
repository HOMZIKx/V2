# TEST Discord live runtime report

Task: `V2-CURRENT-PRODUCT-LIVE-ACCEPTANCE-AND-REPAIR-004`
Date: **2026-09-01** (session ~22:45 UTC+2)
Guild: `1534228693017432124` (TESTOWY)

**No secrets in this document.**

---

## Summary

| Field                                | Value                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| **RUNTIME_STATUS**                   | `NOT_TEST_DISCORD_RUNTIME_VERIFIED`                                              |
| **CURRENT_PRODUCT_TECHNICAL_STATUS** | `READY_FOR_OWNER_LIVE_ACCEPTANCE`                                                |
| **CODE_TIP**                         | see `CURRENT_PRODUCT_LIVE_ACCEPTANCE_SHA`                                        |
| **ZEABUR_API_SHA**                   | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4` (api-gateway health; redeploy queued) |
| **ZEABUR_WEB_SHA**                   | `510b262206ae413b228ee546ffa93b0e931e829c` (OCI upload build)                    |

---

## Acceptance markers (2026-09-01 ~22:45)

| Marker               | Result      | Evidence                                                                                                                             |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| CI_INFRA             | **PASS***   | `db-isolation.test.ts` readiness wait + 15s targeted timeout (`84ba31c`); confirm on GitHub                                          |
| CI_QUALITY           | **PASS***   | Identity coverage ≥62% + lint fixes; local `pnpm validate` except VERSION_DRIFT                                                      |
| CI_SECRET_SCAN       | **PASS***   | Prior CI green; re-verify on GitHub after push                                                                                       |
| PR_TITLE             | **PASS***   | Conventional PR title on #19                                                                                                         |
| OUTBOX_STUCK         | **PASS**    | `v2-api.zeabur.app/health/ready` → `failed=0`, `state=idle`, `delivered=7`                                                           |
| AUTO_SYNC_SMOKE      | **PASS**    | Może będę → outbox `delivered` 5→7                                                                                                   |
| PROFILE_LIVE_SMOKE   | **PASS**    | Hub select + Mój profil (`live-product-smoke.mts`)                                                                                   |
| LFG_LIVE_SMOKE       | **PASS**    | Hub Szukam ekipy + WWW `/szukam-ekipy` LFG UI (org id fixed)                                                                         |
| RECOVERY_SMOKE       | **PASS**    | discord-gateway restart → single hub `1544034743614570589`                                                                           |
| WWW_MEMBER_SMOKE     | **PASS**    | All 6 routes HTTP 200; session PanaPas3k: `/aktywnosci` (Azrael), `/moje`, `/dla-mnie`, `/powiadomienia`, `/profil`, `/szukam-ekipy` |
| ADMIN_OAUTH_LOGIN    | **PENDING** | `IDENTITY_AUTHORIZATION_ENABLED=true` set + services redeployed; cold OAuth needs Owner browser                                      |
| ADMIN_SESSION_RELOAD | **PENDING** | Re-prove after cold OAuth                                                                                                            |
| ADMIN_AUTHORIZATION  | **PENDING** | Re-prove automatic identity-link sync (no manual repair)                                                                             |
| ADMIN_GUILD_LIST     | **PENDING** | Re-prove TESTOWY selectable after cold OAuth                                                                                         |
| DM_LIVE_SMOKE        | **FAIL**    | No LFG discovery DM with Dołącz/Zobacz/Nie teraz/Wycisz — see Owner interaction below                                                |

\*CI rows marked PASS* = fixed locally + pushed; GitHub Actions not polled (`gh` unauthenticated).

---

## Fixes this session

1. **CI infra** — Postgres readiness probe before isolation assertions (`tools/infra/db-isolation.test.ts`).
2. **CI quality** — Identity `authorization-client` + login-entitlement tests (≥60% coverage).
3. **Web deploy** — `Dockerfile.web` includes `@v2/hub-core`; member routes no longer 404.
4. **WWW LFG** — `NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID=org-v2-zeabur-p4` on web + Dockerfile build ARG; `/szukam-ekipy` renders LFG UI.
5. **Identity authz runtime** — `IDENTITY_AUTHORIZATION_ENABLED=true` + S2S keys (`zeabur-ensure-identity-authz-s2s.mjs`).
6. **Zeabur deploy path** — `zeabur-sync-and-deploy.mjs` (upload/OCI) replaces failing `deployFromSpecification`.

---

## Owner interaction required (DM_LIVE_SMOKE)

**OWNER_INTERACTION_REQUIRED**

Na koncie **PanaPas3k**: Discord → Centrum → **Szukam ekipy** → dodaj postać jeśli brak → włącz **Znajdź mi ekipę** (Azrael, rola Buff, okno „Teraz”).

Na koncie **KurczakAp** (lub innym członku TESTOWY): Centrum → **Utwórz aktywność** → opublikuj grupę **Azrael** z wolnym slotem **Buff** pasującym do watch.

Sprawdź DM PanaPas3k: przyciski **Dołącz**, **Zobacz**, **Nie teraz**, **Wycisz**.

---

## Admin cold OAuth (Owner)

1. Wyloguj z `v2-admin.zeabur.app` i wyczyść sesję Identity.
2. Wejdź na Admin → **Zaloguj przez Discord** → dokończ OAuth.
3. Potwierdź: guild **TESTOWY**, chroniona strona, reload sesji — **bez** ręcznej naprawy `discord_identity_link`.

---

## Hub

| Field          | Value                 |
| -------------- | --------------------- |
| HUB_CHANNEL_ID | `1534228693449179146` |
| HUB_MESSAGE_ID | `1544034743614570589` |

---

## STOP

Do **not** merge PR #19. Do **not** start Guild Control.
