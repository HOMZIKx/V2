/**
 * One-shot: edit existing Centrum hub message in place with proper multipart attachments.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@v2/configuration';
import { REST, Routes } from 'discord.js';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../src/infrastructure/discord/discord-config.js';
import { loadEnvFile } from '../src/infrastructure/discord/load-env-file.js';
import {
  collectCustomIdsFromComponents,
  extractHubPanelOpaqueIdFromComponents,
} from '../src/infrastructure/discord/panel-message-scan.js';
import {
  buildActivityHubMessageAttachmentFiles,
  resolveActivityHubAssetPath,
  tryResolveActivityHubAssetPath,
} from '../src/presentation/discord/activity-hub-assets.js';
import { renderActivityHubMessage } from '../src/presentation/discord/activity-hub-renderer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, 'apps/discord-gateway/.env'));

const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
const channelId =
  process.argv[2]?.trim() ||
  config.DISCORD_TEST_CHANNEL_ID.trim() ||
  '1534228693449179146';

function opaqueFromUuid(id: string): string {
  return id.replace(/-/g, '').toLowerCase().slice(0, 12);
}

const messages = (await rest.get(Routes.channelMessages(channelId), {
  query: new URLSearchParams({ limit: '30' }),
})) as Array<{
  id: string;
  author?: { id?: string; bot?: boolean };
  components?: unknown;
}>;

const me = (await rest.get(Routes.user('@me'))) as { id: string };
const botId = me.id;

type Candidate = {
  messageId: string;
  opaquePanelId: string | null;
  score: number;
};

const candidates: Candidate[] = [];
for (const message of messages) {
  if (message.author?.id !== botId) continue;
  const raw = JSON.stringify(message);
  const opaque = extractHubPanelOpaqueIdFromComponents(
    message.components,
    config.DISCORD_COMPONENT_SIGNING_SECRET,
  );
  let score = 0;
  if (opaque) score += 100;
  if (raw.includes('V2 Centrum') || raw.includes('Centrum')) score += 50;
  if (raw.includes('Mapa V2') || raw.includes('Wybierz działanie')) score += 20;
  if (collectCustomIdsFromComponents(message.components).length > 0) score += 10;
  if (score > 0) {
    candidates.push({ messageId: message.id, opaquePanelId: opaque, score });
  }
}

candidates.sort((a, b) => b.score - a.score || (BigInt(b.messageId) > BigInt(a.messageId) ? 1 : -1));
const target = candidates[0];
if (!target) {
  console.error(JSON.stringify({ ok: false, error: 'HUB_NOT_FOUND', channelId, botId }));
  process.exit(1);
}

const opaquePanelId = target.opaquePanelId ?? opaqueFromUuid(randomUUID());
const rendered = renderActivityHubMessage({
  opaquePanelId,
  signingSecret: config.DISCORD_COMPONENT_SIGNING_SECRET,
});

const attachmentBuilders = buildActivityHubMessageAttachmentFiles();
const rawFiles = attachmentBuilders.map((file) => {
  const name = file.name ?? 'unknown.webp';
  // Prefer fresh buffer from disk — AttachmentBuilder may not serialize cleanly over REST.
  const key =
    name === 'centrum-aktywnosci-icon.webp'
      ? 'activityHub'
      : name === 'v2-activity-banner.webp'
        ? 'activityBanner'
        : null;
  const diskPath =
    key !== null
      ? (tryResolveActivityHubAssetPath(key) ?? resolveActivityHubAssetPath(key as 'activityHub'))
      : null;
  const data = diskPath !== null ? readFileSync(diskPath) : Buffer.alloc(0);
  return {
    name,
    data,
    contentType: name.endsWith('.png') ? ('image/png' as const) : ('image/webp' as const),
  };
});

const body = {
  components: rendered.components?.map((component) =>
    typeof (component as { toJSON?: () => unknown }).toJSON === 'function'
      ? (component as { toJSON: () => unknown }).toJSON()
      : component,
  ),
  flags: rendered.flags,
  attachments: rawFiles.map((file, index) => ({
    id: index,
    filename: file.name,
  })),
};

console.log(
  JSON.stringify({
    painting: true,
    messageId: target.messageId,
    files: rawFiles.map((f) => ({ name: f.name, bytes: f.data.length })),
  }),
);

await rest.patch(Routes.channelMessage(channelId, target.messageId), {
  body,
  files: rawFiles,
});

const verify = (await rest.get(Routes.channelMessage(channelId, target.messageId))) as {
  id: string;
  edited_timestamp?: string | null;
  attachments?: Array<{ filename?: string; size?: number; url?: string }>;
  components?: unknown;
};
const verifyRaw = JSON.stringify(verify);
const attachmentNames = (verify.attachments ?? []).map((a) => a.filename ?? '');

console.log(
  JSON.stringify(
    {
      ok: true,
      channelId,
      messageId: target.messageId,
      opaquePanelId,
      jumpUrl: `https://discord.com/channels/${config.DISCORD_TEST_GUILD_ID}/${channelId}/${target.messageId}`,
      attachmentNames,
      attachmentCount: attachmentNames.length,
      hasMapaV2: verifyRaw.includes('Mapa V2'),
      hasWybierzDzialanie: verifyRaw.includes('Wybierz działanie'),
      hasAttachmentUrl: verifyRaw.includes('attachment://centrum-aktywnosci-icon.webp'),
      edited: verify.edited_timestamp ?? null,
    },
    null,
    2,
  ),
);
