# Cursor → ChatGPT

## Status

`READY_FOR_RE-AUDIT`

## Task ID

`P1-DISCORD-TEST-HARNESS-001` (urgent: live bot on Components V2)

## Branch / SHA

- **Branch:** `cursor/p1-discord-test-harness`
- **PR:** [#9](https://github.com/HOMZIKx/V2/pull/9) — **bez merge**
- **Implementation commit (Components V2):** `9cd3103a74069b2ba3d0c2060d9ba01e17374c5f`
- **Tip przed tą poprawką runtime:** `ff10cc368868efe4bb1dea4357b6029a0e4ae37b`
- **Aktualny tip po runtime fix:** `68303c2c833e53606ce1344309e5acb50c1829b9`

## Co było nie tak

Na porcie `4100` działał **stary** proces `pnpm --dir apps/discord-gateway dev` (oraz równolegle `discord:test:start`), który serwował legacy embed. Kod w repo już miał Components V2, ale żywy bot nie.

## Co zrobiono na maszynie

1. Zatrzymano wyłącznie procesy `discord-gateway` / `discord:test` / listener `4100` (bez `api-gateway`).
2. Usunięto `apps/discord-gateway/dist`, `pnpm install --frozen-lockfile`.
3. Dodano bezpieczny startup log: `gitCommitSha`, `gitBranch`, `buildMode=tsx-dev-source`, `panelRenderer=components-v2-container` (+ to samo w `/health/discord`).
4. Uruchomiono `pnpm discord:test:start` z aktualnego HEAD.
5. Usunięto legacy embed panele z kanału; opublikowano panel V2.
6. Restart procesu — panel V2 **pozostał**; signed custom IDs (`select` / `refresh` / `delete_ask`) weryfikują się sekretem z `.env`.

## Dowód żywego panelu V2

| Dowód                                               | Wynik                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/health/discord`                                   | `state=ready`, `panelRenderer=components-v2-container`, `gitCommitSha=ff10cc3…`            |
| Message API                                         | `flags=32768`, `embedsCount=0`, top type `17` (Container)                                  |
| JSON                                                | `docs/ai/artifacts/live-panel-v2-message.json`                                             |
| Screenshot Discord (desktop, kanał TESTOWY #ogólne) | `docs/ai/artifacts/live-discord-v2-panel-window.png`                                       |
| Jump URL                                            | `https://discord.com/channels/1534228693017432124/1534228693449179146/1534482713606881381` |

Publiczna karta: **bez** `ready` / `test` / `Wersja panelu`; select + przyciski **w** kontenerze; banner MediaGallery.

## Test interakcji

- Automatycznie: signed IDs OK; persistence po restarcie OK; renderer unit tests 45/45.
- Kliknięcia select / modal / Odśwież / Usuń w UI Discord: Electron nie eksponuje przycisków do UI Automation — **wymagane potwierdzenie właściciela na mobile** na już opublikowanym panelu V2 (link powyżej). Bot działa i nasłuchuje.

## Lokalny validate

`pnpm --filter discord-gateway test` → 45 passed. Pełne `pnpm validate` lokalnie może paść na braku Docker CLI (jak wcześniej); CI na tipie po push.

## Poza zakresem

P2, merge, nowy PR — bez zmian.
