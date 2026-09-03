# DESTILED — analiza UX i logiki gry (2026-09-03)

Źródła (bez zgadywania):

- oficjalna prezentacja Project Hard EN: `https://projekt-hard.eu/presentation?lang=en`
- katalog przedmiotów z `dobry-temat` (`dobry-temat-item-catalog.json`)
- Metin2 PL wiki (nazwy przedmiotów)
- kontrakty D-038–D-061 / first-slice

PL prezentacja wymaga logowania — nazwy PL dla Biologa/EQ bierzemy z katalogu wiki + tabeli EN.

## Co człowiek robi w first-slice

1. Wejście Discord → przestrzeń → postać → karta EQ / timery / notatki / historia.
2. Cel: wiedzieć **gdzie leży item**, **jaki set jest planowany**, **kiedy Biolog / jazda / księga**.
3. To nie jest klient gry. Nie odczytujemy stanu z Project Hard.

## Błędy logiczne usunięte w tej iteracji

| Problem | Skąd wiemy | Korekta |
| --- | --- | --- |
| Notatka o „alchemii” | PH: alchemy = never | Notatka o Medalach Konnych / Zwojach w depo |
| „Tarcza Bojowa” | katalog: **Bojowa Tarcza** | Nazwa poprawiona |
| „Pamiątki po demonie · 6/10” | PH: Demon Keepsake, 15 szt., nazwa **Pamiątka Po Demonie** | `6/15` + poprawna nazwa |
| Timer „Medal konny” | PH: awans **jazdy** u Stajennego, materiał Medal Konny, cooldown **23 h** | Label **Jazda konna** + detail z materiałem |
| Bonusy biżuterii/butów | PH presentation (Ebony / Jade / Wooden / Leather) | Dopasowane do tabeli PH |
| Placeholder SVG zamiast ikon | katalog + lokalne wiki PNG/JPG | Demo EQ bierze `sourceImageUrl` |

## Zasady Project Hard używane w timerach

- **Biolog:** oddawanie codziennie; reset o północy; pierwsze 3 questy — cooldown tylko po udanym oddaniu.
- **Jazda:** max 61; cooldown awansu 23 h; Medale z Lochów Małp / wyprawy 30 lvl (niska szansa).
- **Księgi umiejętności:** czytelne o dowolnej porze; limit dzienny resetuje się o północy (jak Biolog).
- **Brak alchemii i sashy** — nie wolno ich wymyślać w copy.

## UX (jak człowiek)

- Pulpit / przestrzenie / postacie: OK jako szkielet codziennego użycia.
- EQ: plan setu ≠ lokalizacja fizyczna — zostaje; trzeba widzieć prawdziwe ikony (zrobione dla demo + dopasowanie nazwy przy dodawaniu).
- Mapy: katalog respawnów jest; **brak PNG map** — trzeba skopiować z lokalnego `dobry-temat/frontend/public` (README w `public/game/maps`).
- Targ: celowo później; katalog ikon żyje przy EQ, nie jako fałszywy marketplace.
- Klasy: tylko 3 zatwierdzone rendery (`sura-male`, `ninja-female`, `shaman-male`) — reszta musi zostać „brak renderu”, bez AI-generowanych postaci.

## Nadal brakuje (właściciel / lokalne assety)

1. Pełny dump grafik map i brakujących class renderów ze starego frontu.
2. Większy lokalny zestaw wiki PNG (dziś ~90 zmapowanych ikon na 678 pozycji katalogu).
3. Prawdziwy Discord OAuth / API / bot — poza first-slice mock store.
