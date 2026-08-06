# ChatGPT → Cursor

## Status

`READY_FOR_CURSOR` — **planning only** for P4 Centrum Aktywności

## Task ID

`P4-CENTRUM-AKTYWNOSCI-001`

## Nazwa

Plan P4 / Centrum Aktywności (dokumentacja, bez implementacji).

## Cel

Po zatwierdzonym kierunku P3 Authorization przygotuj **pakiet planistyczny**
pierwszego pionu produktowego bota — Centrum Aktywności — analogicznie do
planu P2 (PR #10): handoff, granice usług, ADR Proposed, decyzje właściciela,
szkielet UX Discord **bez** finalnych assetów.

## Repozytorium i przepływ

- Base: aktualny `main` (co najmniej PR #14 / `f299775`)
- Gałąź: `cursor/p4-centrum-aktywnosci-plan-ea0a`
- Draft PR do `main`; **bez merge**
- **Bez** kodu `community-service`, migracji, komend produktowych Discord
- Implementacja P4 **nie** startuje w tym zadaniu; wymaga później:
  APPROVED planu, merge P3 (#16), briefu implementacyjnego, checkpointu Issue #12

## Dokumenty obowiązkowe

Jak w `AGENTS.md` + `DISCORD_POST_INTERACTION_STANDARD.md` + Issue #15 (P3-D2/D3)

- draft P3 ADR-0013 / contracts na PR #16 jako kontekst zależności.

## Zakres

1. Handoff `docs/ai/P4_CENTRUM_AKTYWNOSCI_HANDOFF.md`
2. Architektura `docs/architecture/CENTRUM_AKTYWNOSCI.md`
3. ADR-0014 **Proposed** (granica community vs gateway vs authz)
4. Product + UX outline z `OWNER_DECISION_REQUIRED`
5. `PENDING_DECISIONS` P4-D1…P4-D8
6. `PROJECT_STATE` + `CURSOR_TO_CHATGPT`

## Poza zakresem

Implementacja, wybór finalnych kolorów/emoji/copy, merge P3, Zeabur, Desktop.

## Operacje zabronione

Samodzielne domykanie P4-D\*; kod produktu; kopiowanie starego monorepo;
traktowanie `/panel-test` jako produkcyjnego Centrum.

## Kryteria akceptacji tego zadania

1. Draft PR planistyczny na wymaganej gałęzi
2. Wszystkie P4-D\* wypisane jako BLOCKED z opcjami A/B/C
3. ADR-0014 Proposed (nie Accepted)
4. Brak zmian kodu usług
5. Raport Cursor→ChatGPT kompletny
