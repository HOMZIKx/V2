# P1 Discord Test Harness — handoff

## Task

`P1-DISCORD-TEST-HARNESS-001`

## Cursor command

Po zsynchronizowaniu lokalnego repozytorium wklej do Cursora:

```text
Przeczytaj AGENTS.md, .cursor/rules/00-project-constitution.mdc, .cursor/rules/70-discord-post-ux.mdc oraz wszystkie dokumenty wskazane w aktywnym zadaniu.

Wykonaj zadanie P1-DISCORD-TEST-HARNESS-001 dokładnie według:
docs/ai/CHATGPT_TO_CURSOR.md

Najpierw zsynchronizuj lokalny main z origin/main, a następnie utwórz i przełącz się na gałąź:
cursor/p1-discord-test-harness

Przed rozpoczęciem przedstaw krótki plan, strukturę adaptera Discord, model konfiguracji, minimalne intents/scopes/permissions oraz dokładny flow /status i /panel-test. Sprawdź konflikty z konstytucją i standardem Discord UX.

Wykonaj cały zakres możliwy bez prawdziwego tokenu. Nie proś o przesłanie tokenu w czacie. Po zielonym CI ustaw READY_FOR_LIVE_TEST i wskaż właścicielowi wyłącznie kroki z docs/discord/TEST_BOT_SETUP.md potrzebne do lokalnego ustawienia sekretów i testu.

Po live teście:
1. uruchom pełne pnpm validate,
2. doprowadź GitHub Actions do zielonego stanu na finalnym HEAD,
3. uzupełnij docs/ai/CURSOR_TO_CHATGPT.md,
4. zaktualizuj PROJECT_STATE, dokumentację i ADR-0007,
5. utwórz Pull Request do main,
6. nie scalaj Pull Requesta,
7. nie rozpoczynaj następnego etapu,
8. podaj numer PR.
```

## Granica bezpieczeństwa

- Nigdy nie wklejaj tokenu Discord ani component signing secret do rozmowy z Cursorem, GitHuba, terminal command arguments lub screenshotu.
- Sekrety mają istnieć wyłącznie w lokalnym pliku środowiskowym ignorowanym przez Git.
- Jedyny dozwolony guild: `1534228693017432124`.
- Global commands, privileged intents, reakcje jako nawigacja i permission `Administrator` są zabronione.

## Oczekiwany rezultat

Pierwszy bot V2 online na serwerze testowym z `/status`, publicznym `/panel-test`, select menu, przyciskami, modalem, własnym bannerem V2 LAB i interakcjami działającymi po restarcie procesu.
