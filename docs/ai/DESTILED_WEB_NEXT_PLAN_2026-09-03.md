# DESTILED — gdzie jest plan (SoT z gita)

Ten plik **nie** wymyśla kolejności. Kolejność i zakres są już zapisane w
zatwierdzonych dokumentach produktu.

## Źródła prawdy (czytać w tej kolejności)

1. `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md` — **Ordered delivery gates**
   (Phase 0–9) + **Immediate next step** (D-061)
2. `docs/product/PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md` — first slice D-049+
3. `docs/product/FIRST_PLAYER_JOURNEY_COHERENCE_REVIEW.md` — production-shell gate
4. `docs/product/TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md` — EQ / PH
   timers / TeamActions / Discord delivery / SpawnTimer (D-055–D-059)
5. `docs/DECISION_LOG.md` — D-038–D-061
6. `docs/ai/DESTILED_GAP_AUDIT_2026-09-03.md` — luk vs powyższy kontrakt
7. `docs/ux/DISCORD_POST_INTERACTION_STANDARD.md` — UX paneli bota

## Immediate next step (cytat z SoT, D-061)

Z `WEB_PRODUCT_DESIGN_AND_DELIVERY.md`:

1. stabilize the first-player path already on `preview/destiled-web`;
2. complete real create/edit flows for named sets, items and progression
   timers behind existing adapters;
3. do **not** start API/Discord production integration until the owner asks.

## First slice (zakres z kontraktu)

```text
Member dashboard
  -> My teams
  -> Team workspace
  -> Character board
  -> Equipment / named sets
  -> Progression timers / team actions / notes
  -> Change history
```

Za mock adapterami: reminder preferences + mock Discord delivery states.  
**Prawdziwe DM bota** — później, przez zatwierdzoną infrastrukturę
(`TEAM_LOADOUTS` § Discord delivery; Phase 7 integration).

## Później (jawnie poza first-slice)

Cooperative maps / SpawnTimers, dungeon analyzer, AI import EQ, market,
analityka Discord, bot-admin — dopiero gdy właściciel priorytetyzuje.

## Integracja Web ↔ bot (gdy owner poprosi)

Phase 7 w `WEB_PRODUCT_DESIGN_AND_DELIVERY.md`: zamiana mock adapterów na API,
sesje/Authorization, Discord-driven state. D-058: bot wysyła Done/Snooze/Cannot
do; stan zmienia się dopiero po potwierdzeniu człowieka.

## Marker

`SOT_INDEX_ONLY` — bez własnej „fazy A/B/C” poza dokumentami produktu.
