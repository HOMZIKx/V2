# Discord test bot — local setup

This guide configures the **P1 Discord test harness** for `apps/discord-gateway`. It covers the Discord Developer Portal, local environment variables, and the `doctor` / `register` / `start` workflow.

Use it only on the approved **non-production test guild**:

```text
1534228693017432124
```

**Zanim cokolwiek o tokenie:** jeśli aplikacja Discord jeszcze nie istnieje, wykonaj najpierw pełną instrukcję:

→ **[CREATE_TEST_APPLICATION.md](./CREATE_TEST_APPLICATION.md)**

Kod P1 i CI działają bez aplikacji (`DISCORD_ENABLED=false`). Live test wymaga utworzenia aplikacji w Portalu — tego kroku nie da się zautomatyzować z repozytorium.

## Security rules

- **Never paste the bot token, signing secret, or any secret into chat, GitHub issues, PRs, screenshots, or terminal command arguments.**
- Store secrets only in a local `.env` file (or `apps/discord-gateway/.env`) that is ignored by Git.
- If a token or signing secret may have leaked, rotate it immediately in the Developer Portal and update your local `.env`.
- The bot must not use the `Administrator` permission or privileged Gateway intents as the recommended or production configuration.
- Temporary owner override (DEC-002) may use Administrator **only** on the dedicated test guild; revoke it after testing (see § Permissions).

## Permissions (minimal / recommended)

Exact minimal bot permissions required by P1 harness checks and Components V2 banner upload:

| Permission           | Why                                             |
| -------------------- | ----------------------------------------------- |
| View Channels        | See the test channel                            |
| Send Messages        | Publish `/panel-test` and ephemeral replies     |
| Embed Links          | Ephemeral `/status` embed                       |
| Attach Files         | Banner media inside Components V2 container     |
| Read Message History | Channel context for interactions / doctor hints |

OAuth2 URL Generator: scopes `bot` + `applications.commands`; mark **only** the five permissions above.

Invite bitmask (minimal, **not** Administrator):

```text
permissions=117760
```

Example invite (replace `APP_ID`):

```text
https://discord.com/api/oauth2/authorize?client_id=APP_ID&permissions=117760&scope=bot%20applications.commands
```

### Revoke Administrator after live test (DEC-002)

If the bot was installed with `permissions=8` (Administrator) on guild `1534228693017432124`:

1. Open the test guild → **Server Settings** → **Integrations** (or **Members**) → select the V2 test bot.
2. Remove **Administrator**.
3. Ensure only the five minimal permissions above remain (or re-invite with `permissions=117760`).
4. Do **not** treat Administrator as the default for any future / hosted environment.

DEC-002 remains documented as a temporary owner override; it is not the target configuration.

## 1. Discord Developer Portal

Wykonaj [CREATE_TEST_APPLICATION.md](./CREATE_TEST_APPLICATION.md) (kroki A–F). Skrót:

1. [Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **General Information** → Application ID.
3. **Bot** → Add Bot; privileged intents **OFF**; skopiuj token lokalnie.
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permissions View Channels, Send Messages, Embed Links, Attach Files, Read Message History (`permissions=117760`); bez Administrator.
5. Zainstaluj bota **tylko** na guild `1534228693017432124`.
6. Developer Mode → skopiuj własne User ID.

## 2. Local environment

From the repository root, copy the example file if you do not already have a local env file:

```text
copy .env.example .env
```

On macOS/Linux:

```text
cp .env.example .env
```

Edit `.env` (never commit this file). Set at least:

```text
DISCORD_ENABLED=true
DISCORD_APPLICATION_ID=<your application snowflake>
DISCORD_TOKEN=<your bot token — secret, local only>
DISCORD_TEST_GUILD_ID=1534228693017432124
DISCORD_TEST_OPERATOR_IDS=<your Discord user snowflake>
DISCORD_COMPONENT_SIGNING_SECRET=<generated locally, see step 3>
DISCORD_AUTO_REGISTER_GUILD_COMMANDS=false
DISCORD_STRICT_GUILD_ISOLATION=true
```

Optional:

```text
DISCORD_TEST_CHANNEL_ID=<channel snowflake for permission hints in doctor>
```

### Variable reference

| Variable                               | Required when enabled | Description                                                         |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------- |
| `DISCORD_ENABLED`                      | —                     | `false` (default) for CI and tokenless dev; `true` for live harness |
| `DISCORD_APPLICATION_ID`               | yes                   | Application snowflake from Developer Portal                         |
| `DISCORD_TOKEN`                        | yes                   | Bot token — **secret**, local only                                  |
| `DISCORD_TEST_GUILD_ID`                | yes                   | Test guild; default `1534228693017432124`                           |
| `DISCORD_TEST_OPERATOR_IDS`            | yes                   | Comma-separated operator user snowflakes                            |
| `DISCORD_COMPONENT_SIGNING_SECRET`     | yes                   | ≥ 32 bytes entropy for HMAC custom IDs                              |
| `DISCORD_AUTO_REGISTER_GUILD_COMMANDS` | —                     | `false` by default; register via CLI                                |
| `DISCORD_STRICT_GUILD_ISOLATION`       | —                     | `true` by default; fail if bot joins other guilds                   |

With `DISCORD_ENABLED=false`, `pnpm dev` and CI run without a Discord token.

## 3. Generate signing secret

From the repository root:

```text
pnpm discord:test:generate-secret
```

Copy the printed value into `DISCORD_COMPONENT_SIGNING_SECRET` in your local `.env`. Do not commit it.

## 4. Validate configuration (`doctor`)

```text
pnpm discord:test:doctor
```

`doctor`:

- Validates configuration without printing secrets (values are redacted).
- Checks application identity and test guild membership via REST.
- Lists guild-scoped commands on the test guild.
- Warns if global commands exist (they are **not** removed automatically).
- Exits with a non-zero code on failure.

Fix any reported issues before continuing.

## 5. Register guild commands (`register`)

```text
pnpm discord:test:register
```

This registers **guild-scoped commands only** on `DISCORD_TEST_GUILD_ID` (currently `/status` and `/panel-test`). It is idempotent and does not register global commands.

Command propagation on a test guild is usually immediate; if a slash command is missing, wait a few seconds and retry.

## 6. Start the gateway (`start`)

```text
pnpm discord:test:start
```

This starts `discord-gateway` with `DISCORD_ENABLED=true` using your local `.env`. The process connects via **Discord Gateway (WebSocket)** using **discord.js 14.25.1**.

Health endpoints (HTTP):

- `GET http://127.0.0.1:4100/health/live` — process alive
- `GET http://127.0.0.1:4100/health/ready` — ready when Discord is disabled or client is connected and guild isolation is OK

## 7. Manual live test checklist

After the bot is online on guild `1534228693017432124`:

1. Run `/status` — response must be **ephemeral** with safe diagnostics only.
2. Run `/panel-test` (as an operator or user with **Manage Server**) — one public panel with select menu and buttons.
3. Exercise select options, **Odśwież**, modal submit, and **Usuń panel** (with confirmation).
4. Restart the gateway process and confirm the **same panel** still responds (stateless signed custom IDs).
5. Confirm no emoji reactions are used for navigation and no extra public spam messages appear.

Record Application ID, Bot User ID, and Guild ID in the audit report if needed — they are not secrets. **Do not record the token or signing secret.**

## 8. Teardown and rotation

- Remove the bot from the test guild via Server Settings → Integrations if you no longer need it.
- Reset the bot token in the Developer Portal if it was exposed.
- Generate a new `DISCORD_COMPONENT_SIGNING_SECRET` if the old one was exposed (existing panel custom IDs will become invalid).

## Troubleshooting

| Symptom                           | Likely cause                                                    |
| --------------------------------- | --------------------------------------------------------------- |
| Config validation fails on start  | Missing or invalid env vars when `DISCORD_ENABLED=true`         |
| `doctor` reports bot not a member | Re-run OAuth install URL on the test guild only                 |
| Strict isolation shutdown         | Bot was invited to another guild; remove it and restart         |
| `/panel-test` denied              | User not in `DISCORD_TEST_OPERATOR_IDS` and lacks Manage Server |
| Panel buttons dead after restart  | Wrong or missing `DISCORD_COMPONENT_SIGNING_SECRET`             |
| Commands missing                  | Run `pnpm discord:test:register` again                          |

## Related docs

- [TEST_DISCORD.md](../environments/TEST_DISCORD.md) — test guild policy
- [DISCORD_POST_INTERACTION_STANDARD.md](../ux/DISCORD_POST_INTERACTION_STANDARD.md) — UX rules for panels
- [ADR-0007](../architecture/decisions/ADR-0007-discord-test-harness.md) — architecture decision
