# Centrum Aktywności — Discord UX outline (P4)

## Status

`DRAFT — OWNER_DECISION_REQUIRED (P4-D6, P4-D8)` + Issue #12

Ten dokument opisuje **szkielet interakcji**, nie zatwierdzony wygląd.
Cursor nie implementuje UI przed checkpointem wizualnym.

## Cel panelu

Jeden publiczny, stabilny post na wskazanym kanale guildu = wejście do Centrum.
Osobiste potwierdzenia i błędy = ephemeral. Brak łańcuchów publicznych wiadomości.

## Proponowany układ (do zatwierdzenia)

1. **Header** — tytuł modułu (copy = P4-D8).
2. **Krótki opis** — jedno zdanie po co jest panel.
3. **Opcjonalny banner** — tylko po zatwierdzeniu assetu (Issue #12).
4. **Select menu** — lista akcji/kategorii (placeholder w stylu:
   „Nie wybrano żadnej opcji”).
5. **Opcjonalny rząd przycisków** — maks. kilka: odśwież, (operator) zarządzaj
   panelem; bez duplikowania całego menu.
6. **Footer/status** — tylko gdy niesie stan (np. sync unavailable).

Po wyborze z selecta — jedna z dróg:

- update tego samego panelu (podgląd listy / detail);
- modal (tworzenie / krótki formularz);
- ephemeral (wynik prywatny, błąd uprawnień, explain skrócony).

## Flow publikacji (P4-D6)

| Krok         | Zachowanie proponowane                                                                |
| ------------ | ------------------------------------------------------------------------------------- |
| Publish      | Slash operatora (Manage Guild / permission V2) publikuje lub odświeża **jeden** panel |
| Restart bota | Ten sam messageId + signed custom IDs nadal działają                                  |
| Re-publish   | Idempotentnie edytuje istniejący post; nie spamuje nowego                             |
| Delete panel | Confirm → usuwa wiadomość; nie kasuje danych aktywności w community                   |

`/panel-test` P1 pozostaje harnessem lab; nie jest produkcyjnym Centrum.

## Stany obowiązkowe

| Stan                      | Publiczne                                | Ephemeral             |
| ------------------------- | ---------------------------------------- | --------------------- |
| loading / deferred        | indicator Discord                        | —                     |
| empty                     | „Brak otwartych aktywności” (copy P4-D8) | —                     |
| success join/create       | opcjonalnie aktualizacja listy           | potwierdzenie         |
| error validation          | —                                        | czytelny powód        |
| unavailable (authz stale) | panel może pokazać niedostępność         | explain               |
| deny                      | —                                        | brak uprawnienia      |
| destructive               | —                                        | confirm cancel/delete |

## Kolor / emoji / ikony

**Nieustalone.** Indywidualny accent modułu musi pochodzić z kontrolowanej
palety V2 (D-024) — wybór właściciela + ChatGPT (Issue #12), nie Cursora.

Do czasu decyzji dokumenty używają oznaczenia `MODULE_ACCENT_PENDING`.

## Mobile

Główna ścieżka: otwarcie selecta → jedna akcja → ephemeral/modal.
Bez poziomego przeładowania tekstem i bez wielostopniowych publicznych ekranów.

## Test plan UX (po implementacji)

- desktop + mobile Discord;
- deny / allow / stale;
- double-click / retry Discord nie duplikuje join/create;
- restart gateway;
- empty list i lista z limitem widocznych pozycji.
