/**
 * Force-repaint Centrum: delete stale hub messages, post a fresh Components V2 message.
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
  tryResolveActivityHubAssetPath,
} from '../src/presentation/discord/activity-hub-assets.js';
import { renderActivityHubMessage } from '../src/presentation/discord/activity-hub-renderer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, 'apps/discord-gateway/.env'));

const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
const args = process.argv.slice(2).filter((arg) => arg.length > 0);
const recreate = args.includes('--recreate') || args.includes('--fresh');
const channelArg = args.find((arg) => !arg.startsWith('--'));
const channelId =
  channelArg?.trim() || config.DISCORD_TEST_CHANNEL_ID.trim() || '1534228693449179146';

function opaqueFromUuid(id: string): string {
  return id.replace(/-/g, '').toLowerCase().slice(0, 12);
}

const messages = (await rest.get(Routes.channelMessages(channelId), {
  query: new URLSearchParams({ limit: '40' }),
})) as Array<{
  id: string;
  author?: { id?: string };
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
  if (raw.includes('Wybierz działanie') || raw.includes('Mapa V2')) score += 20;
  if (collectCustomIdsFromComponents(message.components).length > 0) score += 10;
  if (score > 0) {
    candidates.push({ messageId: message.id, opaquePanelId: opaque, score });
  }
}
candidates.sort(
  (a, b) => b.score - a.score || (BigInt(b.messageId) > BigInt(a.messageId) ? 1 : -1),
);

const best = candidates[0];
const opaquePanelId = best?.opaquePanelId ?? opaqueFromUuid(randomUUID());
const rendered = renderActivityHubMessage({
  opaquePanelId,
  signingSecret: config.DISCORD_COMPONENT_SIGNING_SECRET,
});

const attachmentBuilders = buildActivityHubMessageAttachmentFiles();
const rawFiles = attachmentBuilders.map((file) => {
  const name = file.name ?? 'unknown.png';
  const key = name.startsWith('centrum-')
    ? 'activityHub'
    : name.startsWith('v2-activity-banner')
      ? 'activityBanner'
      : null;
  const diskPath = key !== null ? tryResolveActivityHubAssetPath(key) : null;
  if (diskPath === null) {
    throw new Error(`Missing asset file for ${name}`);
  }
  return {
    name,
    data: readFileSync(diskPath),
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

let messageId = best?.messageId ?? null;
let mode: 'updated' | 'created' | 'recreated' = 'updated';

if (recreate || messageId === null) {
  for (const candidate of candidates) {
    try {
      await rest.delete(Routes.channelMessage(channelId, candidate.messageId));
      console.log(JSON.stringify({ deleted: candidate.messageId }));
    } catch (error) {
      console.log(
        JSON.stringify({
          deleteFailed: candidate.messageId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  const created = (await rest.post(Routes.channelMessages(channelId), {
    body,
    files: rawFiles,
  })) as { id: string; attachments?: unknown[]; components?: unknown };
  messageId = created.id;
  mode = 'recreated';
} else {
  await rest.patch(Routes.channelMessage(channelId, messageId), {
    body,
    files: rawFiles,
  });
}

const verify = (await rest.get(Routes.channelMessage(channelId, messageId))) as {
  id: string;
  edited_timestamp?: string | null;
  attachments?: Array<{ filename?: string; size?: number; url?: string }>;
  components?: unknown;
};
const verifyRaw = JSON.stringify(verify);
const loadingStates = [...verifyRaw.matchAll(/"loading_state":(\d+)/g)].map((m) => Number(m[1]));
const contentTypes = [...verifyRaw.matchAll(/"content_type":"([^"]+)"/g)].map((m) => m[1]);

console.log(
  JSON.stringify(
    {
      ok: true,
      mode,
      channelId,
      messageId,
      opaquePanelId,
      jumpUrl: `https://discord.com/channels/${config.DISCORD_TEST_GUILD_ID}/${channelId}/${messageId}`,
      files: rawFiles.map((f) => ({ name: f.name, bytes: f.data.length })),
      loadingStates,
      contentTypes,
      hasMapaV2: verifyRaw.includes('Mapa V2'),
      hasWybierzDzialanie: verifyRaw.includes('Wybierz działanie'),
      hasUtworz: verifyRaw.includes('Utwórz aktywność'),
      edited: verify.edited_timestamp ?? null,
    },
    null,
    2,
  ),
);
