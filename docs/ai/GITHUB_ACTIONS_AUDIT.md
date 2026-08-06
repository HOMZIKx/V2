# Audyt GitHub Actions (przy okazji P4 spec prep)

## Status

`AUDIT_COMPLETE — no repo YAML change recommended`

Data: 2026-08-06. Zakres: `.github/workflows/ci.yml`,
`.github/workflows/pr-title.yml`. **Bez** modyfikacji workflow na PR #16.
**Bez** pustych commitów retrigger.

## Obserwacje

1. **Pinowane akcje (SHA):**
   - `actions/checkout@34e1148…` (v4.3.1)
   - `actions/setup-node@49933ea…` (v4.4.0)
   - `actions/cache@0057852…` (v4.3.0)
   - `gitleaks/gitleaks-action@e0c47f4…` (v3.0.0)
2. **Runners:** `ubuntu-latest` (GitHub-hosted).
3. **Concurrency:**
   - CI: `group: ${{ github.workflow }}-${{ github.ref }}`,
     `cancel-in-progress: true`
   - PR Title: analogicznie
4. **Joby CI są niezależne** (`quality`, `infra-integration`, `secret-scan`) —
   brak `needs:` między nimi. Awaria jednego joba **nie** kasuje innych przez
   `needs`. Anulowanie wynika z **concurrency cancel-in-progress** przy nowym
   pushu na ten sam ref albo z timeoutu / błędu setup runnera.
5. **Błędy „Set up job / Failed to resolve action download info / Service
   Unavailable”** obserwowane na PR #16 to awarie infrastruktury GitHub Actions
   (pobieranie metadanych akcji), **nie** błąd YAML repozytorium. Secret scan /
   Quality gates potrafiły przejść na tym samym tipie gdy setup się udał.
6. **PR Title** używa `commitlint` na tytule PR — poprawne; nie blokuje CI jobs.

## Wniosek

- **Brak jednoznacznej, bezpiecznej poprawki YAML wymaganej teraz.**
- Nie zmieniać `cancel-in-progress` w tym zadaniu (świadomy trade-off vs
  kolejkowanie).
- Nie dodawać pustych commitów „żeby odpalić CI”.
- Po merge P3: jeśli Actions nadal flaky, osobny PR ops z monitoringiem /
  retry policy — poza P4 spec.

## Ryzyko ewentualnej przyszłej zmiany (nie w tym commitcie)

| Zmiana                             | Efekt                                | Ryzyko                         |
| ---------------------------------- | ------------------------------------ | ------------------------------ |
| `cancel-in-progress: false` dla CI | mniej anulowań przy szybkich pushach | dłuższe kolejki / koszt        |
| `timeout-minutes` na jobach        | czytelniejsze fail vs hang           | false fail przy wolnym compose |

**Decyzja tego audytu:** zero zmian YAML; wynik zapisany tutaj.
