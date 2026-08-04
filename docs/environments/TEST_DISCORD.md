# Test Discord Environment

## Dedicated test guild

- **Discord Guild ID:** `1534228693017432124`
- **Purpose:** isolated testing of the V2 Discord integration once the project reaches the stage where it can reasonably be called a bot.
- **Environment:** non-production only.

## Rules

- Do not hardcode the guild ID in business logic. Read it through validated configuration, for example `DISCORD_TEST_GUILD_ID`.
- Development and test deployments must default to this guild only until wider rollout is explicitly approved.
- Guild-scoped command registration should be used during development for fast propagation and to avoid publishing unfinished global commands.
- No production data, production secrets or real administrative permissions may be reused automatically in this guild.
- Potentially disruptive actions such as mass mentions, role removal, channel deletion or bulk moderation must remain disabled or require an explicit safe-test mode.
- The application should refuse to perform test-only operations when the connected guild does not match the configured test guild ID.
- Moving any Discord function from this guild to production requires a separate approval and rollout checklist.

## Future configuration

```text
DISCORD_TEST_GUILD_ID=1534228693017432124
```

This value is an identifier, not a secret. Discord bot tokens and OAuth secrets must never be stored in this file or committed to Git.
