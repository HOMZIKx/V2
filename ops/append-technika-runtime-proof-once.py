from pathlib import Path

branch_docs = {
    Path('docs/ai/FIX_LOG.md'): [
        (
            "- **Status:** `PARTIAL` — poprawka kodowa i CI są potwierdzone; pełny runtime E2E pozostaje otwarty do momentu realnego live DM przez Discord po wdrożeniu.\n",
            "- **Status:** `DONE` — poprawka kodowa, deployment dokładnego SHA oraz realny produkcyjny przepływ `Web/API → Discord Gateway → Discord DM` zostały potwierdzone. `reminderMinutesBefore` pozostaje osobnym, świadomie otwartym zakresem i nie zmienia statusu tej naprawy.\n",
        ),
        (
            "- **Commit / PR:** PR `#68`; kod `2dacfbac5faf4f58d43261e9cb34c407c40427e5`; korekta typowania testu `bb9fc801dfc7b78ad866944298ee41903ab212f3`.\n",
            "- **Commit / PR:** PR `#68`; kod `2dacfbac5faf4f58d43261e9cb34c407c40427e5`; korekta typowania testu `bb9fc801dfc7b78ad866944298ee41903ab212f3`; rebase merge do `preview/destiled-web`: `1126e7ead0649f0b6a78f3d669b847b85d096d2f`.\n",
        ),
        (
            "- **Deployment:** PR nie został jeszcze zmergowany do `preview/destiled-web`, aby nie uruchamiać wspólnego rollout’u w trakcie równoległych zmian innych agentów.\n",
            "- **Deployment:** Zeabur Discord Gateway deployment `6a9ffef87b89d694354a08b5` używa `refs/heads/preview/destiled-web`, `commitSHA=1126e7ead0649f0b6a78f3d669b847b85d096d2f` i osiągnął `RUNNING` (start `2026-09-08T12:26:45Z`, finish `12:27:54Z`). Post-merge CI `34226072593` zakończył się `success`.\n",
        ),
        (
            "- **Runtime / E2E:** test-DM nie jest uznawany za dowód, bo ta ścieżka już wcześniej respektowała szablon. Do `DONE` potrzebny jest realny character-timer notify przez gateway → Discord z niestandardowym aktywnym template.\n",
            "- **Runtime / E2E:** po wdrożeniu probe Technika `34227126328` zachował rewizję `2`, `updatedAt=2026-09-08T11:02:14.967Z` i te same fingerprinty; public E2E `34227377285` potwierdził Discord Gateway `state=ready`, `isolationOk=true`, 3 guildie, komendy zarejestrowane i brak `lastError`. Następnie realny produkcyjny character-timer notify przez `/api/discord-notify` → `/notify/timer` → Gateway → Discord zakończył się w runie `34227810076` wynikiem HTTP `201`, `delivery=dm`, `messageIdPresent=true`, bez skipa. Aktywny produkcyjny template ma obecnie fingerprint defaultu `ae4c4b0323d6d028`; zachowanie zmiany aktywnego template bez restartu jest dodatkowo pokryte regresją z dwiema kolejnymi rewizjami w `notify-character-template.spec.ts`. Nie mutowano produkcyjnej konfiguracji tylko dla sztucznego markera E2E, aby nie zanieczyścić historii rollbacków.\n",
        ),
    ],
    Path('docs/ai/PROJECT_STATE.md'): [
        (
            "- CI dla `bb9fc801dfc7b78ad866944298ee41903ab212f3`: PASS (`34225187832`); pełny live Discord E2E po wdrożeniu nadal `PARTIAL`.\n",
            "- PR #68 jest zmergowany jako `1126e7ead0649f0b6a78f3d669b847b85d096d2f`; post-merge CI `34226072593` PASS. Zeabur wdrożył dokładnie ten SHA (`6a9ffef87b89d694354a08b5`, `RUNNING`), a realny produkcyjny character-timer notify zakończył się DM z prawdziwym `messageId` (`34227810076`) — naprawa live template runtime ma status `DONE`.\n",
        ),
        (
            "- `reminderMinutesBefore` wymaga osobnego pre-reminder joba i pozostaje otwartym, świadomie niewłączonym zakresem.\n",
            "- Aktywny produkcyjny template jest obecnie defaultowy (`ae4c4b0323d6d028`); nie zmieniano go tylko dla testu. `reminderMinutesBefore` wymaga osobnego pre-reminder joba i pozostaje otwartym, świadomie niewłączonym zakresem.\n",
        ),
    ],
    Path('docs/ai/CURSOR_TO_CHATGPT.md'): [
        (
            "- PR #68 (`bb9fc801dfc7b78ad866944298ee41903ab212f3`) podpina aktywny template do normalnego notify/reset oraz canonical durable workera i rozwiązuje config w chwili wysyłki.\n",
            "- PR #68 został zmergowany metodą rebase do `preview/destiled-web`; produkcyjny SHA to `1126e7ead0649f0b6a78f3d669b847b85d096d2f`. Fix podpina aktywny template do normalnego notify/reset oraz canonical durable workera i rozwiązuje config w chwili wysyłki.\n",
        ),
        (
            "- CI `34225187832` PASS; PR Title `34225198774` PASS.\n",
            "- Finalny PR CI `34225696704` PASS; post-merge CI `34226072593` PASS. Zeabur deployment `6a9ffef87b89d694354a08b5` działa na dokładnym SHA `1126e7e…` ze statusem `RUNNING`.\n",
        ),
        (
            "- Nie oznaczać `DONE` przed realnym live DM gateway → Discord po wdrożeniu.\n",
            "- Runtime proof jest zamknięty: Technika persistence po merge `34227126328` PASS; public E2E `34227377285` ma Gateway `ready` bez `lastError`; realny character-timer `/notify/timer` → Discord DM `34227810076` zwrócił HTTP `201`, `delivery=dm` i prawdziwy `messageId`. Fix live template runtime = `DONE`. Produkcyjny template jest obecnie defaultowy; nie mutowano configu tylko po to, by wymusić sztuczny marker custom-template.\n",
        ),
    ],
}

for path, replacements in branch_docs.items():
    text = path.read_text(encoding='utf-8')
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f'missing expected text in {path}: {old[:80]!r}')
        text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')
