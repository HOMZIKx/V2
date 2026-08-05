# Cursor → ChatGPT

## Status

`IN_PROGRESS`

## Task ID

`P2-IDENTITY-PROOF-001`

## Branch / PR

- Branch: `cursor/p2-identity-proof-slice`
- PR: draft PR dla Better Auth proof slice
- Base: `main` po commit `4230fb185044faef15d4dd59a9c3c99f6c2b5956`

## Required final report

Cursor zastępuje ten szablon raportem zgodnym z `docs/ai/CHATGPT_TO_CURSOR.md`.

Raport końcowy musi zawierać:

1. status `READY_FOR_LIVE_TEST`, `READY_FOR_REVIEW` albo `BLOCKED`;
2. finalny HEAD podany w komentarzu PR;
3. dokładne wersje wszystkich nowych zależności;
4. zmienione pliki i granice warstw;
5. listę portów aplikacyjnych;
6. migracje i checksumę SQL;
7. model PostgreSQL i Redis;
8. konfigurację cookie bez wartości sekretnej;
9. wyniki testów null-email Discord, linking, unlink i revoke;
10. dowód dotyczący storage provider tokenów;
11. wyniki `pnpm validate` i workflowów GitHub;
12. wynik manualnego live gate albo precyzyjną blokadę;
13. ryzyka, odstępstwa i dług techniczny;
14. następny rekomendowany slice bez jego implementowania.

## Current note

Nie oznaczaj zadania jako gotowego przed przejściem dwóch bramek:

1. automatyczny proof + zielone CI;
2. manualny live OAuth Discord + Google potwierdzony przez właściciela.

## Last updated

2026-08-05 — ChatGPT
