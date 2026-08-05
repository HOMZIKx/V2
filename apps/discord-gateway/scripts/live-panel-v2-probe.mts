import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@v2/configuration';
import { ChannelType, Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';

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
  throw new Error('Set DISCORD_ENABLED=true before running live panel probe.');
}

const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

try {
  await client.login(config.DISCORD_TOKEN);
  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
    setTimeout(() => reject(new Error('ready timeout')), 25_000);
  });

  const guild = await client.guilds.fetch(config.DISCORD_TEST_GUILD_ID);
  const channels = await guild.channels.fetch();
  const me = guild.members.me ?? (await guild.members.fetchMe());
  let target = null;
  for (const ch of channels.values()) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;
    const perms = ch.permissionsFor(me);
    if (
      perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms.has(PermissionFlagsBits.SendMessages) &&
      perms.has(PermissionFlagsBits.AttachFiles)
    ) {
      target = ch;
      break;
    }
  }

  if (!target) {
    console.error('LIVE_PROBE_FAIL no writable text channel');
    process.exitCode = 2;
  } else {
    const panel = renderPanelMessage({
      signingSecret: config.DISCORD_COMPONENT_SIGNING_SECRET,
    });
    const msg = await target.send(panel);
    console.log(
      JSON.stringify(
        {
          liveProbe: 'ok',
          channelId: target.id,
          messageId: msg.id,
          flags: msg.flags?.bitfield ?? null,
          hasEmbeds: (msg.embeds?.length ?? 0) > 0,
          topComponentTypes: msg.components?.map((c) => c.type) ?? [],
        },
        null,
        2,
      ),
    );
    await msg.delete().catch(() => undefined);
  }
} catch (error) {
  console.error('LIVE_PROBE_FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.destroy();
}
