# Cursor → ChatGPT

## Status

`READY_FOR_RE-AUDIT`

## Task ID

`P1-DISCORD-TEST-HARNESS-001` (remediation — Components V2)

## Branch, commit i PR

- **Branch:** `cursor/p1-discord-test-harness`
- **PR:** [#9](https://github.com/HOMZIKx/V2/pull/9) (bez merge)
- **Finalny commit:** `fe3c42ab50881e68d726078d2bf60b2acd2f9664` (zielone CI poniżej; kolejny tip docs-only jeśli nastąpi)

## GitHub Actions (HEAD `be31a9c`)

- CI (PR): success — https://github.com/HOMZIKx/V2/actions/runs/30988339309
- CI (push): success — https://github.com/HOMZIKx/V2/actions/runs/30988337286
- PR Title: success — https://github.com/HOMZIKx/V2/actions/runs/30988339462

## Zakres remediacji

1. Publiczny `/panel-test` przebudowany na **Discord Components V2**:
   - jeden `ContainerBuilder` (type 17) z accent color V2;
   - `TextDisplay` (nagłówek/opis użytkowy);
   - `Separator` + `MediaGallery` (banner `attachment://`);
   - Action rows: select + przyciski **wewnątrz** kontenera;
   - stopka TextDisplay;
   - flag `MessageFlags.IsComponentsV2` (32768);
   - **brak** legacy `EmbedBuilder` / `embeds` w publicznym panelu.
2. Usunięte z publicznej karty: `ready`, środowisko, wersja panelu, timestamp.
3. Diagnostyka pozostaje w ephemeral `/status` (`buildStatusEmbed`).
4. Refresh używa `interaction.update` z `IsComponentsV2` (bez embeds).
5. Testy `panel-renderer.spec.ts` weryfikują kontener, flagę, select/buttons wewnątrz, brak embeds.
6. Uprawnienia: dodane **Attach Files**; docs + ADR-0007; instrukcja odebrania Administratora; `permissions=117760`; DEC-002 bez usuwania historii.
7. Preview layoutu: `docs/ai/artifacts/p1-panel-components-v2-preview.png` (mock UI — nie sekret).

## Payload Components V2 (skrót)

```text
flags: IsComponentsV2
components: [
  Container {
    accent_color,
    components: [
      TextDisplay (title + user copy),
      Separator,
      MediaGallery [attachment://v2-lab-banner.png],
      Separator,
      ActionRow [StringSelect],
      ActionRow [Odśwież, Usuń panel],
      TextDisplay (footer)
    ]
  }
]
files: [v2-lab-banner.png]
```

## Wyniki automatyczne

```text
pnpm --filter discord-gateway test  → 13 files / 45 tests passed
pnpm validate                       → green through runtime-smoke; Docker CLI missing on Windows host
live API probe                      → flags=32768, Container type 17, hasEmbeds=false
```

## Live probe (API)

Skrypt `apps/discord-gateway/scripts/live-panel-v2-probe.mts` (send + delete):

```text
liveProbe: ok
flags: 32768 (IsComponentsV2)
hasEmbeds: false
topComponentTypes: [17]  // Container
```

`pnpm discord:test:doctor` → OK (guild TESTOWY, komendy status/panel-test).

**Mobile Discord UI:** właściciel powinien potwierdzić wygląd jednej karty na telefonie po `/panel-test` (preview PNG + API probe powyżej; pełny klik select/modal — re-test właściciela zalecany).

## Screenshot / preview

- `docs/ai/artifacts/p1-panel-components-v2-preview.png`

## Odstępstwa / ryzyka

- DEC-002 Administrator nadal możliwy lokalnie — po teście odebrać (instrukcja w `TEST_BOT_SETUP.md`).
- Lokalny `pnpm validate` może kończyć się brakiem Docker CLI na Windows; CI na PR jest źródłem prawdy dla compose.
- Preview PNG to layout mock zgodny z copy/kolorami V2 — nie zastępuje zrzutu z klienta Discord właściciela.

## Poza zakresem (zachowane)

- P2 Identity, Zeabur, merge, rotacja sekretów przez PR.

## Prośba

Audyt ponowny PR #9 → `APPROVED` albo dalsze `CHANGES REQUIRED`. Bez merge przez Cursora.
