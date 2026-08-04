# Project Charter — V2

## Wizja

V2 jest budowaną od zera platformą społecznościowo-gamingową. Discord i WWW są równorzędnymi interfejsami korzystającymi z jednego backendu, jednych danych i jednych reguł biznesowych.

## Cel

Zbudować wyjątkowo solidny fundament, na którym można bez przebudowy rdzenia rozwijać moderację, administrację, automatyzacje, wydarzenia, LFG, role, onboarding, tickety, analitykę, bezpieczeństwo, integracje z grami i kolejne moduły.

## Zakres organizacyjny

System służy jednej organizacji, która może posiadać wiele powiązanych serwerów Discord. Nie jest obecnie publicznym SaaS-em dla obcych klientów.

## Zasady produktu

- Funkcje mogą działać na Discordzie, WWW albo w obu interfejsach.
- Każdy moduł i widok musi dać się ograniczyć według serwera, roli, użytkownika, uprawnienia, warunku, czasu i kanału dostępu.
- Discord i WWW nie mogą posiadać rozbieżnej logiki biznesowej.
- Użytkownik ma wspólny profil organizacyjny oraz osobne członkostwo i dane lokalne dla każdego serwera.
- System ma ułatwiać korzystanie ze społeczności, a nie generować spam, tarcie lub zbędne komendy.

## Priorytety

1. Jakość i bezpieczeństwo.
2. Utrzymywalność i czytelne granice odpowiedzialności.
3. Możliwość rozwoju bez przepisywania fundamentu.
4. Dobra diagnostyka, testowalność i obserwowalność.
5. Spójne doświadczenie użytkownika i administracji.
6. Szybkość dostarczania funkcji dopiero po spełnieniu powyższych punktów.

## Czego nie budujemy

- Kopii starego bota ani starej architektury.
- Jednego przeładowanego bota z przypadkowymi modułami.
- Ukrytego monolitu rozłożonego na procesy.
- Systemu, którego działanie zależy od pamięci rozmowy z AI.
- Drugiego Discorda bez uzasadnienia produktowego.

## Referencja starego projektu

Stary projekt może być czytany jako biblioteka wzorów, copy, assetów i wybranych rozwiązań. Każdy wykorzystany fragment musi zostać świadomie oceniony i dostosowany do nowej architektury. Nie wolno przenosić całego starego monorepo ani automatycznie powielać wcześniejszych decyzji.
