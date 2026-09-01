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
const channelId = process.argv[2] ?? '1534228693449179146';

const msgs = (await rest.get(Routes.channelMessages(channelId), {
  query: new URLSearchParams({ limit: '15' }),
})) as Array<Record<string, unknown>>;

const hub = msgs.find((message) => {
  const raw = JSON.stringify(message);
  return raw.includes('Centrum Aktywno') || raw.includes('DZIA');
});

if (!hub) {
  console.log(`HUB_NOT_FOUND count=${msgs.length}`);
  process.exit(1);
}

const raw = JSON.stringify(hub);
const attachments = (hub.attachments as Array<{ filename?: string }> | undefined) ?? [];
console.log(`MESSAGE_ID=${String(hub.id)}`);
console.log(`HAS_BANNER_NAME=${String(raw.includes('v2-activity-banner'))}`);
console.log(`ATTACHMENT_COUNT=${attachments.length}`);
console.log(`ATTACHMENT_NAMES=${attachments.map((row) => row.filename ?? '').join(',')}`);
console.log(`HAS_V2_CREATE=${String(raw.includes('v2_create'))}`);
console.log(`HAS_EMOJI_MARKUP=${String(raw.includes('<:v2_'))}`);
console.log(`EDITED_TS=${String(hub.edited_timestamp ?? 'null')}`);
