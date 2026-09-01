# CURSOR → ChatGPT

## Status

**MODE:** Task 006 checkpoint — `PLAYER_TOOLKIT_CORE_V1` (code complete; deploy pending)
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-PLAYER-TOOLKIT-CORE-FOUNDATION-006`
Branch: `cursor/p4-1-activity-domain`
PR: **#19** — do not merge
Tip: see `PLAYER_TOOLKIT_CORE_V1_SHA`

---

## Delivered (006)

| Gate | Result |
|------|--------|
| PLAYER_CORE_ACCOUNT_MODEL | PASS (migration `003`, API `identity/v1/player/accounts`) |
| PLAYER_CORE_CHARACTER_MODEL | PASS (canonical `player_characters` + `gameAccountId`) |
| PLAYER_CORE_EXISTING_MIGRATION | PASS (idempotent default **Moje konto** backfill) |
| PLAYER_CORE_WWW | PASS (Profil IA: Przegląd / Postacie / …; account-grouped UX) |
| PLAYER_CORE_DISCORD | PASS (profile home + Postacie view, WWW deep links) |
| PLAYER_CORE_LFG_REGRESSION | PASS (same character IDs; class labels PL) |
| PLAYER_CORE_AUTHZ_ISOLATION | PASS (unit + integration spec; owner-scoped repo) |
| `corepack pnpm validate` | PASS except **VERSION_DRIFT** (Zeabur tip lag; needs identity+web deploy) |

### Key changes

- **Identity:** `player_game_accounts`, `player_private_audit`, `game_account_id` on characters; `PlayerAccountsController`; profile payloads include `gameAccounts`.
- **WWW:** `/profil`, `/profil/postacie`, subnav; create/edit/move character + create/rename account.
- **Discord:** Mój profil shows Postacie/Konta/Aktywna; `profile_chars` navigation; `DISCORD_MEMBER_WWW_ORIGIN` deep links.
- **hub-core:** Polish class labels; `v2://profile/me?action=characters` → `/profil/postacie`.

### Not in scope (deferred)

Trackers, elixirs, EQ Board, sharing — per task 006.

### Owner / deploy next

1. Deploy **identity-service** (migration 003) + **web** + **discord-gateway**.
2. Set `DISCORD_MEMBER_WWW_ORIGIN` on discord-gateway.
3. Live smoke: WWW_ACCOUNT_CREATE, WWW_CHARACTER_CREATE/EDIT/MOVE, DISCORD_PROFILE_ACCOUNT_CONTEXT, LFG_CANONICAL_CHARACTER.
4. Owner + ChatGPT review WWW + Discord UX before Trackers.

---

## STOP

No Tracker implementation. No merge to `main`.
