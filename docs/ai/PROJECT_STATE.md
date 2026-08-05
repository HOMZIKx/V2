# PROJECT_STATE

## Status

`READY_FOR_CURSOR`

## Active phase

P2 Identity — Better Auth proof/integration slice.

## Active task

- Task ID: `P2-IDENTITY-PROOF-001`
- Branch: `cursor/p2-identity-proof-slice`
- Base: `main` po scaleniu planu P2, commit `4230fb185044faef15d4dd59a9c3c99f6c2b5956`
- Pull Request: draft PR dla proof slice
- Instrukcja: `docs/ai/CHATGPT_TO_CURSOR.md`

## Current objective

Udowodnić na rzeczywistym kodzie, że Better Auth 1.6.25 może działać jako silnik Identity Service na Node 24, NestJS 11 i Fastify 5 z:

1. PostgreSQL dla User/Account/Verification;
2. Redis jako source of truth aktywnych sesji;
3. Discord i Google OAuth;
4. stabilnym V2 User UUID niezależnym od providera i e-maila;
5. jawnym linkowaniem bez auto-merge po e-mailu;
6. natychmiastowym revoke;
7. obsługą Discord profile `email=null`;
8. brakiem surowych provider tokenów w storage i odpowiedziach.

## In scope now

- implementacja wyłącznie w `identity-service` oraz minimalnym dev-only proof UI;
- Better Auth za portami/adapters;
- przypięte zależności i deterministyczna migracja;
- PostgreSQL + Redis integration tests;
- stabilne endpointy proof: `me`, accounts, link, unlink, logout, logout-all;
- system revoke jako port/use case bez prowizorycznego publicznego endpointu;
- automatyczne testy bez prawdziwego OAuth;
- manualny live gate Discord + Google po zielonym CI;
- aktualizacja dokumentacji i raportu.

## Out of scope now

- P3 Authorization i guild membership policy;
- produkcyjny Web/Admin login UI;
- MFA/passkey/TOTP;
- internal JWT między usługami;
- API Gateway auth middleware;
- integracja V2 User z Discord botem;
- RabbitMQ/Outbox/events;
- produkcyjny deploy i Zeabur;
- funkcje biznesowe bota.

## Decisions in force

- DEC-003 B: multi-provider V2 User UUID;
- DEC-004 A: Better Auth za portami, oficjalna integracja Fastify;
- DEC-005 A: explicit linking only;
- DEC-006 C: P2 revoke, guild policy P3;
- DEC-008 A: opaque cookie + Redis SoT;
- DEC-009 A: internal JWT później, nie w tym proof;
- ADR-0009–0012: Accepted.

## Blocker policy

Jeżeli Better Auth nie pozwala bez kruchego obejścia spełnić któregokolwiek z poniższych warunków, Cursor ustawia `BLOCKED` i ponownie otwiera DEC-004:

1. login Discord bez prawdziwego e-maila;
2. brak implicit linking;
3. natychmiastowe revoke bez cookie cache;
4. Redis session SoT bez używalnego tokenu sesji w PostgreSQL;
5. brak jawnie przechowywanych OAuth provider tokens.

## Next checkpoint

Cursor publikuje plan w draft PR, implementuje automatyczny proof i po zielonym CI ustawia `READY_FOR_LIVE_TEST`. Po manualnym OAuth gate właściciel potwierdza wynik, a ChatGPT wykonuje audyt kodu i bezpieczeństwa.

## Last updated

2026-08-05 — ChatGPT, start `P2-IDENTITY-PROOF-001`
