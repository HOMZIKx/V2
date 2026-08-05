import { writeFileSync } from 'node:fs';
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

const channelId = process.argv[2];
const messageId = process.argv[3];
if (!channelId || !messageId) {
  throw new Error('Usage: fetch-panel-message.mts <channelId> <messageId>');
}

const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
const msg = (await rest.get(Routes.channelMessage(channelId, messageId))) as {
  id: string;
  flags?: number;
  embeds?: unknown[];
  components?: unknown[];
  attachments?: Array<{ filename: string; url: string; content_type?: string }>;
};

const outDir = path.join(repositoryRoot, 'docs/ai/artifacts');
const proofPath = path.join(outDir, 'live-panel-v2-message.json');
writeFileSync(
  proofPath,
  JSON.stringify(
    {
      id: msg.id,
      flags: msg.flags ?? null,
      isComponentsV2: ((msg.flags ?? 0) & 32768) === 32768,
      embedsCount: msg.embeds?.length ?? 0,
      components: msg.components,
      attachments: (msg.attachments ?? []).map((attachment) => ({
        name: attachment.filename,
        url: attachment.url,
        contentType: attachment.content_type,
      })),
      jumpUrl: `https://discord.com/channels/${config.DISCORD_TEST_GUILD_ID}/${channelId}/${messageId}`,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ saved: proofPath, flags: msg.flags, embeds: msg.embeds?.length ?? 0 }, null, 2));

const first = msg.attachments?.[0];
if (first?.url) {
  const response = await fetch(first.url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const bannerPath = path.join(outDir, 'live-panel-v2-banner-from-discord.png');
  writeFileSync(bannerPath, buffer);
  console.log(JSON.stringify({ savedBanner: bannerPath, bytes: buffer.length }));
}
