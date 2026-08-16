/**
 * One-shot live operator helper for P4.2 hub publish (local test guild only).
 * Uses existing Discord REST + activity-service HTTP contracts — not a product feature.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@v2/configuration';
import { REST, Routes } from 'discord.js';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../src/infrastructure/discord/discord-config.js';
import { loadEnvFile } from '../src/infrastructure/discord/load-env-file.js';
import { renderActivityHubMessage } from '../src/presentation/discord/activity-hub-renderer.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnvFile(path.join(repositoryRoot, '.env'));
loadEnvFile(path.join(repositoryRoot, 'apps/discord-gateway/.env'));

const command = process.argv[2] ?? 'help';
const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
const activityBase = (process.env.ACTIVITY_SERVICE_BASE_URL ?? 'http://127.0.0.1:4400').replace(
  /\/$/,
  '',
);
const orgId = process.env.ACTIVITY_ORGANIZATION_ID ?? 'org-test';
const operatorId = config.operatorIds[0];

function opaqueFromUuid(id: string): string {
  return id.replace(/-/g, '').slice(0, 12);
}

async function listTextChannels() {
  const channels = (await rest.get(Routes.guildChannels(config.DISCORD_TEST_GUILD_ID))) as Array<{
    id: string;
    type: number;
    name?: string;
  }>;
  return channels.filter((c) => c.type === 0).map((c) => ({ id: c.id, name: c.name ?? '' }));
}

async function activityRequest(
  method: string,
  pathname: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${activityBase}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-actor-discord-user-id': operatorId ?? '',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${pathname} -> ${response.status} ${text.slice(0, 400)}`);
  }
  return text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function resolveChannelId(): Promise<string> {
  const fromEnv = process.env.DISCORD_TEST_CHANNEL_ID?.trim();
  if (fromEnv) return fromEnv;
  const text = await listTextChannels();
  if (text.length === 0) {
    throw new Error('NEED_TEST_CHANNEL_ID');
  }
  return text[0]!.id;
}

async function cmdChannels() {
  const text = await listTextChannels();
  console.log(
    JSON.stringify({ guildId: config.DISCORD_TEST_GUILD_ID, textChannels: text }, null, 2),
  );
}

async function cmdSeed(channelId: string) {
  await activityRequest(
    'POST',
    `/activity/v1/guilds/${config.DISCORD_TEST_GUILD_ID}/ensure-defaults`,
    {
      orgId,
    },
  );
  await activityRequest('POST', '/activity/v1/test/seed-guild', {
    guildId: config.DISCORD_TEST_GUILD_ID,
    orgId,
    channelId,
  });
  console.log(JSON.stringify({ seeded: true, guildId: config.DISCORD_TEST_GUILD_ID, channelId }));
}

async function cmdPublish(channelId: string) {
  if (!operatorId) {
    throw new Error('DISCORD_TEST_OPERATOR_IDS is empty');
  }
  const operationId = randomUUID();
  const nonce = operationId.replace(/-/g, '').slice(0, 25);

  const panel = await activityRequest(
    'POST',
    '/activity/v1/panels',
    {
      organizationId: orgId,
      discordGuildId: config.DISCORD_TEST_GUILD_ID,
      channelId,
      panelType: 'hub',
      status: 'publishing',
      operationId,
      nonce,
      correlationId: operationId,
    },
    { 'Idempotency-Key': `live-hub-upsert:${config.DISCORD_TEST_GUILD_ID}:${channelId}` },
  );

  const panelId = String(panel.id);
  const opaquePanelId =
    typeof panel.opaqueId === 'string' && /^[a-f0-9]{12}$/.test(panel.opaqueId)
      ? panel.opaqueId
      : opaqueFromUuid(panelId);

  const rendered = renderActivityHubMessage({
    opaquePanelId,
    signingSecret: config.DISCORD_COMPONENT_SIGNING_SECRET,
  });

  const body = {
    components: rendered.components?.map((component) =>
      typeof (component as { toJSON?: () => unknown }).toJSON === 'function'
        ? (component as { toJSON: () => unknown }).toJSON()
        : component,
    ),
    flags: rendered.flags,
  };

  let messageId = typeof panel.messageId === 'string' ? panel.messageId : null;
  if (messageId) {
    try {
      await rest.patch(Routes.channelMessage(channelId, messageId), { body });
    } catch {
      messageId = null;
    }
  }
  if (!messageId) {
    const created = (await rest.post(Routes.channelMessages(channelId), { body })) as {
      id: string;
    };
    messageId = created.id;
  }

  const published = await activityRequest(
    'POST',
    '/activity/v1/panels',
    {
      organizationId: orgId,
      discordGuildId: config.DISCORD_TEST_GUILD_ID,
      channelId,
      panelType: 'hub',
      status: 'active',
      messageId,
      operationId,
      nonce,
      correlationId: operationId,
    },
    {
      'Idempotency-Key': `live-hub-publish:${config.DISCORD_TEST_GUILD_ID}:${channelId}:${messageId}`,
    },
  );

  console.log(
    JSON.stringify(
      {
        hubPublished: true,
        guildId: config.DISCORD_TEST_GUILD_ID,
        channelId,
        messageId,
        panelId: published.id ?? panelId,
        opaqueId: opaquePanelId,
        status: published.status ?? 'active',
        jumpUrl: `https://discord.com/channels/${config.DISCORD_TEST_GUILD_ID}/${channelId}/${messageId}`,
      },
      null,
      2,
    ),
  );
}

async function cmdStatus(channelId: string) {
  const panels = await activityRequest(
    'GET',
    `/activity/v1/panels?guildId=${encodeURIComponent(config.DISCORD_TEST_GUILD_ID)}`,
  );
  console.log(JSON.stringify({ channelId, panels }, null, 2));
}

async function main() {
  if (command === 'channels') {
    await cmdChannels();
    return;
  }
  const channelId = await resolveChannelId();
  if (command === 'seed') {
    await cmdSeed(channelId);
    return;
  }
  if (command === 'publish') {
    await cmdSeed(channelId);
    await cmdPublish(channelId);
    return;
  }
  if (command === 'status') {
    await cmdStatus(channelId);
    return;
  }
  console.error('Usage: live-centrum-hub.mts <channels|seed|publish|status>');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
