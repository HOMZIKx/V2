import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readSrc(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

describe('static discord security guards', () => {
  it('does not register global application commands for writes', () => {
    const adapter = readSrc('src/infrastructure/discord/discord-js-adapter.ts');
    expect(adapter).toContain('applicationGuildCommands');
    expect(adapter).toMatch(/putGuildCommands[\s\S]*applicationGuildCommands/);
    expect(adapter).not.toMatch(/rest\.put\(\s*Routes\.applicationCommands/);
  });

  it('gates GuildMembers behind authorization sync and forbids MessageContent/Presence', () => {
    const adapter = readSrc('src/infrastructure/discord/discord-js-adapter.ts');
    expect(adapter).toContain('GatewayIntentBits.Guilds');
    expect(adapter).toContain('GatewayIntentBits.GuildMembers');
    expect(adapter).toContain('BASE_INTENTS');
    expect(adapter).toContain('SYNC_INTENTS');
    expect(adapter).toContain('DISCORD_AUTHORIZATION_SYNC_ENABLED');
    expect(adapter).not.toContain('GatewayIntentBits.MessageContent');
    expect(adapter).not.toContain('GatewayIntentBits.GuildPresences');
  });

  it('cli register path uses guild command put helper', () => {
    const cli = readFileSync(path.join(root, 'scripts/discord-cli.mjs'), 'utf8');
    expect(cli).toContain('putGuildCommands');
    expect(cli).not.toContain('Routes.applicationCommands(');
  });
});
