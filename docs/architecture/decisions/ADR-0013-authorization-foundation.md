# ADR-0013: Authorization Service foundation (P3)

- **Status:** Accepted (owner Issue #15 P3-D1–P3-D20)
- **Data:** 2026-08-05
- **Task:** `P3-AUTHORIZATION-FOUNDATION-001`
- **Depends on:** PR #14 Internal JWT (`f299775`), ADR-0009, ADR-0011

## Kontekst

Platforma wymaga decyzji dostępowych niezależnych od Identity: członkostwo Discord,
mapowanie ról, logowanie WWW, revoke sesji po utracie entitlement oraz bootstrap
właściciela. `authorization-service` był szkieletem Nest bez domeny.

## Decyzja

1. **`authorization-service` jest jedynym właścicielem** bazy `authorization` oraz
   decyzji allow/deny (explainable). Inne usługi nie czytają tej bazy.
2. **Jeden model właściciela** na tabeli `organization`:
   `owner_discord_user_id`, `owner_v2_user_id` (nullable), `bootstrap_completed_at`,
   `bootstrap_source_discord_user_id_snapshot`. Brak osobnej tabeli `organization_owner`.
3. **Guild lifecycle:** `pending_sync` → jawna aktywacja → `active`;
   `login_entitling` domyślnie `false`; `inactive_detached` zachowuje historię.
4. **Silnik decyzji** (pure domain): block → owner shield → sync gate → specificity
   user > guild > organization > group_default; remis → deny. Bez effective-access cache w v1.
5. **Logowanie WWW (P3-D19):** Identity weryfikuje `permission.platform.login.www`
   w Authorization **przed** utworzeniem pełnej sesji; fail-closed przy `stale`/`unavailable`.
6. **Dwa mechanizmy S2S:**
   - User-context Internal JWT (PR #14) — wywołania z aktywną sesją użytkownika;
   - System service assertion — operacje tła (revoke, sync machine calls) bez cookie.
7. **Discord sync v1:** synchroniczny HTTP z `discord-gateway`
   (`DISCORD_AUTHORIZATION_SYNC_ENABLED`; GuildMembers tylko gdy sync włączony);
   RabbitMQ/outbox tylko jako przyszłe porty, bez implementacji w tym PR.
8. **Katalog permissions** w fundamencie jest wyłącznie techniczny (test/foundation IDs).
   Finalne nazwy UX = poza zakresem.

## Konsekwencje

- Identity zyskuje `POST /identity/v1/system/revoke-sessions` oraz login gate.
- Discord Gateway emituje register/events/reconcile do Authorization gdy sync włączony.
- Deploy Zeabur, Admin UI, Centrum Aktywności i pełny RBAC pozostają poza P3 foundation.

## Zastąpienie

Doprecyzowuje ADR-0009 (Authz nie rozwijany w P2) bez zmiany Ownership Identity.
