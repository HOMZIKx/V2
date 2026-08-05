import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@v2/configuration';
import { REST, Routes } from 'discord.js';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../src/infrastructure/discord/discord-config.js';
import { loadEnvFile } from '../src/infrastructure/discord/load-env-file.js';
import { renderPanelMessage } from '../src/presentation/discord/panel-renderer.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnvFile(path.join(repositoryRoot, '.env'));
loadEnvFile(path.join(repositoryRoot, 'apps/discord-gateway/.env'));

if (process.env.DISCORD_ENABLED !== 'true') {
  throw new Error('Set DISCORD_ENABLED=true before publishing panel.');
}

const keep = process.argv.includes('--keep');
const channelArg = process.argv.find((arg) => arg.startsWith('--channel='));
const channelOverride = channelArg?.slice('--channel='.length);

const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

const guildChannels = (await rest.get(
  Routes.guildChannels(config.DISCORD_TEST_GUILD_ID),
)) as Array<{ id: string; type: number; name?: string }>;

const textChannels = guildChannels.filter((channel) => channel.type === 0);
const channelId = channelOverride ?? process.env.DISCORD_TEST_CHANNEL_ID ?? textChannels[0]?.id;

if (!channelId) {
  throw new Error('No text channel available to publish panel.');
}

// Delete recent legacy embed panels from this bot in channel
const me = (await rest.get(Routes.user('@me'))) as { id: string };
const recent = (await rest.get(Routes.channelMessages(channelId), {
  query: new URLSearchParams({ limit: '30' }),
})) as Array<{
  id: string;
  author: { id: string };
  embeds?: unknown[];
  flags?: number;
  content?: string;
}>;

for (const message of recent) {
  if (message.author.id !== me.id) continue;
  const flags = message.flags ?? 0;
  const isV2 = (flags & 32768) === 32768;
  const hasEmbeds = (message.embeds?.length ?? 0) > 0;
  if (hasEmbeds && !isV2) {
    await rest.delete(Routes.channelMessage(channelId, message.id)).catch(() => undefined);
    console.log(JSON.stringify({ deletedLegacyPanel: message.id }));
  }
}

const panel = renderPanelMessage({
  signingSecret: config.DISCORD_COMPONENT_SIGNING_SECRET,
});

// discord.js REST expects body + files for multipart
const body = {
  components: panel.components?.map((component) =>
    typeof (component as { toJSON?: () => unknown }).toJSON === 'function'
      ? (component as { toJSON: () => unknown }).toJSON()
      : component,
  ),
  flags: panel.flags,
};

const files = (panel.files ?? []).map((file, index) => {
  const attachment = file as {
    attachment?: Buffer;
    name?: string;
    data?: Buffer;
  };
  const data = attachment.attachment ?? attachment.data;
  if (!data) {
    throw new Error(`Missing attachment buffer at index ${index}`);
  }
  return {
    data: Buffer.isBuffer(data) ? data : Buffer.from(data),
    name: attachment.name ?? `file-${index}.png`,
  };
});

const created = (await rest.post(Routes.channelMessages(channelId), {
  body,
  files,
})) as {
  id: string;
  channel_id: string;
  flags?: number;
  embeds?: unknown[];
  components?: Array<{ type: number }>;
};

const summary = {
  published: 'ok',
  keep,
  channelId: created.channel_id,
  messageId: created.id,
  jumpUrl: `https://discord.com/channels/${config.DISCORD_TEST_GUILD_ID}/${created.channel_id}/${created.id}`,
  flags: created.flags ?? null,
  isComponentsV2: ((created.flags ?? 0) & 32768) === 32768,
  hasEmbeds: (created.embeds?.length ?? 0) > 0,
  topComponentTypes: created.components?.map((component) => component.type) ?? [],
};

console.log(JSON.stringify(summary, null, 2));

if (!keep) {
  await rest.delete(Routes.channelMessage(channelId, created.id)).catch(() => undefined);
}
