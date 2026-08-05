# ADR-0012: Better Auth as Identity engine (behind ports)

- **Status:** Accepted
- **Data:** 2026-08-05
- **Task:** `P2-IDENTITY-FOUNDATION-001` (planning)
- **Owner decision:** DEC-004 **A**
- **Related:** D-019, ADR-0009, ADR-0010, ADR-0011

## Kontekst

D-019 wskazywało Better Auth jako silnik Identity. Przed implementacją właściciel
potwierdził wybór z wymogiem izolacji architektonicznej (DEC-004 A, 2026-08-05).

## Decyzja

1. **Better Auth** jest wybranym silnikiem auth dla P2.
2. Integracja bazowa korzysta z **oficjalnego handlera Fastify** w Identity Service.
   Fundament **nie** zależy od community Nest adaptera.
3. Better Auth jest zamknięty **za portami / adapters** Identity:
   - Domain i Application nie importują Better Auth;
   - inne usługi **nie** importują Better Auth i **nie** czytają jego tabel bezpośrednio;
   - mapowanie tabel BA ↔ encje domenowe (User / Account / Session / Verification) tylko
     w Infrastructure Identity.
4. Konfiguracja zgodna z ADR-0010 / ADR-0011:
   - `disableImplicitLinking: true`;
   - wyłączony cookie cache / stateless mode na start;
   - Redis jako session SoT (adapter — proof musi potwierdzić);
   - provider tokens: brak domyślnego trwałego zapisu surowych tokenów bez jawnej decyzji.
5. **Pin dokładnej wersji** Better Auth w przyszłym PR implementacyjnym (nie w tym PR
   planistycznym).
6. **Pierwszy element implementacji:** mały proof / integration slice potwierdzający:
   Node 24, Nest 11 + Fastify, PostgreSQL, Redis, Discord, Google, jawne linking, revoke,
   testowalność. Jeśli proof ujawni krytyczny problem — **zatrzymać** i ponownie otworzyć
   DEC-004 zamiast budować obejścia w ciemno.
7. Ten ADR **nie** instaluje zależności — PR #10 pozostaje docs-only.

## Konsekwencje

- D-019 potwierdzone z doprecyzowaniem izolacji Fastify + ports.
- Ryzyko: rozbieżność domyślnego storage sesji BA vs Redis SoT — musi być rozwiązana w
  proof slice, nie „na słowo”.
- Community Nest adapter poza zakresem fundamentu.

## Poza decyzją

- Pin wersji (impl PR).
- Wybór ORM / migracji konkretnych (impl, pod kontrolą Identity ownership).
