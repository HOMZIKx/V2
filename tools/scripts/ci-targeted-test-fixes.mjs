import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: expected one match, found ${count}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  'apps/discord-gateway/src/infrastructure/discord/discord-js-adapter.spec.ts',
  `  it('permits Guilds-only when sync is off and Guilds+GuildMembers when sync is on', () => {
    expect(() => assertAllowedGatewayIntents([GatewayIntentBits.Guilds], false)).not.toThrow();
    expect(() => assertOnlyGuildsIntent([GatewayIntentBits.Guilds])).not.toThrow();
    expect(() =>
      assertAllowedGatewayIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], true),
    ).not.toThrow();
    expect(() =>
      assertAllowedGatewayIntents(
        [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
        false,
      ),
    ).toThrow();
    expect(() => assertAllowedGatewayIntents([GatewayIntentBits.Guilds], true)).toThrow();
    expect(() =>
      assertAllowedGatewayIntents(
        [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildPresences,
        ],
        true,
      ),
    ).toThrow();
  });`,
  `  it('permits only the activity intent set, with GuildMembers added when sync is on', () => {
    const baseIntents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
    ];
    const syncIntents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
    ];
    expect(() => assertAllowedGatewayIntents(baseIntents, false)).not.toThrow();
    expect(() => assertOnlyGuildsIntent(baseIntents)).not.toThrow();
    expect(() => assertAllowedGatewayIntents(syncIntents, true)).not.toThrow();
    expect(() =>
      assertAllowedGatewayIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], false),
    ).toThrow();
    expect(() => assertAllowedGatewayIntents([GatewayIntentBits.Guilds], true)).toThrow();
    expect(() =>
      assertAllowedGatewayIntents([...syncIntents, GatewayIntentBits.GuildPresences], true),
    ).toThrow();
  });`,
);

replaceOnce(
  'apps/discord-gateway/src/interface/discord/interaction-router.ts',
  'content: `Przypomnę ponownie za ok. ${minutes} min (szkielet przypomnienia — bez otwierania WWW).`,',
  'content: `Odłożono. Przypomnę ponownie za ok. ${minutes} min (szkielet przypomnienia — bez otwierania WWW).`,',
);

replaceOnce(
  'apps/discord-gateway/src/application/technika/capabilities.ts',
  'Nie bare allowlist. Preferuj guild-scoped + GET channels picker.',
  'To nie jest lista dozwolonych ID. Preferuj guild-scoped + GET channels picker.',
);

replaceOnce(
  'apps/web/src/timers-metin-counts.spec.ts',
  `  it('builds metin-only timer records (no bosses)', () => {
    const map =
      respawnMaps.find((entry) => entry.key === 'M2') ??
      respawnMaps.find((entry) => entry.metins.length > 0)!;
    expect(map.metins.length).toBeGreaterThan(0);
    const records = buildMapTimerRecords(map, 1);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((entry) => entry.kind === 'metin')).toBe(true);
  });`,
  `  it('builds timer records for catalog bosses and metins', () => {
    const map =
      respawnMaps.find((entry) => entry.key === 'M2') ??
      respawnMaps.find((entry) => entry.metins.length > 0)!;
    expect(map.metins.length).toBeGreaterThan(0);
    const records = buildMapTimerRecords(map, 1);
    expect(records).toHaveLength(map.bosses.length + map.metins.length);
    expect(records.filter((entry) => entry.kind === 'boss')).toHaveLength(map.bosses.length);
    expect(records.filter((entry) => entry.kind === 'metin')).toHaveLength(map.metins.length);
  });`,
);
