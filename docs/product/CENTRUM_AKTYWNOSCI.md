# Centrum Aktywności — specyfikacja produktu (P4)

## Status

`OWNER_PRODUCT_ACCEPTED — implementation gated on P3 merge + READY_FOR_CURSOR brief`

Nazwa robocza „Centrum Aktywności” pochodzi z Issue #15. **Finalny branding,
copy przycisków (poza już zaakceptowanymi etykietami funkcji), kolory, emoji i
grafiki** = `OWNER_DECISION_REQUIRED` (Issue #12 / dawne P4-D8).

Zatwierdzone etykiety funkcji głównego panelu (treść produktu, nie assety):

- Utwórz aktywność
- Szukam ekipy
- Moje aktywności
- Powiadomienia
- Zgłoś

Odpowiedniki statusów RSVP (system musi je obsługiwać; administrator może
skonfigurować inaczej): Będę / Może będę / Nie będę.
Żadnych innych nazw widocznych ani placeholderów UI w tej specyfikacji.

## Źródło decyzji

Decyzje produktowe właściciela (A–S) z briefu
`P4-CENTRUM-AKTYWNOSCI-SPEC-PREP-001`. Nie zmieniać ich rekomendacjami
technicznymi. Discord i WWW używają **tego samego** backendu, danych i reguł.
P3 Authorization jest **jedynym** źródłem uprawnień — brak równoległego RBAC
w module aktywności. Identity i Authorization pozostają osobnymi granicami i
bazami.

## 1. Role i uprawnienia (produkt)

| Rola produktowa                        | Kto                       | Tworzenie                                                                              | Publikacja Discord                   | Moderacja                                         |
| -------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| Zwykły członek                         | Membership + grant create | Tylko jednorazowe; max 4 aktywne własne; max 14 dni do przodu; jeden dozwolony Discord | Tylko dozwolone kanały swojego scope | Nie                                               |
| Organizator wydarzenia                 | Autor / przejęty          | —                                                                                      | Zgodnie z własnymi limitami          | Edycja/RSVP manage własnego wydarzenia            |
| Współorganizator                       | Max 1 na wydarzenie       | —                                                                                      | —                                    | Edycja wydarzenia + zarządzanie uczestnikami      |
| Uprawniony organizator / administracja | Permission P3             | Może cykle i szerszy horyzont                                                          | Może wiele Discordów                 | Zależnie od grantów                               |
| Moderator guild                        | Permission P3 moderate    | —                                                                                      | —                                    | Edycja / anulowanie / przejęcie na swoim serwerze |

Szczegółowe permission keys: [CENTRUM_AKTYWNOSCI.md](../architecture/CENTRUM_AKTYWNOSCI.md)
(§ Permission mapping). Finalne stringi ID = `OWNER_DECISION_REQUIRED`.

## 2. Model aktywności

- Aktywność należy do **gry skonfigurowanej na danym serwerze**.
- **Rodzaje aktywności** konfiguruje administrator.
- Opcja **„Inna aktywność”** może istnieć i być włączana/wyłączana **osobno na każdym serwerze**.
- Pola obowiązkowe przy tworzeniu: nazwa, rodzaj, termin, serwer, kanał publikacji.
- Opis — opcjonalny.
- Godzina zakończenia **lub** przewidywany czas trwania — opcjonalne.
- Katalog dodatkowych pól uczestnika (postać, klasa, rola w drużynie, krótki tekst)
  konfiguruje administrator; organizator **wybiera z katalogu**, nie tworzy
  dowolnych pytań.
- Stabilne ID wydarzenia + link.
- Dane wydarzeń są przechowywane w historii (anulowane też, z wyjątkami poniżej).

## 3. Statusy i RSVP

- Statusy uczestnictwa konfiguruje administrator; mogą być przypisane do rodzaju aktywności.
- Serwer ma ustawienia domyślne.
- Każdy status ma flagę **czy zajmuje miejsce w limicie**.
- System musi obsługiwać odpowiedniki: Będę / Może będę / Nie będę (bez hardcodu
  jako jedynego modelu).
- Organizator automatycznie dostaje status odpowiadający „Będę”.
- Konflikt z innym wydarzeniem → **ostrzeżenie**, nie blokada.
- Po zamknięciu zapisów uczestnik może tylko zrezygnować; powód rezygnacji opcjonalny.
- Po istotnej zmianie terminu uczestnicy dostają status „Wymaga potwierdzenia” i
  muszą ponownie wybrać status.

## 4. Limity i lista rezerwowa

- Limit uczestników opcjonalny.
- Po limicie kolejne osoby → lista rezerwowa.
- Zwolnienie miejsca → pierwsza osoba z listy automatycznie awansuje do statusu
  zajmującego miejsce + powiadomienie.
- Lista uczestników jest publiczna.
- Przy długiej liście główny post: pierwsze osoby, licznik, przycisk pełnej listy
  (copy przycisku = `OWNER_DECISION_REQUIRED` poza funkcją „pełna lista”).

## 5. Zapisy i terminy

- Organizator może ustawić termin zamknięcia zapisów; domyślnie = start wydarzenia.
- Może zamknąć wcześniej i ponownie otworzyć; obie operacje w historii.
- Zmiana terminu wymaga **osobnego potwierdzenia**; zawsze generuje powiadomienie;
  uczestnicy → „Wymaga potwierdzenia”.

## 6. Pełny cykl życia

| Moment                         | Zachowanie                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Publikacja zwykłego wydarzenia | Od razu, bez akceptacji moderatora                                                             |
| Start                          | Zapisy zamykane; status „W trakcie”                                                            |
| Po starcie                     | Edytowalne tylko: opis, miejsce, info organizacyjne                                            |
| Brak podanego zakończenia      | Bot kończy automatycznie po **2 godzinach**                                                    |
| Anulowanie przez organizatora  | Wymaga powodu; powiadomienie wszystkich zapisanych; historia zachowana                         |
| Usunięcie trwałe               | Tylko wydarzenie **bez uczestników** przed startem                                             |
| Post Discord                   | Może zostać usunięty po czasie skonfigurowanym przez administratora; dane w backendzie zostają |

## 7. Organizatorzy

- Organizator może się wypisać z RSVP, ale rezygnacja z roli organizatora wymaga:
  - przekazania współorganizatorowi, **albo**
  - anulowania wydarzenia.
- Max jeden współorganizator; może edytować i zarządzać uczestnikami.
- Organizator opuszcza Discord → przejmuje współorganizator; brak → moderator.
- Blokada organizatora → aktywne wydarzenia do moderatora.
- Usunięcie uczestnika przez organizatora: powód wymagany, powiadomienie, audyt.

## 8. Pingi i kanały

- Administrator ustala dozwolone kanały publikacji **per Discord**.
- Organizator: max **2** wcześniej zatwierdzone role do oznaczenia.
- Zwykły organizator: **zakaz** `@everyone` / `@here`.
- Lista dozwolonych ról pingów: konfiguracja administratora.

## 9. Powiadomienia

Kanały: DM Discord + skrzynka w panelu. Brak DM ≠ publiczne oznaczanie.
Wpis w skrzynce pozostaje.

Zawsze: zmiana terminu, anulowanie (zapisani).
Drobne zmiany: tylko gdy organizator zdecyduje.
Awans z listy rezerwowej: tak.
Usunięcie uczestnika: tak.

Organizator wybiera momenty przypomnień.
Użytkownik może wyciszyć: rodzaj aktywności i/lub konkretne wydarzenie.

## 10. Multi-Discord

- Zwykły członek: jeden dozwolony Discord.
- Administracja / uprawnieni organizatorzy: publikacja na kilku Discordach.
- Przy multi: wybór **wspólnej** listy uczestników (wspólny limit) **albo**
  **osobnych** list.
- Dane centralnie; posty Discord = projekcje.

## 11. Serie cykliczne

- Wymagają osobnego uprawnienia P3.
- Cykle: codziennie / tygodniowo / wybrane dni tygodnia.
- Max długość serii: 90 dni; można przedłużyć.
- Zapis: osobno na termin **lub** jeden na całą serię.
- Edycja: tylko ten / ten i kolejne.
- Anulowanie: jeden / ten i kolejne / cała seria.
- „Utwórz podobne” → zawsze nowe wydarzenie **jednorazowe**, nie seria.

## 12. Discord UX (funkcje)

Główny panel: Utwórz aktywność | Szukam ekipy | Moje aktywności | Powiadomienia.

- „Szukam ekipy” = uproszczona, szybka ścieżka tworzenia tej samej aktywności.
- Formularz Discord: **jeden większy prywatny formularz** (nie kreator krokowy);
  anulowanie + powrót do panelu głównego; bez zbędnego „Wstecz”.
- Niedokończony formularz → szkic **24 h**; przed publikacją → podgląd.
- Główny post wydarzenia: kompaktowy; bot aktualizuje **ten sam** post.
- Organizator wskazany; przycisk kontaktu z organizatorem; opcjonalny wątek.
- Zarządzanie: przyciski pod postem + „Moje aktywności”.
- Istniejący kanał głosowy: wskazanie dozwolone; **tymczasowe VC = odroczone**.
- Przycisk „Zgłoś”; katalog powodów + „Inny powód” (admin).

Assety wizualne = `OWNER_DECISION_REQUIRED`.

## 13. „Moje aktywności”

Pokazuje: utworzone | zapisane | zakończone | anulowane.

## 14. Pierwszy zakres WWW

- Przeglądanie aktywności; zapis / zmiana statusu; Moje aktywności;
  powiadomienia panelowe (wspólna skrzynka).
- **Tworzenie** w pierwszym etapie pozostaje na Discordzie.
- Te same dane, statusy, limity, uprawnienia, reguły co Discord.

## 15. Podstawowy Admin (P4)

Konfiguracja: rodzaje; statusy + flaga „zajmuje miejsce”; katalog pól;
kanały; pingi; limity; „Inna aktywność”; przypomnienia domyślne; czas
przechowywania posta; powody zgłoszeń.
Nie budować pełnego panelu całej platformy.

## 16. Moderacja i audyt

Moderator: edycja / anulowanie / przejęcie na swoim serwerze; każda ingerencja
z powodem + audyt. Krótki powód może być publiczny; pełne uzasadnienie w audycie.
Organizator: usunięcie uczestnika z powodem + audyt.

## 17. Odporność

- Ręcznie usunięty post bota → odtworzenie + zapis incydentu.
- Usunięty kanał → wydarzenie w backendzie; moderator wybiera nowy kanał.
- Awaria Discord/bot → nie usuwa wydarzenia; po powrocie sync projekcji.
- Opuszczenie Discorda przez użytkownika → przyszłe zapisy usuwane; historia zostaje.

## 18. Prywatność

- Publicznie: nick i klasa (gdy pole użyte).
- Odpowiedzi tekstowe uczestnika: tylko organizator i moderator.
- Wydarzenie prywatne: link i/lub wskazane role; link **nie** omija członkostwa
  ani uprawnień Discorda.

## 19. Obecność i statystyki

- Po wydarzeniu organizator oznacza obecnych/nieobecnych w ciągu **24 h**.
- System liczy; **brak automatycznych kar**.
- Użytkownik: własne statystyki; organizator: własne wydarzenie; moderator: serwer.

## 20. Formularz / szkic / limity tworzenia (podsumowanie)

| Reguła                      | Wartość        |
| --------------------------- | -------------- |
| Max aktywne własne (zwykły) | 4              |
| Cooldown czasowy            | Brak           |
| Horyzont zwykłego członka   | ≤ 14 dni       |
| Szkic formularza            | 24 h           |
| Auto-koniec bez end time    | 2 h po starcie |
| Max ping roles              | 2              |
| Max współorganizatorów      | 1              |
| Max długość serii           | 90 dni         |

## 21. Świadomie odroczone

- Tymczasowe kanały głosowe.
- Pełny panel Admin całej platformy.
- Tworzenie aktywności na WWW w pierwszym etapie WWW.
- Desktop Companion / overlay.
- Zeabur.
- Finalne assety wizualne (Issue #12).
- RabbitMQ/Outbox — decyzja techniczna otwarta (patrz PENDING).

## 22. Mapowanie starych P4-D1–P4-D8

| ID    | Nowa interpretacja                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-D1 | **OWNER_ACCEPTED (superseded options)** — pełny model produktowy + etapy P4.1–P4.6 zamiast hub-only/A/B/C                                                |
| P4-D2 | **OWNER_ACCEPTED (superseded)** — rodzaje admin-config + gry per serwer; nie jeden hardcodowany typ                                                      |
| P4-D3 | **TECHNICAL_OPEN** — roboczo `community-service`; formalna nazwa usługi nadal Proposed                                                                   |
| P4-D4 | **OWNER_ACCEPTED (superseded Discord-only)** — Discord + podstawowy Admin + pierwszy WWW (bez create na WWW w P4.4)                                      |
| P4-D5 | **TECHNICAL_OPEN** — rekomendacja sync HTTP + idempotency; nie jest decyzją właściciela                                                                  |
| P4-D6 | **OWNER_ACCEPTED (partial)** — stały panel, update in-place, jeden formularz, sekcje panelu; dokładny mechanizm publish slash vs config = TECHNICAL_OPEN |
| P4-D7 | **TECHNICAL_OPEN** — wymagane mapowanie akcji→permission; finalne ID strings = OWNER_DECISION_REQUIRED                                                   |
| P4-D8 | **OWNER_DECISION_REQUIRED** — Issue #12 (kolory, emoji, grafiki, copy poza zaakceptowanymi etykietami)                                                   |
