#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@v2/configuration';
import { createLogger } from '@v2/observability';

import { guildCommandDefinitions } from '../src/application/commands/command-definitions.js';
import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../src/infrastructure/discord/discord-config.js';
import { DiscordJsGatewayAdapter } from '../src/infrastructure/discord/discord-js-adapter.js';
import { loadEnvFile } from '../src/infrastructure/discord/load-env-file.js';
import { redactSecrets } from '../src/infrastructure/security/secret-redaction.js';
import { generateSigningSecret } from '../src/infrastructure/security/signed-custom-id.js';

const command = process.argv[2];
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

loadEnvFile(path.join(repositoryRoot, '.env'));
loadEnvFile(path.join(repositoryRoot, 'apps/discord-gateway/.env'));

function loadEnabledConfig() {
  if (process.env.DISCORD_ENABLED !== 'true') {
    throw new Error(
      'Set DISCORD_ENABLED=true in a local ignored .env before running this command.',
    );
  }
  const parsed = createConfig(DiscordGatewayConfigSchema);
  return normalizeDiscordConfig(parsed);
}

function printRedactedSummary(config) {
  const secrets = [config.DISCORD_TOKEN, config.DISCORD_COMPONENT_SIGNING_SECRET];
  console.log(
    JSON.stringify(
      {
        applicationId: config.DISCORD_APPLICATION_ID,
        testGuildId: config.DISCORD_TEST_GUILD_ID,
        operatorCount: config.operatorIds.length,
        autoRegister: config.DISCORD_AUTO_REGISTER_GUILD_COMMANDS,
        strictIsolation: config.DISCORD_STRICT_GUILD_ISOLATION,
        token: redactSecrets(config.DISCORD_TOKEN, secrets),
        signingSecret: redactSecrets(config.DISCORD_COMPONENT_SIGNING_SECRET, secrets),
      },
      null,
      2,
    ),
  );
}

async function runDoctor() {
  const config = loadEnabledConfig();
  printRedactedSummary(config);

  const logger = createLogger('discord-doctor');
  const adapter = new DiscordJsGatewayAdapter({
    config,
    logger,
    onInteraction: async () => undefined,
  });

  const application = await adapter.fetchApplication();
  if (application.id !== config.DISCORD_APPLICATION_ID) {
    throw new Error(
      `Application ID mismatch: config=${config.DISCORD_APPLICATION_ID} remote=${application.id}`,
    );
  }

  const guild = await adapter.fetchGuild(config.DISCORD_TEST_GUILD_ID);
  const globalCommands = await adapter.listGlobalCommands();
  const guildCommands = await adapter.listGuildCommands(config.DISCORD_TEST_GUILD_ID);

  console.log('Discord doctor probe:');
  console.log(`applicationId=${application.id}`);
  console.log(`botUserId=${application.botUserId}`);
  console.log(`guildId=${guild.id}`);
  console.log(`guildName=${guild.name}`);
  console.log(`botIsMember=${String(guild.botIsMember)}`);
  console.log(`guildCommands=${guildCommands.map((item) => item.name).join(',') || '(none)'}`);
  if (globalCommands.length > 0) {
    console.log(
      `WARNING: global commands present (${globalCommands.map((item) => item.name).join(', ')}). They are not removed automatically.`,
    );
  }

  if (!guild.botIsMember) {
    throw new Error('Bot is not a member of the configured test guild.');
  }

  if (config.DISCORD_TEST_CHANNEL_ID) {
    await adapter.start();
    try {
      const permissions = await adapter.checkChannelPermissions(
        config.DISCORD_TEST_GUILD_ID,
        config.DISCORD_TEST_CHANNEL_ID,
      );
      console.log(
        `channelId=${config.DISCORD_TEST_CHANNEL_ID} ok=${String(permissions.ok)} missing=${permissions.missing.join(',') || '(none)'}`,
      );
      if (!permissions.ok) {
        throw new Error(`Bot missing channel permissions: ${permissions.missing.join(', ')}`);
      }
    } finally {
      await adapter.stop();
    }
  }

  console.log('Discord doctor OK');
}

async function runRegister() {
  const config = loadEnabledConfig();
  const logger = createLogger('discord-register');
  const adapter = new DiscordJsGatewayAdapter({
    config,
    logger,
    onInteraction: async () => undefined,
  });

  const registered = await adapter.putGuildCommands(
    config.DISCORD_TEST_GUILD_ID,
    guildCommandDefinitions,
  );
  console.log('Registered guild commands:');
  for (const item of registered) {
    const definition = guildCommandDefinitions.find((entry) => entry.name === item.name);
    console.log(`- ${item.name} @ ${definition?.version ?? 'unknown'} (${item.id})`);
  }
}

function runGenerateSecret() {
  const secret = generateSigningSecret(32);
  console.log('Generated DISCORD_COMPONENT_SIGNING_SECRET (store only in local ignored .env):');
  console.log(secret);
}

async function runStart() {
  process.env.DISCORD_ENABLED = 'true';
  const { spawn } = await import('node:child_process');
  const child = spawn(
    process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
    ['pnpm', '--dir', 'apps/discord-gateway', 'dev'],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

async function main() {
  try {
    switch (command) {
      case 'doctor':
        await runDoctor();
        break;
      case 'register':
        await runRegister();
        break;
      case 'generate-secret':
        runGenerateSecret();
        break;
      case 'start':
        await runStart();
        break;
      default:
        throw new Error('Usage: pnpm discord:test:<doctor|register|generate-secret|start>');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(redactSecrets(message));
    process.exitCode = 1;
  }
}

void main();
