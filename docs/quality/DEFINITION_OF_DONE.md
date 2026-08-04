# Definition of Done

Zmiana jest gotowa do przeglądu, gdy:

- [ ] zakres zgadza się z zaakceptowanym zadaniem i konstytucją;
- [ ] decyzje dotyczące architektury, bezpieczeństwa, danych, UX lub zakresu
      mają wymagany ADR albo wpis w `PENDING_DECISIONS.md`;
- [ ] nie dodano `any`, pominięć TypeScript, sekretów, cross-readów baz ani
      importów logiki między usługami;
- [ ] wejścia zewnętrzne są walidowane w runtime, gdy zmiana je wprowadza;
- [ ] dodano lub zaktualizowano adekwatne testy: Vitest, health/config,
      architektury lub smoke E2E;
- [ ] przechodzą odpowiednie format, lint, typecheck, testy, kontrola
      architektury i build; dla pełnego fundamentu także `pnpm validate`;
- [ ] lokalna infrastruktura i zmienione endpointy są udokumentowane oraz
      zweryfikowane w proporcji do ryzyka;
- [ ] dokumentacja, ADR-y, `DECISION_LOG.md`, `PROJECT_STATE.md` i raport
      `CURSOR_TO_CHATGPT.md` odzwierciedlają rzeczywisty stan;
- [ ] praca znajduje się na gałęzi zadania i jest gotowa do PR bez merge do
      `main`;
- [ ] raport zawiera faktyczne komendy, wyniki, ograniczenia, dług techniczny,
      commit SHA i link do PR po ich utworzeniu.

Dla Promptu 0 oznacza to dodatkowo uruchamialne szkielety aplikacji i usług,
izolację lokalnych baz identity/authorization, Compose z health checks,
kontrole CI oraz brak implementacji funkcji wyraźnie poza zakresem.
