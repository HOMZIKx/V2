# Player Toolkit — architecture boundary (Task 006 remediation)

## Decision (technical)

**GameAccount + canonical Character remain in `identity-service` as a small ownership/profile foundation only.**

Gameplay state (trackers, elixirs, EQ board, sharing, guild-admin views of private data) **must not** be added to Identity. Future gameplay modules require a dedicated Player domain/service with typed HTTP/event contracts.

`PLAYER_TOOLKIT_CORE_V1_SHA` (`2af092f`) remains an immutable historical marker. This document records the enforced boundary after integration recovery.

**006C contract freeze + D-051 / D-052:** Canonical Identity characters and DESTILED **Team Character Boards** are **different entities**. Ownership of Teams/boards is **`player-workspace-service`** (not Identity, not Activity). GameAccount remains **SOLO only**. Full matrix: [`PLAYER_TOOLKIT_CONTRACT_AUDIT_006C.md`](PLAYER_TOOLKIT_CONTRACT_AUDIT_006C.md).

## What Identity owns (accepted for #29 foundation)

| Concern                                                  | Storage / API                                   | Rationale                                          |
| -------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Authentication, sessions, Discord linking                | Better Auth, existing identity tables           | ADR-0010                                           |
| `player_characters` (canonical character ID)             | Identity DB                                     | Stable ID for Profile, LFG, Activities, Discord    |
| `player_game_accounts` (logical Metin2 account grouping) | Migration `003`                                 | Ownership boundary for multi-account players       |
| `player_private_audit`                                   | Identity DB                                     | Member-private mutations; not guild-admin readable |
| Player-facing profile APIs                               | `player-profile`, `player-accounts` controllers | S2S + member session scoped                        |

## Hard boundary (enforced going forward)

Identity **must not**:

- Store tracker/elixir/EQ/sharing gameplay state.
- Expose guild-admin implicit access to member-private profile data.
- Become a cross-service DB for Activity/LFG tables.

Member WWW UI for Player Toolkit **must not** be redesigned by Cursor against the
Owner+ChatGPT frontend track (D-050). Cursor wires approved screens/adapters to
Identity character APIs; visual SoT is `codex/phase5-*` / `preview/destiled-web`.

Consumers (**web** profile/LFG, **discord-gateway** Hub profile, **activity-service** via S2S) **must**:

- Use Identity HTTP APIs for character verification and profile facts.
- Treat `player_characters.id` as the canonical character reference for **Activity / LFG / Discord profile / WWW `/profil`**.
- **Not** use Identity character rows as Team Character Boards (DESTILED planning cards live in a future Player Workspace domain).
- Never read Identity Postgres from another service.

## Consumers of `player_characters`

| Consumer                          | Usage                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| WWW `/profil`, `/profil/postacie` | CRUD via identity API; grouped by GameAccount                             |
| Discord Mój profil / Postacie     | Identity HTTP client; same character IDs                                  |
| LFG                               | Character ID verification via identity S2S; no duplicate character store  |
| Activities enrollment             | Existing character references; organizer display via guild member resolve |

## Migration implications

- `003_player_game_accounts.sql` is idempotent backfill to default **Moje konto** per user.
- Character IDs are stable; `game_account_id` is additive.
- No extraction migration required while scope is foundation-only; extraction trigger: first gameplay-state module with non-identity retention needs.

## Admin / bot configuration (Task 005 cross-cut)

| Surface                            | Owner-configurable?                                        | Admin location                                        |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| V2 Centrum panel                   | Yes                                                        | Discord Bot → Centrum V2                              |
| Hub modules visibility             | Yes                                                        | Centrum V2 (embedded)                                 |
| Powiadomienia (activity reminders) | Yes                                                        | Discord Bot → Powiadomienia + Aktywności → Ustawienia |
| LFG composition templates          | Yes                                                        | Aktywności → LFG                                      |
| Mój profil (Discord)               | **No** — read-only member workspace; data from Identity    | **No Admin screen** (not a placeholder)               |
| Activities/LFG member flows        | Configured via types + LFG templates, not separate bot nav | Aktywności section                                    |
