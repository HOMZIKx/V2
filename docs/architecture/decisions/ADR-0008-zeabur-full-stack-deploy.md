# ADR-0008: Pełne wdrożenie stosu V2 na Zeabur

- **Status:** Accepted
- **Data:** 2026-08-05
- **Decyzja właściciela:** DEC-001 wariant **B** — `APPROVED`

## Kontekst

P1 Discord Test Harness działa lokalnie / w CI bez hostingu. Właściciel zatwierdził rozszerzenie zakresu o pełne wdrożenie aktualnego stosu V2 na **osobnym** projekcie Zeabur (nie `dobry-temat`), z PostgreSQL, Redis i RabbitMQ oraz botem Discord online 24/7 na guild testowym.

## Decyzja

1. Hosting docelowy dla środowiska testowego/stage V2: **Zeabur**, osobny project od legacy.
2. Każda aplikacja/usługa ma własny serwis Zeabur budowany z `Dockerfile.<service-name>` w root repo:
   - `web`, `admin`, `api-gateway`, `discord-gateway`, `identity-service`, `authorization-service`.
3. Add-ony infrastruktury (nie dzielone ze starym projektem):
   - dwa PostgreSQL (osobne bazy/własność: identity oraz authorization) — zgodne z ADR-0004;
   - Redis;
   - RabbitMQ.
4. Sekrety wyłącznie w Variables Zeabur; brak commitów `.env` i brak sekretów w Git.
5. Procesy HTTP bindują `0.0.0.0` / `PORT` platformy (`resolveHttpListen` w `@v2/configuration`).
6. `discord-gateway` z `DISCORD_ENABLED=true` działa jako proces długotrwały (Gateway WebSocket); izolacja guild i guild-only commands pozostają jak w ADR-0007.
7. Restart policy i health checks Docker (`HEALTHCHECK`) + health endpoints aplikacji.
8. Deploy i live test na guild `1534228693017432124` są bramką przed PR do `main`.

## Konsekwencje

- Wdrożenie wymaga ręcznego utworzenia serwisów/add-onów w Zeabur UI i wklejenia listy zmiennych przez właściciela.
- To nadal nie jest produkcja biznesowa (brak OAuth, RBAC, ORM, modułów); to hostowany harness + szkielet usług.
- Koszty Zeabur i utrzymanie 24/7 bota leżą po stronie właściciela.
- Upgrade discord.js / undici nadal kontrolowany lockfilem i override’ami pnpm.

## Powiązane

- [ADR-0004](ADR-0004-local-infrastructure-db-isolation.md)
- [ADR-0007](ADR-0007-discord-test-harness.md)
- [docs/deploy/ZEABUR.md](../../deploy/ZEABUR.md)
- [docs/deploy/ZEABUR_OWNER_VARIABLES.md](../../deploy/ZEABUR_OWNER_VARIABLES.md)
