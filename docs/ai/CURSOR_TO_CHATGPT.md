# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_REVIEW_P4_1_TO_P4_4_CLOSURE`

## 2. HEAD

`64eee10621124a27f6783e1712d4d3d22b138d6d` on `cursor/p4-1-activity-domain`
(closure remediation; branch tip may include follow-up docs commits)

Base handoff SHA was `277c687`; P4.5 RabbitMQ commit was **reverted** (`13ba776`)
so active closure scope is P4.1–P4.4 only.

## 3. Changed files (grouped)

### security

- `services/activity-service/src/interface/inbound-assertion.guard.ts` (+ spec)
- `services/activity-service/src/infrastructure/config/activity-env.ts` (+ spec)
- `services/activity-service/src/infrastructure/internal/assertion-jti-store.ts` (+ spec)
- `services/activity-service/src/interface/app.module.ts`, `activity.tokens.ts`
- `apps/discord-gateway/src/infrastructure/discord/allowed-mentions.ts`
- `apps/discord-gateway/src/infrastructure/discord/discord-js-adapter.ts` (+ spec)
- `apps/discord-gateway/src/infrastructure/security/activity-signed-custom-id.ts` (+ spec)
- `apps/discord-gateway/src/interface/http/activity-projection.controller.ts` (+ spec)
- `apps/discord-gateway/src/infrastructure/discord/discord-config.ts` (+ spec)
- `apps/discord-gateway/src/interface/discord/activity-interaction-handler.ts` (log redaction + modal verify)
- `.env.example`

### Discord UX

- `apps/discord-gateway/src/presentation/discord/activity-schedule-form.ts` (signed modal)
- Single-form flow retained from prior Owner Amendment commit; docs updated

### panel recovery

- `apps/discord-gateway/src/application/interactions/hub-panel-delivery.ts` (+ spec)
- `apps/discord-gateway/src/infrastructure/discord/panel-message-scan.ts` (+ spec)
- activity panel pending-occurrence API + repository/use-cases

### Activity backend

- ports/repository/use-cases/controller updates for panel occurrence/incident
- ioredis for jti store (`package.json` / lockfile)

### API gateway / Admin / WWW

- No product-scope changes required for this pass beyond existing BFF actor
  header stripping tests (already present)

### tests

- New/extended specs listed under security + panel recovery above
- Existing concurrency/infra specs remain

### documentation

- `docs/ai/PROJECT_STATE.md`, `CHATGPT_TO_CURSOR.md`, `CURSOR_TO_CHATGPT.md`
- `docs/product/CENTRUM_AKTYWNOSCI.md`, `docs/architecture/CENTRUM_AKTYWNOSCI.md`
- `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md` (Owner Amendment §O)
- `docs/ai/P4_TEST_TRACEABILITY.md`, `P4_CENTRUM_AKTYWNOSCI_HANDOFF.md` (updated)

## 4. Findings → fix → regression

| #     | Problem                                            | Solution                                                                       | Test                                                      | Result |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- | ------ |
| 3.1   | `ACTIVITY_ENABLED=false` trusted raw actor headers | Fail-closed; `ACTIVITY_TRUST_ACTOR_HEADERS` DEV-ONLY; production rejects TRUST | `inbound-assertion.guard.spec.ts`, `activity-env.spec.ts` | PASS   |
| 3.2   | Mentions from user text                            | `allowedMentions.parse=[]` on publish/edit                                     | `discord-js-adapter.spec.ts`, `allowed-mentions`          | PASS   |
| 3.3   | Unsigned modal custom_id                           | Signed modal IDs + verify before draft mutate                                  | `activity-signed-custom-id.spec.ts`, handler specs        | PASS   |
| 3.4   | jti present but not consumed                       | Activity Redis `AssertionJtiStore.assertOnce`                                  | `assertion-jti-store.spec.ts`, guard specs                | PASS   |
| 3.5   | Projection deliver without secret in headers mode  | Secret mandatory when `DISCORD_ACTIVITY_ENABLED`                               | projection controller + config specs                      | PASS   |
| 3.6   | `error.body.slice` in logs                         | Log status/code/operation only                                                 | handler redaction assertion                               | PASS   |
| P4-D6 | Re-publish instruction / weak adopt                | Scan+adopt+duplicate cleanup+nonce reuse                                       | `hub-panel-delivery.spec.ts`, handler specs               | PASS   |

## 5. Commands run

```text
git revert 4992d3a   # remove P4.5 RabbitMQ from active closure scope
corepack pnpm --dir apps/discord-gateway lint|test|typecheck
corepack pnpm --dir services/activity-service lint|test|typecheck
corepack pnpm --dir apps/api-gateway test
corepack pnpm architecture:check
corepack pnpm audit --audit-level=high
corepack pnpm validate   # final gate
```

## 6–8. Results

- `pnpm validate`: **PASS** (format, lint, typecheck, unit/integration, architecture, admin+web Playwright e2e)
- discord-gateway tests: 124 passed
- activity-service tests: 94 passed (14 skipped infra)
- api-gateway tests: 15 passed
- architecture:check: PASS
- `pnpm audit --audit-level=high`: exit 0 — **0 high** (1 moderate reported, non-blocking for high gate)
- CI: GitHub Actions on tip `2c4cabcd490379b589b513d324cae88c87b91662`
  - Quality gates: success
  - Infrastructure integration: success
  - Secret scan: success
  - Conventional PR title: success (after conventional lowercase subject)
  - CI run: https://github.com/HOMZIKx/V2/actions/runs/31962384964
  - PR: https://github.com/HOMZIKx/V2/pull/19

## 9. Owner-required

1. **Discord live P4.2** — guild `1534228693017432124`: hub create/adopt, single-form create → preview → publish, RSVP, More, inbox; destructive confirms
2. **Admin live P4.3** — Admin UI → real Activity → Discord projection/hub (`MANUAL_OWNER_TEST_REQUIRED`)
3. **WWW live P4.4** — `IDENTITY_AUTH_ENABLED=true`, Discord OAuth, session cookie, protected routes, browse/RSVP/mine/notifications (no WWW creator)
4. **Visual branding** — P4-D8 / Issue #12 still `OWNER_DECISION_REQUIRED`

### Owner Discord smoke (P4.2)

1. Start local stack (Postgres/Redis, activity-service, discord-gateway) with
   `DISCORD_ACTIVITY_ENABLED=true`, projection secret set, Discord token.
2. `/centrum-panel` in test channel → one hub message; re-run → update/adopt
   same message (no duplicate).
3. Hub **Utwórz aktywność** → one form screen → fill → **Podgląd** → **Publikuj**.
4. Confirm public event post updates in place on RSVP; More menu ephemeral;
   cancel requires confirmation.
5. Delete hub message manually → reconcile/publish recovers without spam.

### Owner Admin smoke (P4.3)

1. Open Admin Activity config for test guild; change type/status/channel allowlist.
2. Confirm Discord create/publish respects allowlist; config revision conflicts
   show 409.
3. Do **not** mark PASS until real Discord side-effect observed.

### Owner WWW smoke (P4.4)

1. Set `IDENTITY_AUTH_ENABLED=true`, trusted origins localhost, Discord OAuth.
2. Login → `/session/me` → `/aktywnosci` browse/detail/RSVP/mine/notifications.
3. Unauthenticated protected routes redirect; no create UI on WWW.

## 10. Known limitations / debt

- DEV-ONLY `ACTIVITY_TRUST_ACTOR_HEADERS` still needed for some local harnesses;
  production must keep it false / rejected.
- Panel scan limited to recent N messages (bounded).
- Visual palette still OWNER_DECISION_REQUIRED.
- Identity OAuth live gate not automated in CI.

## 11. Explicit confirmation

- **P4.5 NOT STARTED** (as active product delivery; prior RMQ commit reverted)
- **P4.6 NOT STARTED**
- **RabbitMQ NOT STARTED** (for this closure scope)
- **Zeabur NOT STARTED**
- **NO MERGE**

STOP — await combined ChatGPT audit + owner decision.
