import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@v2/configuration';
import { REST, Routes } from 'discord.js';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../src/infrastructure/discord/discord-config.js';
import { loadEnvFile } from '../src/infrastructure/discord/load-env-file.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnvFile(path.join(root, '.env'));

const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
const channelId = '1534228693449179146';
const messageId = '1539060848352436286';

const msg = (await rest.get(Routes.channelMessage(channelId, messageId))) as Record<
  string,
  unknown
>;
const raw = JSON.stringify(msg);
const urls = [
  ...raw.matchAll(/attachment:\/\/[^"\\s]+|https:\/\/cdn\.discordapp\.com\/[^"\\s]+/g),
].map((m) => m[0]);

console.log(
  JSON.stringify(
    {
      flags: msg.flags,
      attachmentCount: Array.isArray(msg.attachments) ? msg.attachments.length : 0,
      attachments: msg.attachments,
      mediaRefs: urls.slice(0, 30),
      hasAttachmentScheme: raw.includes('attachment://'),
      componentTypes: JSON.stringify(msg.components)?.slice(0, 1500),
    },
    null,
    2,
  ),
);
