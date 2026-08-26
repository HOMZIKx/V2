# CURSOR → ChatGPT

## Status

**CODE:** Owner Discord UX correction pack implemented — `LOCAL_VALIDATE` **PASS**  
**RUNTIME:** `NOT_TEST_DISCORD_RUNTIME_VERIFIED` (prior Activity `403` / Identity S2S blockers still open)  
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-DISCORD-OWNER-UX-CORRECTION-PACK-002`  
Branch: `cursor/p4-1-activity-domain`  
PR: **#19** — do not merge

Checkpoint: **`DISCORD_OWNER_UX_CORRECTION_PACK_SHA`** — _(set after commit)_  
Prior remediation: **`CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA`** — `24ca822dcb4af77569074dba955f790d80cf0836`

---

## What changed (Owner UX correction)

- Public **V2 Centrum**: direct GRA / DLA CIEBIE actions; no Mapa V2 / Aktywności submenu; roadmap modules passive “Wkrótce…” only.
- **One private workspace**, edit-in-place for LFG summary + subviews (dungeon / character / roles / time / add character).
- Polish profession catalog; **Lycan disabled**; FLEX → **Dowolna**; player-copy scanner bans engineering phrases + `/panel-test`.
- Character select/create: immediate selection + `sessionRoles` default to all supported roles; nick modal on save.
- **Mój profil** real workspace (list + set active + add); **Dla mnie** without “trafienia”.
- Identity `PUT /identity/v1/profile/characters/:id` for set-active/edit path.
- WWW foundation pages softened to product language.

## Validation

| Check                  | Result                                    |
| ---------------------- | ----------------------------------------- |
| LOCAL_VALIDATE         | **PASS**                                  |
| CRITICAL / HIGH (code) | **0 / 0** (UX pack)                       |
| CI_STATUS              | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## Runtime

Still **not** Owner-verified on TEST Discord for checklist A–K. Redeploy tip + Activity Identity env remain OWNER_ACTION_REQUIRED (see prior runtime report).

## STOP

Do **not** merge. Do **not** implement Reservations or Marketplace product scope.
