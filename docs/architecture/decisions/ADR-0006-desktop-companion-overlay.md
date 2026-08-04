# ADR-0006 — Desktop Companion i nakładka na grę

## Status

ACCEPTED

## Data

2026-08-04

## Kontekst

V2 ma działać nie tylko przez Discord i WWW. Użytkownik ma mieć możliwość zainstalowania aplikacji komputerowej, która podczas gry wyświetla konfigurowalne widgety oraz pozwala wykonywać szybkie akcje bez przełączania okien.

Przykładowe działania przyszłego klienta desktopowego:

- otwarcie głównego panelu skrótem klawiszowym;
- zgłoszenie potrzeby wsparcia;
- oznaczenie metina, bossa, spotu albo innego punktu operacyjnego;
- utworzenie lub aktualizacja zgłoszenia;
- odbiór odpowiedzi, zmian statusu i powiadomień;
- wyświetlanie wybranych stałych albo chwilowych widgetów na ekranie gry.

Aplikacja desktopowa, bot Discord i platforma WWW nie mogą posiadać osobnych kopii logiki ani danych.

## Decyzja

Desktop Companion jest od początku traktowany jako pełnoprawny interfejs platformy V2, równorzędny wobec Discorda, Web i Admina.

Docelowy przepływ:

```text
Desktop Companion / Overlay
            |
            v
        Backend V2
       /    |     \
Discord  Web/Admin  pozostałe integracje
```

### Zasady architektoniczne

- Aplikacja desktopowa komunikuje się z backendem V2, nie bezpośrednio z procesem bota.
- Backend pozostaje źródłem prawdy dla zgłoszeń, stanów, uprawnień, cooldownów i historii.
- Bot Discord jest adapterem publikującym oraz odbierającym działania z Discorda.
- Zmiana wykonana w nakładce może aktualizować Discord, WWW i inne aktywne klienty w czasie rzeczywistym.
- Zmiana wykonana na Discordzie może pojawić się w nakładce użytkownika bez ręcznego odświeżania.
- Wszystkie operacje zmieniające stan muszą być autoryzowane, idempotentne i odporne na ponowienie, restart oraz chwilową utratę połączenia.
- Klient desktopowy nie przechowuje trwałej logiki biznesowej, której nie posiada backend.

### Model nakładki

Pierwszą preferowaną implementacją jest bezpieczna zewnętrzna nakładka dla Windows:

- osobny proces aplikacji;
- przezroczyste okno zawsze nad wykrytym oknem gry;
- śledzenie pozycji, rozmiaru, aktywności i monitora okna gry;
- tryb click-through, gdy panel jest zamknięty;
- przejmowanie myszy i klawiatury wyłącznie po świadomym otwarciu panelu;
- konfigurowalne skróty globalne;
- obsługa trybu okienkowego i bezramkowego jako wymagany pierwszy zakres.

Domyślnie zabronione jest:

- wstrzykiwanie kodu do procesu gry;
- odczyt lub modyfikacja pamięci gry;
- hookowanie funkcji gry bez osobnego ADR-u, analizy antycheat i jawnej zgody właściciela;
- automatyzowanie sterowania postacią lub mechanik rozgrywki;
- rozwiązanie, które może być traktowane jak cheat.

### Platforma

- Windows 10/11 jest pierwszą platformą docelową.
- macOS i Linux nie są gwarantowane w pierwszej wersji.
- true exclusive fullscreen nie jest wymaganiem pierwszej wersji; priorytetem jest windowed oraz borderless fullscreen.
- Technologia powłoki desktopowej i renderera pozostaje do wyboru w osobnym ADR przed rozpoczęciem implementacji.

### Tożsamość i bezpieczeństwo

- Logowanie klienta desktopowego odbywa się przez tożsamość Discord powiązaną z PlatformUser.
- Token bota Discord nigdy nie trafia do klienta desktopowego.
- Klient otrzymuje wyłącznie własną sesję użytkownika z ograniczonym zakresem.
- Akcje administracyjne wymagają tych samych uprawnień i ewentualnego step-up auth co WWW.
- Aktualizacje aplikacji muszą być podpisane i dostarczane przez kontrolowany kanał.
- Telemetria, crash reports i logi muszą unikać sekretów oraz prywatnych treści.

## Konsekwencje

### Pozytywne

- Użytkownik wykonuje szybkie akcje bez wychodzenia z gry.
- Discord, WWW i overlay pokazują ten sam stan.
- Moduły produktowe mogą udostępniać różne interfejsy bez kopiowania logiki.
- Bezpieczna nakładka zewnętrzna ogranicza ryzyko antycheat i destabilizacji klienta gry.

### Negatywne

- Powstaje dodatkowy klient wymagający instalatora, aktualizacji, podpisywania i testów Windows.
- Obsługa wielu trybów ekranu, DPI i konfiguracji monitorów zwiększa koszt testów.
- Nie każda gra i konfiguracja graficzna zagwarantuje identyczne działanie.
- Real-time i tryb offline wymagają jawnego modelu synchronizacji oraz odzyskiwania stanu.

## Decyzje odroczone

Przed implementacją ustalimy osobno:

- technologię aplikacji desktopowej;
- sposób renderowania nakładki;
- globalne skróty i ich konflikty;
- zakres pierwszych widgetów;
- tryb instalacji i automatycznych aktualizacji;
- podpisywanie kodu;
- wykrywanie procesu/okna gry;
- zachowanie offline;
- dokładne limity telemetrii;
- wsparcie wielu klientów gry i monitorów.

## Kryterium wejścia do implementacji

Implementacja Desktop Companion może rozpocząć się dopiero po stabilnym fundamencie backendu, tożsamości, autoryzacji, real-time oraz podstawowej integracji Discord Gateway. Szczegółowy UX i wygląd widgetów zatwierdzamy na etapie tego modułu.
