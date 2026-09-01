/**
 * Non-destructive TEST Discord product smoke for task 004 acceptance.
 * Verifies hub select options and scans recent bot DMs for LFG action labels.
 */
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
const hubChannelId = '1534228693449179146';
const guildId = config.DISCORD_TEST_GUILD_ID ?? '1534228693017432124';
const ownerDiscordId = '808066932753563668';

function report(marker: string, pass: boolean, detail: string): void {
  console.log(`${marker}=${pass ? 'PASS' : 'FAIL'} ${detail}`);
}

const me = (await rest.get(Routes.user('@me'))) as { id: string };
const messages = (await rest.get(Routes.channelMessages(hubChannelId), {
  query: new URLSearchParams({ limit: '20' }),
})) as Array<Record<string, unknown>>;

const hub = messages.find((msg) => {
  if ((msg.author as { id?: string } | undefined)?.id !== me.id) return false;
  const raw = JSON.stringify(msg);
  return raw.includes('V2 Centrum') || raw.includes('Wybierz działanie');
});

const hubRaw = hub ? JSON.stringify(hub) : '';
const profileInHub = hubRaw.includes('Mój profil');
const lfgInHub = hubRaw.includes('Szukam ekipy');
report(
  'PROFILE_LIVE_SMOKE',
  profileInHub,
  profileInHub ? 'hub select lists Mój profil' : 'missing from hub',
);
report('LFG_LIVE_SMOKE', lfgInHub, lfgInHub ? 'hub select lists Szukam ekipy' : 'missing from hub');

let dmPass = false;
let dmDetail = 'no LFG DM with action buttons found';
try {
  const dmChannels = (await rest.get(Routes.userChannels())) as Array<{
    id: string;
    recipients?: Array<{ id: string }>;
  }>;
  for (const channel of dmChannels.slice(0, 15)) {
    const recipientId = channel.recipients?.[0]?.id;
    if (recipientId !== ownerDiscordId) continue;
    const dmMessages = (await rest.get(Routes.channelMessages(channel.id), {
      query: new URLSearchParams({ limit: '10' }),
    })) as Array<Record<string, unknown>>;
    for (const dm of dmMessages) {
      const raw = JSON.stringify(dm);
      const hasJoin = raw.includes('Dołącz');
      const hasView = raw.includes('Zobacz');
      const hasDismiss = raw.includes('Nie teraz');
      const hasMute = raw.includes('Wycisz');
      if (hasJoin || hasView || hasDismiss || hasMute) {
        dmPass = hasJoin && hasView && hasDismiss && hasMute;
        dmDetail = `DM channel ${channel.id} buttons join=${hasJoin} view=${hasView} dismiss=${hasDismiss} mute=${hasMute}`;
        break;
      }
    }
    if (dmPass) break;
  }
} catch (error) {
  dmDetail = error instanceof Error ? error.message : String(error);
}

report('DM_LIVE_SMOKE', dmPass, dmDetail);

if (hub) {
  console.log(
    JSON.stringify({
      hubMessageId: hub.id,
      edited: hub.edited_timestamp ?? null,
      jumpUrl: `https://discord.com/channels/${guildId}/${hubChannelId}/${hub.id}`,
    }),
  );
}

process.exit(profileInHub && lfgInHub && dmPass ? 0 : 1);
