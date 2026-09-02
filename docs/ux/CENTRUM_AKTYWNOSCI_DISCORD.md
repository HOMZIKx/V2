# Centrum Aktywności — Discord UX / Components V2 contract (P4)

## Status

`READY_FOR_OWNER_DISCORD_VISUAL_REVIEW`

OWNER VISUAL CORRECTION: previous accent-only pass rejected as insufficient.

CURRENT: Discord Activity visual layout redesigned (Hub groups DZIAŁAJ / TWOJE,
event hierarchy, draft preview). Not a global design-system approval and not a
Discord visual approval until the owner reviews the live panel.

`INTERACTIVE_LAYOUT_CONTRACT` remains in force. Assets / iconography still
`OWNER_DECISION_REQUIRED` (Issue #12). Issue #20 (dungeon LFG discovery)
**NOT IMPLEMENTED**.

Szkielet interakcji zgodny z decyzjami właściciela A–S oraz
`docs/ux/DISCORD_POST_INTERACTION_STANDARD.md` (D-023, D-024).

**Sedno:** wiadomość Discord Components V2 jako **panel** — sekcje z
przypisanymi akcjami; przyciski integralne z układem; aktualizacja in-place.
**Nie** projektujemy statycznego PNG z przyciskami doklejonymi pod grafiką.

Finalne: assety, kolory, ikony, typografia, ornamenty, copy poza
zaakceptowanymi etykietami = `OWNER_DECISION_REQUIRED` (P4-D8 / Issue #12).

## Platforma — Components V2 (obowiązkowe)

Wiadomości Centrum i wydarzeń używają flagi **`IS_COMPONENTS_V2`** (`1 << 15`).
Po ustawieniu flaga jest trwała na wiadomości; klasyczne `content` / `embeds`
nie są używane jako nośnik layoutu.

Dozwolone typy (zgodnie z oficjalnym Discord Components V2):

| Typ           | Rola w Centrum                                         |
| ------------- | ------------------------------------------------------ |
| Container     | Jedna ramka panelu / posta wydarzenia                  |
| Section       | Moduł tekstu + **jeden** accessory (Button\|Thumbnail) |
| Text Display  | Markdown tekstu                                        |
| Separator     | Podział wizualny między sekcjami                       |
| Media Gallery | Opcjonalny dekoracyjny banner (nieinteraktywny)        |
| Thumbnail     | Dekoracyjna miniatura (accessory Section)              |
| Action Row    | Rzędy Button / Select Menu (RSVP, akcje zbiorcze)      |
| Button        | Natywna akcja                                          |
| Select Menu   | Natywna lista (np. wybór w prywatnych widokach)        |

### Zakazy platformowe (nie projektować)

- Klikalne obszary obrazu / hotspoty na PNG.
- Własny HTML/CSS w wiadomości.
- Własne rozmiary przycisków.
- Klikalność całej sekcji (tylko accessory Button lub Action Row).
- Niestandardowe tła pod natywnymi komponentami.
- Nakładanie przycisków na grafikę.
- Reakcje emoji jako nawigacja lub RSVP.

### Grafika — wyłącznie dekoracja

Banner / nagłówek / ikona / miniatura / nieinteraktywne tło assetu.
**Podstawowe akcje = natywne Button / Select Menu.**

## Zaakceptowane etykiety funkcji (produkt, nie assety)

**Panel:** Utwórz aktywność | Szukam ekipy | Moje aktywności | Powiadomienia.

**Post wydarzenia (zaakceptowane / funkcje):** Lista uczestników | Kontakt |
Więcej | Zgłoś.

**RSVP:** odpowiedniki konfigurowalne (system musi obsługiwać znaczenie
Będę / Może będę / Nie będę); **nie** hardcodować finalnych nazw ani stałej
liczby przycisków jako jedynego modelu.

Copy opisów sekcji, placeholderów Select, stylów Button (Primary/Secondary/…)
poza etykietami powyżej = `OWNER_DECISION_REQUIRED`.

---

## A. Component tree — stały panel Centrum

Jedna wiadomość, **jeden Container**, flaga `IS_COMPONENTS_V2`.

```
Message [flags: IS_COMPONENTS_V2]
└── Container (accent = `#D48632` / `0xD48632` — OWNER ACCEPTED module accent, D-038)
    ├── Text Display — Centrum Aktywności + jedno zdanie intro
    ├── Separator
    ├── Text Display — **DZIAŁAJ**
    ├── Section „Utwórz aktywność”
    │     ├── Text Display — etykieta + krótki opis
    │     └── accessory Button — label: „Utwórz” (Secondary)
    ├── Section „Szukam ekipy”
    │     ├── Text Display — etykieta + krótki opis
    │     └── accessory Button — label: „Szukaj” (Secondary)
    ├── Separator
    ├── Text Display — **TWOJE**
    ├── Section „Moje aktywności”
    │     ├── Text Display — etykieta + krótki opis
    │     └── accessory Button — label: „Otwórz” (Secondary)
    └── Section „Powiadomienia”
          ├── Text Display — etykieta + krótki opis
          └── accessory Button — label: „Sprawdź” (Secondary)
```

**Wymóg:** przyciski przy odpowiadających sekcjach (Section.accessory),
**nie** jeden oderwany Action Row pod całą wiadomością.

Opcjonalny footer / Text Display stanu (np. Authz unavailable) tylko gdy
niesie stan operacyjny.

---

## B. Component tree — publiczny post wydarzenia

Jedna wiadomość, **jeden Container**. Treść publiczna **identyczna dla wszystkich**
użytkowników (brak publicznych przycisków admin-only).

```
Message [flags: IS_COMPONENTS_V2]
└── Container
    ├── Text Display — nagłówek: nazwa | rodzaj | status wydarzenia
    ├── Text Display — data, godzina, przewidywany czas (jeśli jest),
    │                 miejsce albo kanał
    ├── Text Display — organizator; współorganizator (jeśli jest)
    ├── Text Display — opis (jeśli jest; może być skrócony)
    ├── Separator
    ├── Text Display — licznik miejsc (zajęte/limit lub „bez limitu”)
    ├── Text Display — podsumowanie statusów uczestników
    │                 (agregaty wg skonfigurowanych StatusDef; nie hardcod nazw)
    ├── [opcjonalnie] Text Display — skrót listy (pierwsze osoby) przy długiej liście
    ├── Separator
    ├── Action Row RSVP (1..N Button według konfiguracji statusów guild/rodzaju;
    │     max 5 Button na row; kolejne row jeśli >5 — TECHNICAL layout)
    │     — odpowiedniki znaczeń: zajmuje miejsce / może / rezygnacja itd.
    └── Action Row secondary
          ├── Button „Lista uczestników”
          ├── Button „Kontakt”
          └── Button „Więcej”
```

Statusy RSVP są **konfigurowalne** (P4.3): layout musi renderować aktualny
katalog statusów dla rodzaju/serwera, nie zakładać zawsze trzech stałych nazw.

Opcjonalny wątek: tworzony przez organizatora; nie jest częścią component tree
wiadomości (osobna funkcja Discord Thread).

---

## C. Model „Więcej” — prywatna odpowiedź wg P3

Publiczny post **nie** zawiera osobnego zestawu przycisków administracyjnych
widocznych dla każdego.

Po kliknięciu **Więcej**:

1. Gateway/handler identyfikuje użytkownika (Identity + membership).
2. Authorization (P3) ocenia permission keys dla kontekstu wydarzenia/guild.
3. Bot odpowiada **prywatnie** (ephemeral / DM-equivalent interaction response)
   widokiem dopasowanym do uprawnień.
4. **Uczestnik:** własne akcje (np. zmiana statusu gdy dozwolone, wyciszenie
   wydarzenia, Zgłoś, ewentualnie pola prywatne własne).
5. **Organizator / współorganizator:** zarządzanie wydarzeniem (edycja dozwolonych
   pól, zapisy open/close, usunięcie uczestnika, anulowanie z potwierdzeniem,
   wątek, VC istniejący, … wg produktu).
6. **Moderator** (grant P3 moderate): uprawnione akcje moderacyjne (edycja,
   anulowanie, przejęcie) — każda z powodem + audyt.

Widoki prywatne mogą używać: Text Display + Action Row + Select Menu + Modal
(nie muszą być Containerem publicznym; ephemeral Components V2 zgodnie z API).

### Wireframe — prywatne „Więcej” (logiczne)

```
[EPHEMERAL] — uczestnik
├── Text: kontekst wydarzenia (id / nazwa)
├── Action Row: [akcje własne] …
└── Action Row: [Zgłoś] …

[EPHEMERAL] — organizator
├── Text: zarządzanie
├── Action Row: [Edytuj…] [Zapisy…] [Uczestnicy…]
├── Action Row: [Anuluj…] [Wątek…] …
└── (destructive → confirm modal)

[EPHEMERAL] — moderator
├── Text: moderacja (guild scope)
├── Action Row: [Edytuj] [Anuluj] [Przejmij]
└── każda → powód (modal) + audit
```

Dokładne etykiety poza zaakceptowanymi = `OWNER_DECISION_REQUIRED`.

---

## D. Katalog interakcji

Konwencja kolumn:

- **type** — Button | Select | Modal
- **tree** — pozycja
- **label** — widoczny tekst (zaakceptowany lub OWNER_DECISION_REQUIRED)
- **meaning** — znaczenie produktowe
- **custom_id** — format wersjonowany
- **perm** — wymagane permission (TECH proposal; final ID = OWNER_DECISION_REQUIRED)
- **after** — zachowanie po kliknięciu
- **vis** — public | private (ephemeral)
- **modal** — tak/nie
- **edit_msg** — czy edytuje oryginalną wiadomość publiczną
- **loading** — defer / thinking
- **disabled** — kiedy disabled
- **deny** — błąd uprawnień
- **stale** — stary/wygasły post
- **idem** — idempotency
- **audit** — wpis audytu

### D.1 Panel Centrum

| id  | type             | tree                  | label            | meaning                                | custom_id                  | perm                       | after                                              | vis     | modal        | edit_msg | loading | disabled                 | deny           | stale                       | idem                | audit         |
| --- | ---------------- | --------------------- | ---------------- | -------------------------------------- | -------------------------- | -------------------------- | -------------------------------------------------- | ------- | ------------ | -------- | ------- | ------------------------ | -------------- | --------------------------- | ------------------- | ------------- |
| P1  | Button accessory | Panel § Utwórz        | Utwórz aktywność | Start tworzenia one-shot               | `activity:v1:panel:create` | `….event.create`           | Otwiera prywatny formularz/modal (jeden formularz) | private | tak (form)   | nie      | defer   | brak create / Authz down | ephemeral deny | reject + hint odśwież panel | key per user+action | optional open |
| P2  | Button accessory | Panel § Szukam        | Szukam ekipy     | Szybkie tworzenie tej samej aktywności | `activity:v1:panel:lfg`    | `….event.create`           | Uproszczony prywatny formularz                     | private | tak          | nie      | defer   | j.w.                     | ephemeral deny | j.w.                        | j.w.                | optional      |
| P3  | Button accessory | Panel § Moje          | Moje aktywności  | Prywatny widok 4 bucketów              | `activity:v1:panel:mine`   | membership + login context | Ephemeral lista / select                           | private | nie / select | nie      | defer   | Authz/Identity down      | deny           | j.w.                        | read idempotent     | nie           |
| P4  | Button accessory | Panel § Powiadomienia | Powiadomienia    | Prywatna skrzynka                      | `activity:v1:panel:inbox`  | membership                 | Ephemeral inbox                                    | private | nie          | nie      | defer   | j.w.                     | deny           | j.w.                        | read                | nie           |

### D.2 Post wydarzenia — publiczne

| id  | type            | tree            | label             | meaning                            | custom_id                                        | perm                               | after                                                     | vis                   | modal                              | edit_msg               | loading | disabled                                                     | deny                | stale                 | idem                              | audit             |
| --- | --------------- | --------------- | ----------------- | ---------------------------------- | ------------------------------------------------ | ---------------------------------- | --------------------------------------------------------- | --------------------- | ---------------------------------- | ---------------------- | ------- | ------------------------------------------------------------ | ------------------- | --------------------- | --------------------------------- | ----------------- |
| E1  | Button × N      | Action Row RSVP | _StatusDef.label_ | Ustaw status uczestnictwa          | `activity:v1:event:<opaque-id>:rsvp:<status-id>` | `….event.join` (+ membership)      | Walidacja limitu/waitlist/conflict warn; update projekcji | public state via edit | pola katalogu → modal gdy wymagane | **tak** (ten sam post) | defer   | zapisy zamknięte (wyjątek rezygnacja); event ended/cancelled | ephemeral           | reject; offer refresh | idempotency-key user+event+status | tak (rsvp change) |
| E2  | Button          | Action Row 2    | Lista uczestników | Pełna lista publiczna (nick/class) | `activity:v1:event:<opaque-id>:participants`     | membership (visibility rules)      | Ephemeral lub update-safe private list                    | private               | nie                                | nie*                   | defer   | event deleted                                                | deny / private-only | stale reject          | read                              | nie               |
| E3  | Button          | Action Row 2    | Kontakt           | Kontakt z organizatorem            | `activity:v1:event:<opaque-id>:contact`          | membership                         | Ephemeral instrukcja/kontakt (bez doxx w public)          | private               | nie                                | nie                    | defer   | brak org                                                     | deny                | stale                 | read                              | nie               |
| E4  | Button          | Action Row 2    | Więcej            | Menu kontekstowe wg P3             | `activity:v1:event:<opaque-id>:more`             | membership; dalsze akcje per grant | Generuje prywatne menu (§C)                               | private               | nie (dalej może)                   | nie                    | defer   | —                                                            | deny base           | stale                 | read                              | nie               |
| E5  | Button (w menu) | ephemeral       | Zgłoś             | Zgłoszenie                         | `activity:v1:event:<opaque-id>:report`           | membership                         | Modal powodu z katalogu                                   | private               | tak                                | nie                    | defer   | —                                                            | deny                | stale                 | once per report body              | tak               |

\*Lista długa: skrót na poście publicznym aktualizowany przy zmianach RSVP;
pełna lista = prywatna odpowiedź.

### D.3 Zarządzanie (tylko ephemeral po „Więcej” lub Moje aktywności)

| id  | meaning                   | custom_id (przykład)                      | perm TECH                                      | modal            | edit public msg         | audit    |
| --- | ------------------------- | ----------------------------------------- | ---------------------------------------------- | ---------------- | ----------------------- | -------- |
| M1  | Edycja opisu/miejsca/info | `activity:v1:event:<id>:edit:soft`        | `….event.manage.self` / `….event.manage.guild` | tak              | tak jeśli public fields | tak      |
| M2  | Zmiana terminu (istotna)  | `activity:v1:event:<id>:edit:schedule`    | `….event.manage.self` / `….event.manage.guild` | tak + confirm    | tak + notify            | tak      |
| M3  | Zamknij/otwórz zapisy     | `activity:v1:event:<id>:regs:close\|open` | `….event.manage.self` / `….event.manage.guild` | confirm optional | tak                     | tak      |
| M4  | Usuń uczestnika           | `activity:v1:event:<id>:kick`             | `….event.manage.self` / `….event.manage.guild` | tak (powód)      | tak                     | tak      |
| M5  | Anuluj wydarzenie         | `activity:v1:event:<id>:cancel`           | `….event.manage.self` / `….event.manage.guild` | tak (powód)      | tak                     | tak      |
| M6  | Przejmij (mod)            | `activity:v1:event:<id>:takeover`         | `….event.manage.guild`                         | tak (powód)      | tak                     | tak      |
| M7  | Utwórz wątek              | `activity:v1:event:<id>:thread`           | `….event.manage.self`                          | nie              | nie (thread)            | optional |

Destructive → zawsze confirmation (standard D-023).

---

## E. Format `custom_id`

### Reguły

```
activity:v1:<scope>:<…>
```

- Prefiks domeny: `activity`
- Wersja kontraktu: `v1` (bump przy breaking change layoutu/handlera)
- **opaque-id** wydarzenia: nieprzewidywalny identyfikator projekcji/korelacji
  (nie sekwencyjny „ładny” numer jako jedyny sekret)
- **status-id**: ID definicji statusu z backendu (nie zaufanie do label z klienta)

### Przykłady

```
activity:v1:panel:create
activity:v1:panel:lfg
activity:v1:panel:mine
activity:v1:panel:inbox
activity:v1:event:<opaque-id>:rsvp:<status-id>
activity:v1:event:<opaque-id>:participants
activity:v1:event:<opaque-id>:contact
activity:v1:event:<opaque-id>:more
activity:v1:event:<opaque-id>:report
activity:v1:event:<opaque-id>:edit:schedule
```

### Zakaz w `custom_id`

- Sekrety, tokeny, podpisowe materiały w plaintext bez osobnego mechanizmu
  (jeśli P1 używa signed components — podpis poza zaufaniem do pól biznesowych).
- Dane osobowe (nick, email, discord snowflake jako PII w zbędnym zakresie).
- Pełne opisy, powody, treści formularzy.
- Pola, którym klient mógłby ufać bez ponownej walidacji backendu
  (np. „isOrganizer=true”, „limit=10”).

Backend **zawsze** ponownie: authn → authz P3 → load event → validate transition.

Limit długości Discord `custom_id` (100 znaków) — opaque-id musi być krótki
(np. ULID/base32); mapowanie w Redis/DB jeśli potrzeba.

---

## F. Aktualizacja wiadomości (in-place)

Interakcje / joby **edytujące ten sam post** (Message Edit / interaction update),
**bez** publikacji kolejnej statusowej wiadomości na kanale:

| Zdarzenie                         | Edit public post                                                           |
| --------------------------------- | -------------------------------------------------------------------------- |
| Zmiana RSVP                       | tak                                                                        |
| Awans z listy rezerwowej          | tak                                                                        |
| Zmiana liczby / limitu miejsc     | tak                                                                        |
| Start → W trakcie                 | tak                                                                        |
| Zakończenie                       | tak                                                                        |
| Anulowanie                        | tak                                                                        |
| Istotna edycja (termin, nazwa, …) | tak                                                                        |
| Soft edit (opis/miejsce)          | tak (pola publiczne)                                                       |
| Naprawa usuniętego posta (S)      | recreate = nowa wiadomość tylko gdy oryginał usunięty; potem znów in-place |

Powiadomienia uczestników → DM + skrzynka panelu — **nie** spam na kanale.

---

## G. Wireframe’y tekstowe

### G.1 Panel główny (publiczny)

```
┌─ Container ─────────────────────────────────────────┐
│ [Media Gallery: banner dekoracyjny — opcjonalny]    │
│ Text: {NAZWA_PANELU}                                │
│ Text: {KRÓTKI_OPIS}                                 │
│ ──────── Separator ────────                         │
│ Section: Utwórz aktywność                           │
│   Text: {opis}                    [Button: Utwórz…] │
│ ──────── Separator ────────                         │
│ Section: Szukam ekipy                               │
│   Text: {opis}                    [Button: Szukam…] │
│ ──────── Separator ────────                         │
│ Section: Moje aktywności                            │
│   Text: {opis}                    [Button: Moje…]   │
│ ──────── Separator ────────                         │
│ Section: Powiadomienia                              │
│   Text: {opis}                    [Button: Powiad…] │
└─────────────────────────────────────────────────────┘
PUBLICzne | akcje → odpowiedzi PRYWATNE
```

### G.2 Wydarzenie planowane (publiczny)

```
┌─ Container ─────────────────────────────────────────┐
│ Text: {nazwa} · {rodzaj} · {status: planowane}      │
│ Text: {data} {godzina} · {czas?} · {miejsce/kanał}  │
│ Text: Org: {nick} · Współ: {nick?}                  │
│ Text: {opis?}                                       │
│ ──────── Separator ────────                         │
│ Text: Miejsca: {n}/{limit|∞}                        │
│ Text: Statusy: {agregaty StatusDef…}                │
│ Text: {skrót listy?}                                │
│ ──────── Separator ────────                         │
│ ActionRow RSVP: [S1] [S2] [S3] …                    │
│ ActionRow: [Lista uczestników] [Kontakt] [Więcej]   │
└─────────────────────────────────────────────────────┘
```

### G.3 Wydarzenie w trakcie (publiczny)

```
… jak wyżej; status = W trakcie
RSVP: disabled poza dozwoloną rezygnacją (produkt E)
ActionRow secondary: bez zmian strukturalnych
```

### G.4 Wydarzenie anulowane (publiczny)

```
… status = Anulowane
RSVP: wszystkie disabled
Secondary: Lista (read) / Kontakt? / Więcej (read-only + Zgłoś?)
Brak nowej wiadomości statusowej na kanale — tylko edit tego posta
```

### G.5–G.7 Menu „Więcej” — patrz §C (wyłącznie PRYWATNE)

---

## H. Formularz tworzenia (prywatny)

- Jeden większy formularz / zestaw prywatnych komponentów + modal —
  **nie** kreator krok po kroku.
- Anuluj + powrót do panelu głównego.
- **Bez** zbędnego „Wstecz” w jednym formularzu.
- Szkic 24 h; przed publikacją podgląd (ephemeral Components V2).
- Pola obowiązkowe produktowe bez zmian.

## I. Stany obowiązkowe

| Stan              | Publiczne                         | Prywatne           |
| ----------------- | --------------------------------- | ------------------ |
| loading           | Discord deferred na interakcji    | —                  |
| empty             | copy OWNER_DECISION_REQUIRED      | puste Moje / inbox |
| success           | update in-place                   | potwierdzenie      |
| validation error  | —                                 | powód              |
| authz unavailable | niedostępność akcji / panel state | explain            |
| deny              | —                                 | brak uprawnienia   |
| destructive       | —                                 | confirm            |
| cancelled/ended   | status + disabled RSVP            | read-only manage   |

## J. Publikacja panelu (TECHNICAL_OPEN)

Produkt: stały post + update in-place + Section accessories.
Mechanizm publish (slash operatora vs auto) = P4-D6 TECHNICAL_OPEN.
`/panel-test` P1 ≠ produkcyjne Centrum.

## K. Test plan — layout interaktywny (zamiast golden-image całej wiadomości)

1. Snapshoty **payloadów** Components V2 (JSON tree) per wariant.
2. Walidacja limitu komponentów Discord (≤40) i limitów Action Row.
3. Unikalność `custom_id` w jednej wiadomości.
4. Mapowanie `custom_id` → command/handler.
5. Permission keys P3 (allow/deny) dla każdej akcji.
6. Prywatna odpowiedź „Więcej” (participant / organizer / moderator).
7. Aktualizacja **tej samej** message id po RSVP / lifecycle.
8. Brak podwójnej publikacji statusowej na kanale.
9. Przeterminowana / stale component interaction.
10. Zgodność układu dla statusów wydarzenia: planned / in_progress /
    cancelled / ended (+ registrations open/closed).

Golden-image **wyłącznie** dla zatwierdzonych bannerów/assetów (Issue #12) —
nie dla interaktywności.

## L. Mobile

Section accessory + Action Row → jedna akcja → ephemeral/modal.
Bez łańcuchów publicznych wiadomości.

## M. Relacja do Issue #12 / P4-D8

### OWNER VISUAL DECISION — CENTRUM AKTYWNOŚCI

(`P4-DISCORD-VISUAL-CORRECTION-001` / D-038; powiązane z Issue #12)

- **Activity module accent:** `#D48632` (`0xD48632`)
- Kierunek: dark graphite / burnt amber / steel navy / parchment / small old gold
  (Issue #12) — **zatwierdzony accent modułu**, nie pełny globalny design system V2
- Centrum **nie** korzysta z V2 LAB `panel-theme.ts` / `#7C3AED`
- Normalne przyciski Discord: `ButtonStyle.Secondary` (nie Primary/niebieski CTA)
- Destructive: `Danger`; Success tylko gdy naprawdę success
- Struktura Components V2 (one Container + Section accessories) **bez zmian**
- Bannery / emoji / pełny design system: nadal mogą być rozwijane w Issue #12
- **Szukam ekipy / dungeon LFG discovery:** przyszły etap = Issue #20 — **nie**
  zaimplementowane w tym tasku; publiczne copy pozostaje neutralne

| Warstwa                         | Status                                                  |
| ------------------------------- | ------------------------------------------------------- |
| Component tree / custom_id / UX | CONTRACT w tym dokumencie                               |
| Module accent Container         | **OWNER ACCEPTED** `#D48632` (D-038)                    |
| Banner, emoji, global DS        | OWNER_DECISION_REQUIRED — Issue #12 (poza accentem)     |
| P4.2a test guild                | **dozwolone** native V2 **bez** dekoracyjnego bannera   |
| Screenshot visual contract      | `REFERENCE_IMAGE_REQUIRED` w sesji closure (brak pliku) |
| Style Button (Secondary/…)      | OWNER ACCEPTED dla Centrum (Secondary = normal)         |

Wzór = **modułowość i panelowość**, nie klikalny obraz. Issue #12 **nie** blokuje test servera.

## N. Weryfikacja discord.js w repo (Components V2)

**Źródło prawdy:** `apps/discord-gateway` depends on `discord.js@14.25.1`
(lockfile `discord.js@14.25.1`); runtime checked via
`apps/discord-gateway` module resolution. P1 już importuje
`ContainerBuilder`, `TextDisplayBuilder`, `SeparatorBuilder`,
`MediaGalleryBuilder`, `ActionRowBuilder`, `ButtonBuilder`,
`StringSelectMenuBuilder`, `MessageFlags.IsComponentsV2` w
`panel-renderer.ts`.

Import wzorcowy:

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  ThumbnailBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
```

`SectionBuilder` API (builders): `addTextDisplayComponents`,
`setButtonAccessory`, `setThumbnailAccessory`.
`ContainerBuilder`: `addSectionComponents`, `addSeparatorComponents`,
`addTextDisplayComponents`, `addActionRowComponents`,
`addMediaGalleryComponents`, `setAccentColor`.

| WYMAGANY ELEMENT              | OBSŁUGA W REPO                                 | RZECZYWISTE API                                          | OGRANICZENIE                                                           | DZIAŁANIE               |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| Container                     | **tak** (P1 używa)                             | `ContainerBuilder`                                       | jeden root typowy dla panelu                                           | użyć w P4.2             |
| Section                       | **tak** (export; P1 jeszcze nie używa Section) | `SectionBuilder` + `container.addSectionComponents`      | accessory = Button **lub** Thumbnail                                   | layout Centrum          |
| accessory Button              | **tak**                                        | `section.setButtonAccessory(ButtonBuilder)`              | nie HTML/PNG hit-area                                                  | P4.2                    |
| Text Display                  | **tak**                                        | `TextDisplayBuilder.setContent`                          | limity treści Discord                                                  | P4.2                    |
| Separator                     | **tak**                                        | `SeparatorBuilder` + `SeparatorSpacingSize`              | divider/spacing                                                        | P4.2                    |
| Media Gallery                 | **tak**                                        | `MediaGalleryBuilder` / `MediaGalleryItemBuilder`        | assety = Issue #12                                                     | opcjonalnie po D8       |
| Thumbnail                     | **tak**                                        | `ThumbnailBuilder` / `setThumbnailAccessory`             | nie jako zamiennik Button CTA                                          | ostrożnie               |
| Action Row                    | **tak**                                        | `ActionRowBuilder`                                       | max **5** components / row (API Discord)                               | RSVP + Więcej           |
| Button                        | **tak**                                        | `ButtonBuilder` + `ButtonStyle`                          | label/emoji limity; `customId` 1–100                                   | P4.2                    |
| Select Menu                   | **tak**                                        | `StringSelectMenuBuilder`                                | option label/value ≤100                                                | panel P1; Centrum wg UX |
| `MessageFlags.IsComponentsV2` | **tak** (`32768`)                              | `MessageFlags.IsComponentsV2`                            | flaga trwała; **bez** klasycznego `content`/`embeds` na tej wiadomości | obowiązkowe             |
| Modal                         | **tak**                                        | `ModalBuilder` + `TextInputBuilder`                      | modal custom_id ≤100; pola tekstowe                                    | create/RSVP fields      |
| Ephemeral                     | **tak**                                        | `MessageFlags.Ephemeral`                                 | prywatne menu „Więcej”                                                 | P4.2                    |
| Update in-place               | **tak** (P1 refresh)                           | `message.edit` / `interaction.update` z components+flags | ten sam `message.id`                                                   | SoT backend             |
| custom_id                     | **tak**                                        | `setCustomId`                                            | **1–100** znaków (validators builders)                                 | wersjonowane; bez PII   |
| disabled components           | **tak**                                        | `ButtonBuilder.setDisabled` / select disabled            | stany ended/cancelled                                                  | P4.2                    |

### Limity techniczne (z builders + discord-api-types / praktyka P1)

- `custom_id`: 1–100 znaków (shapeshift validators w `@discordjs/builders`).
- Action Row: do 5 przycisków.
- Select option label/value/description: ≤100.
- Components V2 + legacy embeds/content na **tej samej** wiadomości: **unikać**
  (P1: flags V2, bez embeds na panelu publicznym).
- Całkowity budżet komponentów wiadomości: walidować snapshotami (UX §K; Discord
  limity top-level — test kontraktowy w P4.2).

### Aktualizacja discord.js?

**Nie wymagana** dla kontraktu Centrum na obecnym `14.25.1`. Brakujące względem
UX jest użycie `SectionBuilder` w rendererze produktowym (P4.2), nie brak API.

Jeżeli przyszły minor/major złamie builders: osobny PR dependency; regresja P1
`panel-renderer` + snapshoty. **Blocker P4.2 tylko gdyby API Section/accessory
zniknęło** — obecnie nie. Nie jest blockerem P4.1 (domain-only).

**Zakaz:** implementować „udawane V2” przez PNG + rząd przycisków jako obejście.

## O. Jeden spójny formularz użytkownika (Owner Amendment)

**Owner Amendment (P4-CLOSURE-REMEDIATION-001)** — zastępuje model sekcyjnych
przycisków edycji.

Flow: **Utwórz aktywność → jeden formularz → Podgląd → Publikuj**.

- Jeden prywatny ekran Components V2 ze wszystkimi wymaganymi informacjami.
- Natywne selecty (rodzaj, kanał); jeden modal ≤5 pól na tekst/datę/opis.
- **Zakaz** przycisków „Nazwa i opis”, „Data i godzina”, itd. jako osobnych
  ścieżek.
- Draft 24h; walidacja bez utraty danych; cancel; stale; mobile.
- P4.4 WWW bez kreatora.

Mapowanie pól: architecture §12. Permissions: `event.create` / `event.manage.self`.
