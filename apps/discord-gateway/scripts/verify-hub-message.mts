import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@v2/configuration';
import { REST, Routes } from 'discord.js';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../src/infrastructure/discord/discord-config.js';
import { loadEnvFile } from '../src/infrastructure/discord/load-env-file.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnvFile(path.join(repositoryRoot, '.env'));

const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
const channelId = process.argv[2];
const messageId = process.argv[3];
if (!channelId || !messageId) {
  throw new Error('Usage: verify-hub-message.mts <channelId> <messageId>');
}

const msg = (await rest.get(Routes.channelMessage(channelId, messageId))) as {
  id: string;
  channel_id: string;
  flags?: number;
  components?: unknown[];
};

const labels: string[] = [];
const walk = (nodes: unknown): void => {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (typeof record.label === 'string') labels.push(record.label);
      if (Array.isArray(record.components)) walk(record.components);
    }
  }
};
walk(msg.components);

console.log(
  JSON.stringify(
    {
      messageId: msg.id,
      channelId: msg.channel_id,
      flags: msg.flags ?? null,
      isComponentsV2: ((msg.flags ?? 0) & 32768) === 32768,
      buttonLabels: labels,
    },
    null,
    2,
  ),
);
