# P4 Centrum Aktywności — Handoff (planning only)

- **Task ID:** `P4-CENTRUM-AKTYWNOSCI-001`
- **Status:** `READY_FOR_OWNER_DECISIONS` (planning package — **no implementation**)
- **PR:** [#17](https://github.com/HOMZIKx/V2/pull/17)
- **Depends on:** P3 Authorization foundation **APPROVED + merged to `main`**
  (Issue #15, draft PR #16 / `cursor/p3-authorization-foundation`) before any
  implementacyjny PR P4.

## 1. Cel

Zaprojektować **pierwszy pionowy moduł produktowy bota** — **Centrum Aktywności** —
jako spójny, stały panel Discord (Components V2) oparty na fundamencie P3
Authorization, bez kopiowania architektury starego projektu.

Centrum Aktywności ma być centralnym wejściem do aktywności społecznościowych
(tworzenie, dołączanie, zarządzanie własnymi, stany i feedback), działającym
zgodnie z `docs/ux/DISCORD_POST_INTERACTION_STANDARD.md` oraz P3-D2/P3-D3
(Discord User ID wystarcza do zwykłych operacji Discorda; WWW login nie jest
wymagany dla tych funkcji).

Ten dokument jest **planem**. Implementacja kodu P4 jest zabroniona do czasu:

1. `APPROVED` planu P4 (po zamknięciu decyzji P4-D\* w `PENDING_DECISIONS.md`),
2. merge zatwierdzonego planu PR,
3. **merge P3 Authorization foundation** do `main`,
4. jawnego briefu implementacyjnego w `CHATGPT_TO_CURSOR.md` (`READY_FOR_CURSOR`),
5. checkpointu wizualnego Issue #12 dla elementów widocznych użytkownikowi,
6. osobnego PR implementacyjnego na gałęzi `cursor/…`.

## 2. Stan wyjściowy (repo / SoT)

| Element                               | Stan                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `main`                                | P2 Internal JWT scalony (`f299775` / PR #14)                                    |
| P3 Authorization                      | Draft PR #16 — `READY_FOR_REVIEW_P3_AUTHORIZATION_FOUNDATION`; **nie w `main`** |
| `discord-gateway`                     | P1 harness: `/status`, `/panel-test` Components V2                              |
| `identity-service`                    | P2 proof + internal JWT                                                         |
| `authorization-service`               | Szkielet na `main`; pełny fundament tylko na PR #16                             |
| `community-service` / activity DB     | **Brak**                                                                        |
| Issue #12 system graficzny            | OPEN — brak zatwierdzonej palety/emoji/bannerów produktowych                    |
| Nazwa produktowa „Centrum Aktywności” | Użyta w Issue #15 jako następny pion; **finalny branding UX** wymaga decyzji    |

## 3. Zakres planu P4 (dokumentacja)

### 3.1 W zakresie tego PR planistycznego

1. Definicja produktu i granic Centrum Aktywności.
2. Propozycja własności domeny i kontraktów (ADR Proposed).
3. Zależności od P3 Authorization (permissions, membership, explain).
4. Szkic flow Discord (publiczny panel + ephemeral) — **bez** finalnych assetów.
5. Katalog decyzji właściciela P4-D1… (BLOCKED do odpowiedzi).
6. Kryteria akceptacji przyszłej implementacji i bramki jakości.
7. Aktualizacja `PROJECT_STATE` / `CURSOR_TO_CHATGPT` / `PENDING_DECISIONS`.

### 3.2 Poza zakresem (twarde — teraz i w pierwszym PR implementacyjnym, o ile właściciel nie zdecyduje inaczej)

- jakikolwiek kod usług / migracji / UI w tym PR planistycznym;
- pełny katalog wszystkich przyszłych modułów bota;
- Desktop Companion, produkcyjny Admin UX, Zeabur;
- RabbitMQ Streams;
- kopiowanie starego monorepo / FlameCode;
- samodzielny wybór finalnej palety, emoji, bannerów i copy (Issue #12);
- MFA Admin, drugi OAuth provider, effective-access cache (chyba że osobna decyzja).

## 4. Obowiązujące decyzje nadrzędne (już ACCEPTED)

| Źródło        | Skutek dla P4                                                        |
| ------------- | -------------------------------------------------------------------- |
| P3-D2 B       | Membership/role po Discord User ID; bot może działać przed WWW login |
| P3-D3 A       | Discord = pełny interfejs; zwykłe aktywności bez WWW                 |
| P3-D4 B       | Funkcje sprawdzają permission IDs V2, nie nazwy ról Discord          |
| P3-D5 B       | Scope `organization` vs `guild:<id>`                                 |
| P3-D6 C       | Specificity + deny-wins; explainable decisions                       |
| P3-D7 C       | fresh/stale/unavailable; wrażliwe operacje fail-closed               |
| P3-D12/D16 A  | Opuszczenie/blokada nie kasuje historii aktywności                   |
| D-023 / D-024 | Stały panel, native components, oryginalna identyfikacja V2          |
| ADR-0001      | Nowa usługa tylko dla wyraźnej domeny; brak cross-DB                 |

## 5. Propozycja techniczna (wymaga P4-D\*)

Szczegóły: [CENTRUM_AKTYWNOSCI.md](../architecture/CENTRUM_AKTYWNOSCI.md),
[ADR-0014](../architecture/decisions/ADR-0014-centrum-aktywnosci-boundary.md) (Proposed).

**Rekomendacja techniczna (nie jest decyzją właściciela):**

1. Właścicielem danych aktywności powinna być **nowa usługa domenowa**
   (roboczo `community-service`) z osobną bazą PostgreSQL — nie
   `discord-gateway`, nie `authorization-service`, nie `identity-service`.
2. `discord-gateway` pozostaje adapterem: render panelu, interakcje, podpisane
   custom IDs, wywołania REST do community + authorize w Authorization.
3. Authorization pozostaje SoT allow/deny; community pyta o permission IDs
   produktu po zatwierdzeniu katalogu.
4. Pierwszy slice implementacyjny: **Discord-only hub + jeden typ aktywności**,
   potem kolejne typy — unika eksplozji zakresu.
5. Transport v1: synchroniczny HTTP + idempotency keys (jak P3 sync);
   Outbox/RabbitMQ jako porty pod kolejny slice, jeśli właściciel nie wybierze
   inaczej w P4-D5.

## 6. Decyzje wymagające właściciela

Zobacz `docs/ai/PENDING_DECISIONS.md` — sekcja **P4 Centrum Aktywności**:

| ID    | Temat                                                   |
| ----- | ------------------------------------------------------- |
| P4-D1 | Zakres v1 (hub only / hub+1 typ / szerszy katalog)      |
| P4-D2 | Pierwszy typ aktywności                                 |
| P4-D3 | Właściciel domeny / nazwa usługi                        |
| P4-D4 | Kanały w P4 (Discord only vs +WWW/Admin)                |
| P4-D5 | Transport zdarzeń (HTTP sync vs Outbox/RMQ od startu)   |
| P4-D6 | Model publikacji panelu (stały post + slash publish)    |
| P4-D7 | Katalog permission IDs produktu (minimalny zestaw v1)   |
| P4-D8 | Checkpoint wizualny (kolor modułu, emoji, banner, copy) |

Cursor **nie** wypełnia tych decyzji założeniami.

## 7. Kryteria akceptacji planu (audyt)

Plan może dostać `APPROVED` gdy:

1. P4-D1–P4-D8 mają `OWNER_ACCEPTED` albo jawne `DEFERRED` z uzasadnieniem;
2. ADR-0014 Status → Accepted (lub zastąpiony);
3. Issue #12 / P4-D8 pokrywa widoczne elementy pierwszego slice albo odkłada
   implementację UI do osobnego zatwierdzenia assetów;
4. zależność od merge P3 jest spełniona albo jawnie warunkuje brief implementacyjny;
5. brak ukrytego scope creep (Desktop, Zeabur, pełny RBAC produktowy).

## 8. Kryteria przyszłej implementacji (po APPROVED planu)

Osobny PR; nie ten. Minimum:

1. Domain/Application community bez Nest/Discord SDK/ORM/RMQ.
2. Runtime validation wejść; zakaz `any`.
3. Authorize + explain przed mutacjami; idempotencja interakcji Discord.
4. Stany panelu: loading, empty, success, error, unavailable, destructive confirm.
5. Testy unit/integration bez tokenu Discord; live gate na guild testowym.
6. `pnpm validate` zielone; brak sekretów w repo.
7. Dokumentacja zgodna z kodem; raport w `CURSOR_TO_CHATGPT.md`.

## 9. Operacje zabronione w tym etapie

1. Commit kodu implementacyjnego Centrum Aktywności.
2. Merge P3 lub P4 bez `APPROVED` właściciela.
3. Samodzielne nazwy UX, kolory, emoji, bannery „na razie”.
4. Import logiki biznesowej między usługami / cross-read DB.
5. Reakcje emoji jako nawigacja.
6. Wymaganie WWW loginu dla zwykłych aktywności Discord (sprzeczne z P3-D3),
   o ile właściciel nie wyda nowej decyzji zastępującej.

## 10. Następny krok po APPROVED planu

1. Właściciel scala P3 (jeśli jeszcze nie).
2. ChatGPT zapisuje brief `READY_FOR_CURSOR` w `CHATGPT_TO_CURSOR.md`.
3. Cursor otwiera gałąź implementacyjną i **jeden** draft PR zgodnie z briefem.
4. Live test na `1534228693017432124` przed `READY_FOR_REVIEW`.
