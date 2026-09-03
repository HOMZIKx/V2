# DESTILED — analiza jak człowiek (2026-09-03)

Źródła: oficjalna prezentacja Project Hard (EN), katalog dobry-temat,
Metin2 PL wiki (Stajenny / Medal Konny / Biolog), kontrakty D-038–D-061.

## Do czego to służy w praktyce

Gracz / zespół otwiera DESTILED żeby wiedzieć trzy rzeczy:

1. **Gdzie leży item** (ręczne potwierdzenie, nie odczyt z gry).
2. **Jaki set jest planowany** na wojnę / loch / wsparcie.
3. **Kiedy można oddać Biologa, awansować jazdę, przeczytać księgę.**

Reszta (mapy, targ, eventy) jest później i nie powinna mieszać się w te trzy.

## Flow, który działa

Discord → przestrzeń → postać → karta EQ / timery / notatki / historia.
To jest czytelne. Nawigacja nie obiecuje Map / Targu / Aktywności.

## Co bolało w copy / UX (naprawione w tej iteracji)

| Było                                           | Dlaczego źle                        | Jest                           |
| ---------------------------------------------- | ----------------------------------- | ------------------------------ |
| „Indziej” na slocie                            | niepełne PL, nie mówi o lokalizacji | „Poza postacią” / „Na postaci” |
| Eligible / Cancelled                           | angielski w PL UI                   | Dostęp OK / Anulowano…         |
| „Append-only”, „first-slice”, „udawania syncu” | żargon deweloperski                 | normalny język gracza          |
| „1 gotowych timerów”                           | zła liczba                          | odmiana                        |
| Timery sklejone w jeden blok tekstu            | ciężko czytać reguły PH             | meta w osobnych liniach        |
| Alchemia w notatce                             | PH nie ma alchemii                  | depo / Medale Konne            |

## Logika gry (tylko to, co w źródłach)

- **Biolog:** oddawanie codziennie, reset o północy; pierwsze 3 questy — cooldown tylko po udanym oddaniu. Przedmiot: m.in. Pamiątka Po Demonie (15 szt.).
- **Jazda:** na PH awans przez oddanie materiału u **Stajennego**, cooldown **23 h**, max 61. Classic point-to-point z oficjalnego Metin2 nie jest modelem PH.
- **Księgi umiejętności:** czytelne o dowolnej porze; limit dzienny resetuje się o północy (jak Biolog).
- **Brak alchemii i sashy** na PH — nie wolno ich wymyślać w UI.

## Co dalej podkręcać (bez nowych modułów)

1. Czytelność slotów na mobile (małe labelki readiness).
2. Więcej pewnych ikon broni/zbroi (bez zgadywania vnumów).
3. Kopię map PNG z lokalnego dobry-temat, gdy właściciel dorzuci assety.
4. Formularz edycji bonusów na karcie EQ (nadal ręczne, nie „AI import”).

## Czego nie robić teraz

Nie wracać Map / Targ / Aktywność do głównej nawigacji.
Nie udawać live presence ani prawdziwego OAuth.
Nie mieszać timerów postaci z respawnami metinów.
